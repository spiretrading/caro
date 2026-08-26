import * as React from 'react';
import { Container, Node, Orientation, Reference,
  SizePolicy } from '../layout';
import { assemble, attach, detach, flatten, leaves, normalize, parentOf,
  Placement, Side, toOrientation } from './tree';

/** The distance a press must cover before it draws or drags. */
const DRAG_THRESHOLD = 4;

/** The fraction of the cross axis a drawn box must span to expand. */
const FILL_RATIO = 0.8;

/** The smallest a box may be resized to. */
const MINIMUM_SIZE = 1;

/** How thick a box's policy edges are painted. */
const EDGE = 3;

/** How close to an edge the cursor must be to resize a box. */
const RESIZE_MARGIN = 8;

/** How far the delete control sits inside a box's corner. */
const DELETE_INSET = 10;

/** The smallest box that has room for a delete control. */
const DELETE_ROOM = 44;

/** How wide the delete control is drawn. */
const DELETE_DIAMETER = 18;

/** How large the glyph inside the delete control is drawn. */
const GLYPH_SIZE = 13;

/** How large the name inside a box is drawn. */
const LABEL_SIZE = 12;

/** How large the prompt on an empty canvas is drawn. */
const HINT_SIZE = 13;

/** How far apart two edges may be and still count as aligned. */
const ALIGN_TOLERANCE = 0.5;

/** The largest the box following the cursor is drawn. */
const CARRIED_LIMIT = {width: 400, height: 200};

/** The gesture a press has turned into. */
enum Gesture {
  NONE,
  DRAW,
  DRAG,
  RESIZE
}

interface Point {
  x: number;
  y: number;
}

interface Drop {
  target: Node;
  side: Side;
  marker: {left: number, top: number, width: number, height: number};
}

interface Guide {
  vertical: boolean;
  offset: number;
}

interface Properties {

  /** The root of the tree being drawn. */
  root: Node;

  /** How much the canvas is magnified, 1 being its literal size. */
  zoom: number;

  /** The boxes currently selected, empty when none are. */
  selection: Node[];

  /** Called when the selection changes, adding to it rather than replacing
      it when asked. */
  onSelect?: (nodes: Node[], extend: boolean) => void;

  /** Called whenever the layout has been modified. */
  onChange?: () => void;

  /** Called when the selected box is deleted from the canvas. */
  onRemove?: () => void;

  /** Called when a cancelled gesture puts back an earlier root. */
  onRestore?: (root: Node) => void;
}

/** A boundary a resize acts on: the box before it, and the box after it. */
interface Grip {
  side: Side;
  before: Node;
  after: Node;
  beforeExtent: number;
  afterExtent: number;
}

interface Edge {
  node: Node;
  horizontal: Grip[];
  vertical: Grip[];
}

interface State {
  gesture: Gesture;
  origin: Point;
  current: Point;
  carried: Node;
  grab: Point;
  size: {width: number, height: number};
  drop: Drop;
  hover: Edge;
  edge: Edge;
  guides: Guide[];
  aligned: Node[];
}

/** Displays a layout, letting boxes be drawn into it and dragged within it. */
export class LayoutCanvas extends React.Component<Properties, State> {
  constructor(props: Properties) {
    super(props);
    this.state = {
      gesture: Gesture.NONE,
      origin: null,
      current: null,
      carried: null,
      grab: null,
      size: null,
      drop: null,
      hover: null,
      edge: null,
      guides: [],
      aligned: []
    };
    this.elements = new Map<Node, HTMLElement>();
    this.identifiers = new WeakMap<Node, string>();
    this.count = 0;
    this.pending = null;
    this.extend = false;
    this.frozen = null;
  }

  public render(): JSX.Element {
    const root = this.props.root;
    if(!(root instanceof Container)) {
      return (
        <div style={LayoutCanvas.STYLE.message}>
          This layout has no container at its root.
        </div>);
    }
    return (
      <React.Fragment>
        <div ref={element => this.container = element}
            style={{...LayoutCanvas.STYLE.container, zoom: this.props.zoom,
              flexDirection: LayoutCanvas.toDirection(root.orientation)}}
            onMouseDown={this.onMouseDown} onMouseMove={this.onHover}
            onMouseLeave={this.onLeave}>
          {root.children.map(child =>
            this.renderNode(child, root.orientation))}
          {this.renderRubberBand()}
          {this.renderMarker()}
          {this.state.guides.map(this.renderGuide)}
          {root.children.length === 0 &&
            <div style={{...LayoutCanvas.STYLE.hint,
              fontSize: `${this.local(HINT_SIZE)}px`}}>
              Drag to draw a box.
            </div>}
        </div>
        {this.renderCarried()}
      </React.Fragment>);
  }

  public componentDidUpdate(): void {
    const alignment = this.measureGuides();
    if(!LayoutCanvas.matches(alignment.guides, this.state.guides) ||
        !LayoutCanvas.same(alignment.aligned, this.state.aligned)) {
      this.setState({guides: alignment.guides, aligned: alignment.aligned});
    }
  }

  public componentWillUnmount(): void {
    this.detachListeners();
  }

  private container: HTMLDivElement;
  private elements: Map<Node, HTMLElement>;
  private snapshot: Node;
  private bounds: DOMRect;
  private inset: Point;
  private identifiers: WeakMap<Node, string>;
  private count: number;
  private pending: Node[];
  private extend: boolean;
  private frozen: Map<Node, DOMRect>;

  private renderNode(node: Node, orientation: Orientation): JSX.Element {
    if(node instanceof Container) {
      return (
        <div key={this.keyOf(node)}
            style={{...LayoutCanvas.STYLE.group,
              ...LayoutCanvas.toFlex(node, orientation),
              flexDirection: LayoutCanvas.toDirection(node.orientation)}}>
          {node.children.map(child =>
            this.renderNode(child, node.orientation))}
        </div>);
    }
    return this.renderBox(node, orientation);
  }

  private keyOf(node: Node): string {
    const identifier = this.identifiers.get(node);
    if(identifier !== undefined) {
      return identifier;
    }
    this.count += 1;
    const assigned = `node-${this.count}`;
    this.identifiers.set(node, assigned);
    return assigned;
  }

  private renderBox(node: Node, orientation: Orientation): JSX.Element {
    const label = LayoutCanvas.labelOf(node);
    const selection = (() => {
      if(this.props.selection.indexOf(node) !== -1) {
        return LayoutCanvas.STYLE.selected;
      }
      return {};
    })();
    const phantom = (() => {
      const carried = this.state.carried;
      if(carried === null || !this.isActive()) {
        return {};
      }
      if(node === carried || leaves(carried).indexOf(node) !== -1) {
        return LayoutCanvas.STYLE.phantom;
      }
      return {};
    })();
    const alignment = (() => {
      if(this.state.aligned.indexOf(node) === -1) {
        return {};
      }
      return LayoutCanvas.STYLE.aligned;
    })();
    const paint = LayoutCanvas.paintFor(node);
    const cursor = (() => {
      const edge = this.state.edge ?? this.state.hover;
      if(edge === null || !LayoutCanvas.involves(edge, node)) {
        return {};
      }
      return {cursor: LayoutCanvas.cursorFor(edge)};
    })();
    return (
      <div key={this.keyOf(node)} data-keeps-selection=''
          ref={element => this.register(node, element)}
          style={{...LayoutCanvas.STYLE.box,
            ...LayoutCanvas.toFlex(node, orientation),
            ...selection, ...phantom, ...paint, ...alignment, ...cursor}}>
        {label !== '' &&
          <span style={{...LayoutCanvas.STYLE.label,
            ...LayoutCanvas.inkFor(node),
            fontSize: `${this.local(LABEL_SIZE)}px`}}>{label}</span>}
        {this.renderDelete(node)}
      </div>);
  }

  private renderDelete(node: Node): JSX.Element {
    if(this.props.selection.length !== 1 ||
        this.props.selection[0] !== node ||
        this.state.gesture !== Gesture.NONE) {
      return null;
    }
    const element = this.elements.get(node);
    if(element === undefined) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    if(rect.width < DELETE_ROOM || rect.height < DELETE_ROOM) {
      return null;
    }
    return (
      <button style={{...LayoutCanvas.STYLE.remove,
          top: `${this.local(DELETE_INSET)}px`,
          right: `${this.local(DELETE_INSET)}px`,
          width: `${this.local(DELETE_DIAMETER)}px`,
          height: `${this.local(DELETE_DIAMETER)}px`,
          borderRadius: `${this.local(DELETE_DIAMETER / 2)}px`,
          fontSize: `${this.local(GLYPH_SIZE)}px`}} title='Delete'
        onMouseDown={this.onRemove}>{'\u00D7'}</button>);
  }

  private onRemove = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    this.props.onRemove?.();
  }

  private renderGuide = (guide: Guide, index: number) => {
    const offset = this.local(guide.offset);
    const style = (() => {
      if(guide.vertical) {
        return {left: `${offset}px`, top: 0, bottom: 0, width: '1px'};
      }
      return {top: `${offset}px`, left: 0, right: 0, height: '1px'};
    })();
    return (
      <div key={index}
        style={{...LayoutCanvas.STYLE.guide, ...style}}/>);
  }

  /** Measures what the edge being resized lines up with. A drag has nothing
      to measure: the box is already sitting where it would land, so its
      edges meet its neighbours' whatever the cursor does, and a guide that
      cannot fail to appear says nothing. */
  private measureGuides(): {guides: Guide[], aligned: Node[]} {
    if(this.state.gesture !== Gesture.RESIZE) {
      return LayoutCanvas.NOTHING;
    }
    const moving = [] as Node[];
    const verticals = [] as number[];
    const horizontals = [] as number[];
    const edge = this.state.edge;
    for(const grip of edge.horizontal) {
      const rect = this.boundaryOf(grip, moving);
      if(rect === null) {
        return LayoutCanvas.NOTHING;
      }
      verticals.push(rect.right);
    }
    for(const grip of edge.vertical) {
      const rect = this.boundaryOf(grip, moving);
      if(rect === null) {
        return LayoutCanvas.NOTHING;
      }
      horizontals.push(rect.bottom);
    }
    const guides = [] as Guide[];
    const aligned = [] as Node[];
    const root = this.props.root as Container;
    for(const other of leaves(root)) {
      if(moving.indexOf(other) !== -1) {
        continue;
      }
      const sibling = this.elements.get(other);
      if(sibling === undefined) {
        continue;
      }
      const bounds = sibling.getBoundingClientRect();
      const across = LayoutCanvas.collect(guides, verticals,
        [bounds.left, bounds.right], this.inset.x, true);
      const down = LayoutCanvas.collect(guides, horizontals,
        [bounds.top, bounds.bottom], this.inset.y, false);
      if(across || down) {
        aligned.push(other);
      }
    }
    if(aligned.length > 0) {
      aligned.push(...moving);
    }
    return {guides, aligned};
  }

  private boundaryOf(grip: Grip, moving: Node[]): DOMRect {
    if(moving.indexOf(grip.before) === -1) {
      moving.push(grip.before);
    }
    if(grip.after !== null && moving.indexOf(grip.after) === -1) {
      moving.push(grip.after);
    }
    const element = this.elements.get(grip.before);
    if(element === undefined) {
      return null;
    }
    return element.getBoundingClientRect();
  }

  private static collect(guides: Guide[], moving: number[],
      edges: number[], origin: number, vertical: boolean): boolean {
    let found = false;
    for(const position of moving) {
      for(const edge of edges) {
        if(Math.abs(position - edge) > ALIGN_TOLERANCE) {
          continue;
        }
        found = true;
        const offset = edge - origin;
        const known = guides.some(guide => guide.vertical === vertical &&
          Math.abs(guide.offset - offset) <= ALIGN_TOLERANCE);
        if(!known) {
          guides.push({vertical, offset});
        }
      }
    }
    return found;
  }

  private static same(left: Node[], right: Node[]): boolean {
    if(left.length !== right.length) {
      return false;
    }
    for(let i = 0; i < left.length; ++i) {
      if(left[i] !== right[i]) {
        return false;
      }
    }
    return true;
  }

  private static matches(left: Guide[], right: Guide[]): boolean {
    if(left.length !== right.length) {
      return false;
    }
    for(let i = 0; i < left.length; ++i) {
      if(left[i].vertical !== right[i].vertical ||
          Math.abs(left[i].offset - right[i].offset) > ALIGN_TOLERANCE) {
        return false;
      }
    }
    return true;
  }

  private renderRubberBand(): JSX.Element {
    if(this.state.gesture !== Gesture.DRAW || !this.isActive()) {
      return null;
    }
    const region = this.measure();
    return (
      <div style={{...LayoutCanvas.STYLE.rubberBand,
        left: `${this.local(region.x - this.inset.x)}px`,
        top: `${this.local(region.y - this.inset.y)}px`,
        width: `${this.local(region.width)}px`,
        height: `${this.local(region.height)}px`}}/>);
  }

  private renderMarker(): JSX.Element {
    if(this.state.gesture !== Gesture.DRAW || !this.isActive() ||
        this.state.drop === null) {
      return null;
    }
    const marker = this.state.drop.marker;
    return (
      <div style={{...LayoutCanvas.STYLE.marker, left: `${marker.left}px`,
        top: `${marker.top}px`, width: `${marker.width}px`,
        height: `${marker.height}px`}}/>);
  }

  private renderCarried(): JSX.Element {
    if(this.state.gesture !== Gesture.DRAG || !this.isActive()) {
      return null;
    }
    const node = this.state.carried;
    const place = {
      left: `${this.state.current.x - this.state.grab.x}px`,
      top: `${this.state.current.y - this.state.grab.y}px`
    };
    if(node instanceof Container) {
      return (
        <div style={{...LayoutCanvas.STYLE.carried, ...place,
            alignItems: 'flex-start', justifyContent: 'flex-start',
            width: `${Math.min(this.state.size.width,
              CARRIED_LIMIT.width)}px`,
            height: `${Math.min(this.state.size.height,
              CARRIED_LIMIT.height)}px`}}>
          <div style={{zoom: this.props.zoom, display: 'flex',
              flexDirection: LayoutCanvas.toDirection(node.orientation),
              width: `${node.width}px`, height: `${node.height}px`}}>
            {node.children.map(child =>
              this.renderGhost(child, node.orientation))}
          </div>
        </div>);
    }
    const label = LayoutCanvas.labelOf(node);
    return (
      <div style={{...LayoutCanvas.STYLE.carried, ...place,
        width: `${Math.min(this.state.size.width, CARRIED_LIMIT.width)}px`,
        height: `${Math.min(this.state.size.height, CARRIED_LIMIT.height)}px`,
        ...LayoutCanvas.paintFor(node)}}>
        {label !== '' &&
          <span style={{...LayoutCanvas.STYLE.label,
            ...LayoutCanvas.inkFor(node)}}>{label}</span>}
      </div>);
  }

  /** Draws a tree the way the canvas does, but as a picture: nothing is
      registered, so the boxes being carried keep the geometry they have
      where they actually sit. */
  private renderGhost(node: Node, orientation: Orientation): JSX.Element {
    if(node instanceof Container) {
      return (
        <div key={this.keyOf(node)}
            style={{...LayoutCanvas.STYLE.group,
              ...LayoutCanvas.toFlex(node, orientation),
              flexDirection: LayoutCanvas.toDirection(node.orientation)}}>
          {node.children.map(child =>
            this.renderGhost(child, node.orientation))}
        </div>);
    }
    const label = LayoutCanvas.labelOf(node);
    return (
      <div key={this.keyOf(node)}
          style={{...LayoutCanvas.STYLE.box,
            ...LayoutCanvas.toFlex(node, orientation),
            ...LayoutCanvas.paintFor(node)}}>
        {label !== '' &&
          <span style={{...LayoutCanvas.STYLE.label,
            ...LayoutCanvas.inkFor(node),
            fontSize: `${this.local(LABEL_SIZE)}px`}}>{label}</span>}
      </div>);
  }

  private edgeAt(point: Point): Edge {
    const node = this.boxAt(point);
    if(node === null) {
      return null;
    }
    const group = this.chosen(node);
    if(group.length > 1) {
      return this.groupEdgeAt(point, node, group);
    }
    const rect = this.elements.get(node).getBoundingClientRect();
    const across = Math.min(RESIZE_MARGIN, rect.width / 3);
    const down = Math.min(RESIZE_MARGIN, rect.height / 3);
    const horizontal = (() => {
      if(point.x - rect.left <= across) {
        return LayoutCanvas.only(this.gripFor(node, Side.LEFT));
      } else if(rect.right - point.x <= across) {
        return LayoutCanvas.only(this.gripFor(node, Side.RIGHT));
      }
      return [];
    })();
    const vertical = (() => {
      if(point.y - rect.top <= down) {
        return LayoutCanvas.only(this.gripFor(node, Side.TOP));
      } else if(rect.bottom - point.y <= down) {
        return LayoutCanvas.only(this.gripFor(node, Side.BOTTOM));
      }
      return [];
    })();
    if(horizontal.length === 0 && vertical.length === 0) {
      return null;
    }
    return {node, horizontal, vertical};
  }

  private groupEdgeAt(point: Point, node: Node, group: Node[]): Edge {
    const region = this.regionOf(group);
    if(region === null) {
      return null;
    }
    const across = Math.min(RESIZE_MARGIN, (region.right - region.left) / 3);
    const down = Math.min(RESIZE_MARGIN, (region.bottom - region.top) / 3);
    const horizontal = (() => {
      if(point.x - region.left <= across) {
        return this.gripsAlong(group, Side.LEFT, region.left);
      } else if(region.right - point.x <= across) {
        return this.gripsAlong(group, Side.RIGHT, region.right);
      }
      return [];
    })();
    const vertical = (() => {
      if(point.y - region.top <= down) {
        return this.gripsAlong(group, Side.TOP, region.top);
      } else if(region.bottom - point.y <= down) {
        return this.gripsAlong(group, Side.BOTTOM, region.bottom);
      }
      return [];
    })();
    if(horizontal.length === 0 && vertical.length === 0) {
      return null;
    }
    return {node, horizontal, vertical};
  }

  private gripsAlong(group: Node[], side: Side, edge: number): Grip[] {
    const found = [] as Grip[];
    for(const node of group) {
      const element = this.elements.get(node);
      if(element === undefined) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      const own = (() => {
        if(side === Side.LEFT) {
          return rect.left;
        } else if(side === Side.RIGHT) {
          return rect.right;
        } else if(side === Side.TOP) {
          return rect.top;
        }
        return rect.bottom;
      })();
      if(Math.abs(own - edge) > 1) {
        continue;
      }
      const grip = this.gripFor(node, side);
      if(grip !== null) {
        found.push(grip);
      }
    }
    return found;
  }

  private static only(grip: Grip): Grip[] {
    if(grip === null) {
      return [];
    }
    return [grip];
  }

  /** Returns the selected boxes of this canvas in visual order, and nothing
      at all when a press on one of them is a press on a single box. */
  private chosen(picked: Node): Node[] {
    if(picked === null || this.props.selection.length < 2) {
      return [];
    }
    const root = this.props.root as Container;
    const found = leaves(root).filter(node =>
      this.props.selection.indexOf(node) !== -1);
    if(found.length < 2 || found.indexOf(picked) === -1) {
      return [];
    }
    return found;
  }

  /** Returns where a box is, or where it was when the drag began. A drag
      reflows the layout to show what dropping would do, so the geometry it
      is resolved against has to be held still, or the reflow would decide
      the next placement and the placement would decide the next reflow. */
  private rectOf(node: Node): DOMRect {
    if(this.frozen !== null) {
      const held = this.frozen.get(node);
      if(held !== undefined) {
        return held;
      }
    }
    const element = this.elements.get(node);
    if(element === undefined) {
      return null;
    }
    return element.getBoundingClientRect();
  }

  private freeze(): void {
    const root = this.props.root as Container;
    this.frozen = new Map<Node, DOMRect>();
    for(const node of leaves(root)) {
      const element = this.elements.get(node);
      if(element !== undefined) {
        this.frozen.set(node, element.getBoundingClientRect());
      }
    }
  }

  private regionOf(nodes: Node | Node[]) {
    const boxes = (() => {
      if(Array.isArray(nodes)) {
        return nodes;
      }
      return leaves(nodes);
    })();
    const rects = boxes.map(node => this.rectOf(node))
      .filter(rect => rect !== null);
    if(rects.length === 0) {
      return null;
    }
    return {
      left: Math.min(...rects.map(rect => rect.left)),
      right: Math.max(...rects.map(rect => rect.right)),
      top: Math.min(...rects.map(rect => rect.top)),
      bottom: Math.max(...rects.map(rect => rect.bottom))
    };
  }

  /** Lifts a set of boxes out of the tree and puts them back as one node,
      arranged the way they are drawn. */
  private gather(nodes: Node[]): Node {
    const root = this.props.root as Container;
    const placements = [] as Placement[];
    for(const node of nodes) {
      const element = this.elements.get(node);
      if(element === undefined) {
        return nodes[0];
      }
      const rect = element.getBoundingClientRect();
      placements.push({node, x: rect.left, y: rect.top,
        width: rect.width, height: rect.height});
    }
    const group = assemble(placements);
    if(group === null) {
      return nodes[0];
    }
    const anchor = nodes[0];
    for(const node of nodes) {
      if(node !== anchor) {
        detach(root, node);
      }
    }
    const parent = parentOf(root, anchor);
    if(parent === null) {
      return anchor;
    }
    parent.children.splice(parent.children.indexOf(anchor), 1, group);
    return group;
  }

  private gripFor(node: Node, side: Side): Grip {
    const root = this.props.root as Container;
    const parent = parentOf(root, node);
    if(parent === null) {
      return null;
    }
    const leading = side === Side.TOP || side === Side.LEFT;
    if(parent.orientation !== toOrientation(side)) {
      if(leading) {
        return null;
      }
      return this.gripOf(side, node, null);
    }
    const index = parent.children.indexOf(node);
    const partner = (() => {
      if(leading) {
        return parent.children[index - 1];
      }
      return parent.children[index + 1];
    })();
    if(partner === undefined) {
      if(leading) {
        return null;
      }
      return this.gripOf(side, node, null);
    }
    if(partner instanceof Container) {
      return null;
    }
    if(leading) {
      return this.gripOf(side, partner, node);
    }
    return this.gripOf(side, node, partner);
  }

  private gripOf(side: Side, before: Node, after: Node): Grip {
    const vertical = side === Side.TOP || side === Side.BOTTOM;
    const afterExtent = (() => {
      if(after === null) {
        return 0;
      }
      return this.extentOf(after, vertical);
    })();
    return {side, before, after,
      beforeExtent: this.extentOf(before, vertical), afterExtent};
  }

  private extentOf(node: Node, vertical: boolean): number {
    const element = this.elements.get(node);
    if(element === undefined) {
      return 0;
    }
    const rect = element.getBoundingClientRect();
    if(vertical) {
      return this.local(rect.height);
    }
    return this.local(rect.width);
  }

  private onHover = (event: React.MouseEvent) => {
    if(this.state.gesture !== Gesture.NONE) {
      return;
    }
    const edge = this.edgeAt({x: event.clientX, y: event.clientY});
    const hover = this.state.hover;
    if(edge === null && hover === null) {
      return;
    }
    if(edge !== null && hover !== null && edge.node === hover.node &&
        LayoutCanvas.sameGrip(edge.horizontal, hover.horizontal) &&
        LayoutCanvas.sameGrip(edge.vertical, hover.vertical)) {
      return;
    }
    this.setState({hover: edge});
  }

  private onLeave = () => {
    if(this.state.hover !== null) {
      this.setState({hover: null});
    }
  }

  private resize(point: Point): void {
    const edge = this.state.edge;
    for(const grip of edge.horizontal) {
      LayoutCanvas.apply(grip, this.local(point.x - this.state.origin.x),
        false);
    }
    for(const grip of edge.vertical) {
      LayoutCanvas.apply(grip, this.local(point.y - this.state.origin.y),
        true);
    }
    normalize(this.props.root);
    this.props.onChange?.();
  }

  private static apply(grip: Grip, delta: number, vertical: boolean): void {
    const upper = (() => {
      if(grip.after === null) {
        return Infinity;
      }
      return grip.afterExtent - MINIMUM_SIZE;
    })();
    const shift = Math.min(
      Math.max(delta, MINIMUM_SIZE - grip.beforeExtent), upper);
    LayoutCanvas.size(grip.before, vertical,
      Math.round(grip.beforeExtent + shift));
    if(grip.after === null) {
      return;
    }
    LayoutCanvas.size(grip.after, vertical,
      Math.round(grip.afterExtent - shift));
  }

  private static size(node: Node, vertical: boolean, extent: number): void {
    const measure = Math.max(MINIMUM_SIZE, extent);
    if(vertical) {
      node.height = measure;
      return;
    }
    node.width = measure;
  }

  private static sameGrip(left: Grip[], right: Grip[]): boolean {
    if(left.length !== right.length) {
      return false;
    }
    return left.every((grip, index) => grip.before === right[index].before &&
      grip.after === right[index].after);
  }

  private static involves(edge: Edge, node: Node): boolean {
    if(edge.node === node) {
      return true;
    }
    for(const grip of [...edge.horizontal, ...edge.vertical]) {
      if(grip.before === node || grip.after === node) {
        return true;
      }
    }
    return false;
  }

  private static cursorFor(edge: Edge): string {
    if(edge.horizontal.length === 0) {
      return 'ns-resize';
    }
    if(edge.vertical.length === 0) {
      return 'ew-resize';
    }
    const falling = (edge.horizontal[0].side === Side.LEFT) ===
      (edge.vertical[0].side === Side.TOP);
    if(falling) {
      return 'nwse-resize';
    }
    return 'nesw-resize';
  }

  private static paintFor(node: Node) {
    const same = node.widthPolicy === node.heightPolicy;
    const across = (() => {
      if(same) {
        return LayoutCanvas.POLICY_EDGE[node.widthPolicy];
      }
      return LayoutCanvas.POLICY_COLOR[node.widthPolicy];
    })();
    const down = (() => {
      if(same) {
        return LayoutCanvas.POLICY_EDGE[node.heightPolicy];
      }
      return LayoutCanvas.POLICY_COLOR[node.heightPolicy];
    })();
    const boxShadow = `inset ${EDGE}px 0 0 0 ${across}, ` +
      `inset -${EDGE}px 0 0 0 ${across}, ` +
      `inset 0 ${EDGE}px 0 0 ${down}, ` +
      `inset 0 -${EDGE}px 0 0 ${down}`;
    if(!same) {
      return {boxShadow};
    }
    return {
      boxShadow,
      backgroundColor: LayoutCanvas.POLICY_COLOR[node.widthPolicy]
    };
  }

  private static inkFor(node: Node) {
    if(node.widthPolicy !== node.heightPolicy) {
      return {};
    }
    return {color: LayoutCanvas.POLICY_INK[node.widthPolicy]};
  }

  private static labelOf(node: Node): string {
    if(node instanceof Reference && node.name !== '') {
      return `<${node.name}>`;
    }
    return '';
  }

  private register(node: Node, element: HTMLElement): void {
    if(element === null) {
      return;
    }
    this.elements.set(node, element);
  }

  private isActive(): boolean {
    if(this.state.gesture === Gesture.NONE) {
      return false;
    }
    const region = this.measure();
    return region.width >= DRAG_THRESHOLD || region.height >= DRAG_THRESHOLD;
  }

  private centre(): Point {
    const region = this.measure();
    return {
      x: region.x + region.width / 2,
      y: region.y + region.height / 2
    };
  }

  private measure() {
    const origin = this.state.origin;
    const current = this.state.current;
    return {
      x: Math.min(origin.x, current.x),
      y: Math.min(origin.y, current.y),
      width: Math.abs(current.x - origin.x),
      height: Math.abs(current.y - origin.y)
    };
  }

  private boxAt(point: Point): Node {
    const root = this.props.root as Container;
    for(const node of leaves(root)) {
      const element = this.elements.get(node);
      if(element === undefined) {
        continue;
      }
      const rect = this.rectOf(node);
      if(rect !== null && point.x >= rect.left && point.x <= rect.right &&
          point.y >= rect.top && point.y <= rect.bottom) {
        return node;
      }
    }
    return null;
  }

  private resolve(point: Point): Drop {
    const root = this.props.root as Container;
    const carried = (() => {
      if(this.state.carried === null) {
        return [];
      }
      return leaves(this.state.carried);
    })();
    if(this.state.carried !== null) {
      const region = this.regionOf(this.state.carried);
      if(region !== null && point.x >= region.left && point.x <= region.right &&
          point.y >= region.top && point.y <= region.bottom) {
        return this.state.drop;
      }
      if(!LayoutCanvas.within(point, this.bounds)) {
        return this.state.drop;
      }
    }
    const candidates = leaves(root).filter(node =>
      node !== this.state.carried && carried.indexOf(node) === -1);
    if(candidates.length === 0) {
      return null;
    }
    const hit = candidates.find(node => {
      const rect = this.rectOf(node);
      if(rect === null) {
        return false;
      }
      return LayoutCanvas.within(point, rect);
    });
    if(hit !== undefined) {
      const side = this.sideOf(hit, point);
      return {target: hit, side, marker: this.markerFor(hit, side)};
    }
    const near = this.nearest(candidates, point);
    if(near === null) {
      return this.state.drop;
    }
    const side = LayoutCanvas.beyond(
      this.elements.get(near).getBoundingClientRect(), point);
    return {target: near, side, marker: this.markerFor(near, side)};
  }

  private markerFor(target: Node, side: Side) {
    const rect = this.rectOf(target);
    if(side === Side.LEFT || side === Side.RIGHT) {
      const left = (() => {
        if(side === Side.LEFT) {
          return rect.left;
        }
        return rect.right;
      })();
      return {left: this.local(left - this.inset.x),
        top: this.local(rect.top - this.inset.y), width: 3,
        height: this.local(rect.height)};
    }
    const top = (() => {
      if(side === Side.TOP) {
        return rect.top;
      }
      return rect.bottom;
    })();
    return {left: this.local(rect.left - this.inset.x),
      top: this.local(top - this.inset.y), width: this.local(rect.width),
      height: 3};
  }

  private nearest(candidates: Node[], point: Point): Node {
    let best = null as Node;
    let distance = Infinity;
    for(const node of candidates) {
      const rect = this.rectOf(node);
      if(rect === null) {
        continue;
      }
      const measure = LayoutCanvas.gap(rect, point);
      if(measure < distance) {
        distance = measure;
        best = node;
      }
    }
    return best;
  }

  private sideOf(target: Node, centre: Point): Side {
    const rect = this.rectOf(target);
    const across = centre.x - (rect.left + rect.width / 2);
    const down = centre.y - (rect.top + rect.height / 2);
    if(Math.abs(across) > Math.abs(down)) {
      if(across < 0) {
        return Side.LEFT;
      }
      return Side.RIGHT;
    }
    if(down < 0) {
      return Side.TOP;
    }
    return Side.BOTTOM;
  }

  /** Returns the middle of the box being carried, which is what decides
      where it lands rather than the cursor, so that a box goes where it
      looks like it is going. */
  private carriedCentre(): Point {
    return {
      x: this.state.current.x - this.state.grab.x + this.state.size.width / 2,
      y: this.state.current.y - this.state.grab.y + this.state.size.height / 2
    };
  }

  private onMouseDown = (event: React.MouseEvent) => {
    const point = {x: event.clientX, y: event.clientY};
    this.bounds = this.container.getBoundingClientRect();
    this.inset = {
      x: this.bounds.left + this.container.clientLeft * this.props.zoom,
      y: this.bounds.top + this.container.clientTop * this.props.zoom
    };
    this.snapshot = this.props.root.clone();
    this.extend = event.shiftKey;
    this.attach();
    event.preventDefault();
    const edge = this.edgeAt(point);
    if(edge !== null) {
      this.setState({
        gesture: Gesture.RESIZE, edge, origin: point, current: point,
        carried: null, grab: null, size: null, drop: null
      });
      if(this.props.selection.indexOf(edge.node) === -1) {
        this.props.onSelect?.([edge.node], false);
      }
      return;
    }
    const carried = this.boxAt(point);
    const group = (() => {
      if(this.extend) {
        return [];
      }
      return this.chosen(carried);
    })();
    this.pending = (() => {
      if(group.length > 1) {
        return group;
      }
      return null;
    })();
    const gesture = (() => {
      if(carried === null) {
        return Gesture.DRAW;
      }
      return Gesture.DRAG;
    })();
    if(gesture === Gesture.DRAG) {
      this.freeze();
    }
    const region = (() => {
      if(carried === null) {
        return null;
      } else if(group.length > 1) {
        return this.regionOf(group);
      }
      return this.regionOf([carried]);
    })();
    const grab = (() => {
      if(region === null) {
        return null;
      }
      return {x: point.x - region.left, y: point.y - region.top};
    })();
    const size = (() => {
      if(region === null) {
        return null;
      }
      return {width: region.right - region.left,
        height: region.bottom - region.top};
    })();
    this.setState({
      gesture, carried, grab, size, origin: point, current: point, drop: null,
      edge: null
    });
  }

  private attach(): void {
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('keydown', this.onKeyDown);
  }

  private onMouseMove = (event: MouseEvent) => {
    const point = {x: event.clientX, y: event.clientY};
    this.setState({current: point}, () => {
      if(this.state.gesture === Gesture.RESIZE) {
        this.resize(point);
        return;
      }
      if(!this.isActive()) {
        return;
      }
      if(this.state.gesture === Gesture.DRAW) {
        this.setState({drop: this.resolve(this.centre())});
        return;
      }
      if(this.pending !== null) {
        const group = this.gather(this.pending);
        this.pending = null;
        this.setState({carried: group});
        this.props.onChange?.();
        return;
      }
      const drop = this.resolve(this.carriedCentre());
      if(drop === null) {
        return;
      }
      const shown = this.state.drop;
      if(shown !== null && shown.target === drop.target &&
          shown.side === drop.side) {
        return;
      }
      const root = this.props.root as Container;
      detach(root, this.state.carried);
      attach(root, this.state.carried, drop.target, drop.side);
      normalize(root);
      this.setState({drop});
      this.props.onChange?.();
    });
  }

  private onMouseUp = () => {
    this.detachListeners();
    this.pending = null;
    this.frozen = null;
    const gesture = this.state.gesture;
    const drop = this.state.drop;
    const carried = this.state.carried;
    const active = this.isActive();
    const region = this.measure();
    const origin = this.state.origin;
    this.setState({
      gesture: Gesture.NONE, carried: null, grab: null, size: null,
      drop: null, edge: null
    });
    if(gesture === Gesture.RESIZE) {
      return;
    }
    if(!active) {
      const picked = this.boxAt(origin);
      const chosen = (() => {
        if(picked === null) {
          return [];
        }
        return [picked];
      })();
      this.props.onSelect?.(chosen, this.extend);
      return;
    }
    if(gesture === Gesture.DRAG) {
      const settled = this.props.root as Container;
      const chosen = leaves(carried);
      flatten(settled, carried);
      normalize(settled);
      this.props.onSelect?.(chosen, false);
      this.props.onChange?.();
      return;
    }
    const root = this.props.root as Container;
    const node = this.build(region, root);
    if(drop === null) {
      root.children.push(node);
    } else {
      attach(root, node, drop.target, drop.side);
    }
    normalize(root);
    this.props.onSelect?.([node], false);
    this.props.onChange?.();
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if(event.key !== 'Escape') {
      return;
    }
    this.detachListeners();
    this.pending = null;
    this.frozen = null;
    this.props.onRestore?.(this.snapshot);
    this.setState({
      gesture: Gesture.NONE, carried: null, grab: null, size: null,
      drop: null, edge: null
    });
    this.props.onSelect?.([], false);
    this.props.onChange?.();
  }

  private detachListeners(): void {
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private build(region: {width: number, height: number},
      root: Container): Node {
    const widthPolicy = (() => {
      if(root.orientation === Orientation.COLUMN &&
          LayoutCanvas.fills(region.width, this.bounds.width)) {
        return SizePolicy.FILL;
      }
      return SizePolicy.FIXED;
    })();
    const heightPolicy = (() => {
      if(root.orientation === Orientation.ROW &&
          LayoutCanvas.fills(region.height, this.bounds.height)) {
        return SizePolicy.FILL;
      }
      return SizePolicy.FIXED;
    })();
    return new Reference('', Math.round(this.local(region.width)),
      Math.round(this.local(region.height)), widthPolicy, heightPolicy);
  }

  private static fills(extent: number, available: number): boolean {
    return extent >= available * FILL_RATIO && extent <= available;
  }

  private local(value: number): number {
    return value / this.props.zoom;
  }

  private static gap(rect: DOMRect, point: Point): number {
    const x = point.x - Math.min(Math.max(point.x, rect.left), rect.right);
    const y = point.y - Math.min(Math.max(point.y, rect.top), rect.bottom);
    return x * x + y * y;
  }

  private static beyond(rect: DOMRect, point: Point): Side {
    const x = point.x - Math.min(Math.max(point.x, rect.left), rect.right);
    const y = point.y - Math.min(Math.max(point.y, rect.top), rect.bottom);
    if(Math.abs(x) > Math.abs(y)) {
      if(x < 0) {
        return Side.LEFT;
      }
      return Side.RIGHT;
    }
    if(y < 0) {
      return Side.TOP;
    }
    return Side.BOTTOM;
  }

  private static within(point: Point, rect: DOMRect | ClientRect): boolean {
    return point.x >= rect.left && point.x <= rect.right &&
      point.y >= rect.top && point.y <= rect.bottom;
  }


  private static toDirection(orientation: Orientation) {
    if(orientation === Orientation.ROW) {
      return 'row' as 'row';
    }
    return 'column' as 'column';
  }

  private static toFlex(node: Node, orientation: Orientation) {
    const main = (() => {
      if(orientation === Orientation.ROW) {
        return {policy: node.widthPolicy, size: node.width};
      }
      return {policy: node.heightPolicy, size: node.height};
    })();
    const cross = (() => {
      if(orientation === Orientation.ROW) {
        return {policy: node.heightPolicy, size: node.height};
      }
      return {policy: node.widthPolicy, size: node.width};
    })();
    const shrink = (() => {
      if(main.policy === SizePolicy.FILL) {
        return 1;
      }
      return 0;
    })();
    const limit = (() => {
      if(cross.policy === SizePolicy.FILL) {
        return '100%';
      }
      return 'none';
    })();
    const flex = `0 ${shrink} ${main.size}px`;
    if(orientation === Orientation.ROW) {
      return {flex, height: `${cross.size}px`, maxHeight: limit};
    }
    return {flex, width: `${cross.size}px`, maxWidth: limit};
  }

  private static readonly NOTHING = {guides: [] as Guide[],
    aligned: [] as Node[]};

  private static readonly POLICY_COLOR = {
    [SizePolicy.FIXED]: '#FFB800',
    [SizePolicy.FILL]: '#0066FF',
    [SizePolicy.FIT]: '#00BF2D',
    [SizePolicy.REPEAT]: '#744BFF'
  } as {[policy: string]: string};

  private static readonly POLICY_EDGE = {
    [SizePolicy.FIXED]: '#B28100',
    [SizePolicy.FILL]: '#0047B2',
    [SizePolicy.FIT]: '#008620',
    [SizePolicy.REPEAT]: '#5135B2'
  } as {[policy: string]: string};

  private static readonly POLICY_INK = {
    [SizePolicy.FIXED]: '#000000',
    [SizePolicy.FILL]: '#FFFFFF',
    [SizePolicy.FIT]: '#000000',
    [SizePolicy.REPEAT]: '#FFFFFF'
  } as {[policy: string]: string};

  private static readonly STYLE = {
    container: {
      position: 'relative' as 'relative',
      display: 'flex',
      alignSelf: 'flex-start',
      minWidth: '400px',
      minHeight: '300px',
      backgroundColor: '#FFFFFF',
      border: '1px solid #C8C8C8',
      cursor: 'crosshair',
      userSelect: 'none' as 'none'
    },
    group: {
      position: 'relative' as 'relative',
      boxSizing: 'border-box' as 'border-box',
      display: 'flex',
      minWidth: 0,
      minHeight: 0
    },
    box: {
      position: 'relative' as 'relative',
      boxSizing: 'border-box' as 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 0,
      minHeight: 0,
      overflow: 'hidden' as 'hidden',
      backgroundColor: '#FAFAFA',
      cursor: 'move',
      fontSize: '12px'
    },
    selected: {
      backgroundColor: '#EDE7FF',
      outline: '2px solid #684BC7',
      outlineOffset: '-2px'
    },
    remove: {
      position: 'absolute' as 'absolute',
      top: `${DELETE_INSET}px`,
      right: `${DELETE_INSET}px`,
      width: '18px',
      height: '18px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
      border: 'none',
      borderRadius: '9px',
      backgroundColor: '#684BC7',
      color: '#FFFFFF',
      fontSize: '13px',
      lineHeight: '13px',
      cursor: 'pointer'
    },
    phantom: {
      outline: '2px dashed #684BC7',
      outlineOffset: '-2px',
      opacity: 0.6
    },
    label: {
      fontWeight: 700,
      whiteSpace: 'nowrap' as 'nowrap',
      overflow: 'hidden' as 'hidden'
    },
    size: {
      color: '#888888',
      whiteSpace: 'nowrap' as 'nowrap'
    },
    rubberBand: {
      position: 'absolute' as 'absolute',
      boxSizing: 'border-box' as 'border-box',
      border: '2px dashed #684BC7',
      backgroundColor: 'rgba(104, 75, 199, 0.1)',
      pointerEvents: 'none' as 'none'
    },
    marker: {
      position: 'absolute' as 'absolute',
      backgroundColor: '#684BC7',
      pointerEvents: 'none' as 'none'
    },
    aligned: {
      backgroundColor: '#FBE3E4',
      outline: '1px solid #E63F44',
      outlineOffset: '-1px'
    },
    guide: {
      position: 'absolute' as 'absolute',
      backgroundColor: '#E63F44',
      pointerEvents: 'none' as 'none',
      zIndex: 5
    },
    carried: {
      position: 'fixed' as 'fixed',
      zIndex: 10,
      boxSizing: 'border-box' as 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden' as 'hidden',
      backgroundColor: '#FFFFFF',
      opacity: 0.9,
      fontSize: '12px',
      pointerEvents: 'none' as 'none'
    },
    hint: {
      position: 'absolute' as 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      color: '#AAAAAA',
      fontSize: '13px',
      pointerEvents: 'none' as 'none'
    },
    message: {
      padding: '20px',
      fontSize: '13px',
      color: '#555555'
    }
  };
}
