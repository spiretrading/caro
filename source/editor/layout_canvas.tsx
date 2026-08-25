import * as React from 'react';
import { Container, Layout, Node, Orientation, Reference,
  SizePolicy } from '../layout';
import { attach, detach, isPlaced, leaves, normalize, parentOf,
  Side } from './tree';

/** The distance a press must cover before it draws or drags. */
const DRAG_THRESHOLD = 4;

/** The fraction of a box's edge that attaches a box beside it. */
const NEST_ZONE = 0.25;

/** The smallest an edge zone may be, in pixels. */
const NEST_FLOOR = 12;

/** The largest an edge zone may be, in pixels. */
const NEST_LIMIT = 64;

/** The fraction of the cross axis a drawn box must span to expand. */
const FILL_RATIO = 0.8;

/** The largest the box following the cursor is drawn. */
const CARRIED_LIMIT = {width: 400, height: 200};

/** How far the cursor must travel before a drag is placed again. */
const SETTLE_DISTANCE = 3;

/** How far the cursor must travel before a placement may be undone. */
const REVERSAL_DISTANCE = 12;

/** The gesture a press has turned into. */
enum Gesture {
  NONE,
  DRAW,
  DRAG
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

interface Properties {

  /** The layout being edited. */
  layout: Layout;

  /** The currently selected node, null when nothing is selected. */
  selection: Node;

  /** Called when a node is selected, with null when the selection clears. */
  onSelect?: (node: Node) => void;

  /** Called whenever the layout has been modified. */
  onChange?: () => void;
}

interface State {
  gesture: Gesture;
  origin: Point;
  current: Point;
  carried: Node;
  grab: Point;
  size: {width: number, height: number};
  drop: Drop;
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
      drop: null
    };
    this.elements = new Map<Node, HTMLElement>();
    this.identifiers = new WeakMap<Node, string>();
    this.count = 0;
  }

  public render(): JSX.Element {
    const root = this.props.layout.root;
    if(!(root instanceof Container)) {
      return (
        <div style={LayoutCanvas.STYLE.message}>
          This layout has no container at its root.
        </div>);
    }
    return (
      <div style={LayoutCanvas.STYLE.surface}>
        <div ref={element => this.container = element}
            style={{...LayoutCanvas.STYLE.container,
              flexDirection: LayoutCanvas.toDirection(root.orientation)}}
            onMouseDown={this.onMouseDown}>
          {root.children.map(child =>
            this.renderNode(child, root.orientation))}
          {this.renderRubberBand()}
          {this.renderMarker()}
          {root.children.length === 0 &&
            <div style={LayoutCanvas.STYLE.hint}>Drag to draw a box.</div>}
        </div>
        {this.renderCarried()}
      </div>);
  }

  public componentWillUnmount(): void {
    this.detachListeners();
  }

  private container: HTMLDivElement;
  private elements: Map<Node, HTMLElement>;
  private snapshot: Node;
  private bounds: DOMRect;
  private identifiers: WeakMap<Node, string>;
  private count: number;
  private settled: Point;
  private previous: Drop;

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
    const label = (() => {
      if(node instanceof Reference && node.name !== '') {
        return node.name;
      } else if(node instanceof Reference) {
        return '(unnamed)';
      }
      return 'spacer';
    })();
    const selection = (() => {
      if(node === this.props.selection) {
        return LayoutCanvas.STYLE.selected;
      }
      return {};
    })();
    const phantom = (() => {
      if(node === this.state.carried && this.isActive()) {
        return LayoutCanvas.STYLE.phantom;
      }
      return {};
    })();
    return (
      <div key={this.keyOf(node)}
          ref={element => this.register(node, element)}
          style={{...LayoutCanvas.STYLE.box,
            ...LayoutCanvas.toFlex(node, orientation),
            borderLeftColor: LayoutCanvas.POLICY_COLOR[node.widthPolicy],
            borderRightColor: LayoutCanvas.POLICY_COLOR[node.widthPolicy],
            borderTopColor: LayoutCanvas.POLICY_COLOR[node.heightPolicy],
            borderBottomColor: LayoutCanvas.POLICY_COLOR[node.heightPolicy],
            ...selection, ...phantom}}>
        <span style={LayoutCanvas.STYLE.label}>{label}</span>
        <span style={LayoutCanvas.STYLE.size}>
          {node.width} x {node.height}
        </span>
      </div>);
  }

  private renderRubberBand(): JSX.Element {
    if(this.state.gesture !== Gesture.DRAW || !this.isActive()) {
      return null;
    }
    const region = this.measure();
    return (
      <div style={{...LayoutCanvas.STYLE.rubberBand,
        left: `${region.x - this.bounds.left}px`,
        top: `${region.y - this.bounds.top}px`,
        width: `${region.width}px`, height: `${region.height}px`}}/>);
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
    const label = (() => {
      if(node instanceof Reference && node.name !== '') {
        return node.name;
      }
      return '(unnamed)';
    })();
    return (
      <div style={{...LayoutCanvas.STYLE.carried,
        left: `${this.state.current.x - this.state.grab.x}px`,
        top: `${this.state.current.y - this.state.grab.y}px`,
        width: `${Math.min(this.state.size.width, CARRIED_LIMIT.width)}px`,
        height: `${Math.min(this.state.size.height, CARRIED_LIMIT.height)}px`,
        borderLeftColor: LayoutCanvas.POLICY_COLOR[node.widthPolicy],
        borderRightColor: LayoutCanvas.POLICY_COLOR[node.widthPolicy],
        borderTopColor: LayoutCanvas.POLICY_COLOR[node.heightPolicy],
        borderBottomColor: LayoutCanvas.POLICY_COLOR[node.heightPolicy]}}>
        <span style={LayoutCanvas.STYLE.label}>{label}</span>
      </div>);
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
    const root = this.props.layout.root as Container;
    for(const node of leaves(root)) {
      const element = this.elements.get(node);
      if(element === undefined) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if(point.x >= rect.left && point.x <= rect.right &&
          point.y >= rect.top && point.y <= rect.bottom) {
        return node;
      }
    }
    return null;
  }

  private resolve(point: Point): Drop {
    const root = this.props.layout.root as Container;
    if(this.state.carried !== null) {
      const element = this.elements.get(this.state.carried);
      if(element !== undefined &&
          LayoutCanvas.within(point, element.getBoundingClientRect())) {
        return this.state.drop;
      }
      if(!LayoutCanvas.within(point, this.bounds)) {
        return this.state.drop;
      }
    }
    const candidates = leaves(root).filter(
      node => node !== this.state.carried);
    if(candidates.length === 0) {
      return null;
    }
    const hit = candidates.find(node => {
      const element = this.elements.get(node);
      if(element === undefined) {
        return false;
      }
      return LayoutCanvas.within(point, element.getBoundingClientRect());
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
    const rect = this.elements.get(target).getBoundingClientRect();
    if(side === Side.LEFT || side === Side.RIGHT) {
      const left = (() => {
        if(side === Side.LEFT) {
          return rect.left;
        }
        return rect.right;
      })();
      return {left: left - this.bounds.left, top: rect.top - this.bounds.top,
        width: 3, height: rect.height};
    }
    const top = (() => {
      if(side === Side.TOP) {
        return rect.top;
      }
      return rect.bottom;
    })();
    return {left: rect.left - this.bounds.left, top: top - this.bounds.top,
      width: rect.width, height: 3};
  }

  private nearest(candidates: Node[], point: Point): Node {
    let best = null as Node;
    let distance = Infinity;
    for(const node of candidates) {
      const element = this.elements.get(node);
      if(element === undefined) {
        continue;
      }
      const measure = LayoutCanvas.gap(
        element.getBoundingClientRect(), point);
      if(measure < distance) {
        distance = measure;
        best = node;
      }
    }
    return best;
  }

  private sideOf(target: Node, point: Point): Side {
    const root = this.props.layout.root as Container;
    const parent = parentOf(root, target);
    const orientation = (() => {
      if(parent === null) {
        return root.orientation;
      }
      return parent.orientation;
    })();
    const rect = this.elements.get(target).getBoundingClientRect();
    if(orientation === Orientation.COLUMN) {
      const zone = LayoutCanvas.zoneOf(rect.width);
      if(point.x < rect.left + zone) {
        return Side.LEFT;
      } else if(point.x > rect.right - zone) {
        return Side.RIGHT;
      } else if(point.y < rect.top + rect.height / 2) {
        return Side.TOP;
      }
      return Side.BOTTOM;
    }
    const zone = LayoutCanvas.zoneOf(rect.height);
    if(point.y < rect.top + zone) {
      return Side.TOP;
    } else if(point.y > rect.bottom - zone) {
      return Side.BOTTOM;
    } else if(point.x < rect.left + rect.width / 2) {
      return Side.LEFT;
    }
    return Side.RIGHT;
  }

  private onMouseDown = (event: React.MouseEvent) => {
    const point = {x: event.clientX, y: event.clientY};
    this.bounds = this.container.getBoundingClientRect();
    const carried = this.boxAt(point);
    const gesture = (() => {
      if(carried === null) {
        return Gesture.DRAW;
      }
      return Gesture.DRAG;
    })();
    const grab = (() => {
      if(carried === null) {
        return null;
      }
      const rect = this.elements.get(carried).getBoundingClientRect();
      return {x: point.x - rect.left, y: point.y - rect.top};
    })();
    const size = (() => {
      if(carried === null) {
        return null;
      }
      const rect = this.elements.get(carried).getBoundingClientRect();
      return {width: rect.width, height: rect.height};
    })();
    this.snapshot = this.props.layout.root.clone();
    this.settled = null;
    this.previous = null;
    this.setState({
      gesture, carried, grab, size, origin: point, current: point, drop: null
    });
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('keydown', this.onKeyDown);
    event.preventDefault();
  }

  private onMouseMove = (event: MouseEvent) => {
    const point = {x: event.clientX, y: event.clientY};
    this.setState({current: point}, () => {
      if(!this.isActive()) {
        return;
      }
      if(this.state.gesture === Gesture.DRAW) {
        this.setState({drop: this.resolve(this.centre())});
        return;
      }
      if(this.settled !== null && LayoutCanvas.distance(point, this.settled) <
          SETTLE_DISTANCE) {
        return;
      }
      const drop = this.resolve(point);
      if(drop === null || drop === this.state.drop ||
          drop.target === this.state.carried) {
        return;
      }
      if(this.state.drop !== null &&
          this.state.drop.target === drop.target &&
          this.state.drop.side === drop.side) {
        return;
      }
      if(this.previous !== null && this.previous.target === drop.target &&
          this.previous.side === drop.side && this.settled !== null &&
          LayoutCanvas.distance(point, this.settled) < REVERSAL_DISTANCE) {
        return;
      }
      const root = this.props.layout.root as Container;
      if(isPlaced(root, this.state.carried, drop.target, drop.side)) {
        this.setState({drop});
        return;
      }
      detach(root, this.state.carried);
      attach(root, this.state.carried, drop.target, drop.side);
      normalize(root);
      this.previous = this.state.drop;
      this.settled = point;
      this.setState({drop});
      this.props.onChange?.();
    });
  }

  private onMouseUp = () => {
    this.detachListeners();
    const gesture = this.state.gesture;
    const drop = this.state.drop;
    const carried = this.state.carried;
    const active = this.isActive();
    const region = this.measure();
    const origin = this.state.origin;
    this.setState({
      gesture: Gesture.NONE, carried: null, grab: null, size: null, drop: null
    });
    if(!active) {
      this.props.onSelect?.(this.boxAt(origin));
      return;
    }
    if(gesture === Gesture.DRAG) {
      this.props.onSelect?.(carried);
      this.props.onChange?.();
      return;
    }
    const root = this.props.layout.root as Container;
    const node = this.build(region, root);
    if(drop === null) {
      root.children.push(node);
    } else {
      attach(root, node, drop.target, drop.side);
    }
    normalize(root);
    this.props.onSelect?.(node);
    this.props.onChange?.();
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if(event.key !== 'Escape') {
      return;
    }
    this.detachListeners();
    this.props.layout.root = this.snapshot;
    this.setState({
      gesture: Gesture.NONE, carried: null, grab: null, size: null, drop: null
    });
    this.props.onSelect?.(null);
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
          region.width >= this.bounds.width * FILL_RATIO) {
        return SizePolicy.FLEXIBLE;
      }
      return SizePolicy.FIXED;
    })();
    const heightPolicy = (() => {
      if(root.orientation === Orientation.ROW &&
          region.height >= this.bounds.height * FILL_RATIO) {
        return SizePolicy.FLEXIBLE;
      }
      return SizePolicy.FIXED;
    })();
    return new Reference('', Math.round(region.width),
      Math.round(region.height), widthPolicy, heightPolicy);
  }

  private static zoneOf(extent: number): number {
    return Math.min(Math.max(extent * NEST_ZONE, NEST_FLOOR), extent * 0.4,
      NEST_LIMIT);
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

  private static distance(left: Point, right: Point): number {
    const x = left.x - right.x;
    const y = left.y - right.y;
    return Math.sqrt(x * x + y * y);
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
    const flex = (() => {
      if(main.policy === SizePolicy.FLEXIBLE) {
        return '1 1 0';
      } else if(main.policy === SizePolicy.FIXED) {
        return `0 0 ${main.size}px`;
      }
      return '0 0 auto';
    })();
    const crossSize = (() => {
      if(cross.policy === SizePolicy.FLEXIBLE) {
        return '100%';
      } else if(cross.policy === SizePolicy.FIXED) {
        return `${cross.size}px`;
      }
      return 'auto';
    })();
    if(orientation === Orientation.ROW) {
      return {flex, height: crossSize};
    }
    return {flex, width: crossSize};
  }

  private static readonly POLICY_COLOR = {
    [SizePolicy.FIXED]: '#FFB800',
    [SizePolicy.FLEXIBLE]: '#0066FF',
    [SizePolicy.COMPONENT]: '#00BF2D',
    [SizePolicy.REPEAT]: '#744BFF'
  } as {[policy: string]: string};

  private static readonly STYLE = {
    surface: {
      flexGrow: 1,
      display: 'flex',
      padding: '20px',
      overflow: 'auto' as 'auto',
      backgroundColor: '#F5F5F5'
    },
    container: {
      position: 'relative' as 'relative',
      display: 'flex',
      flexGrow: 1,
      minHeight: '400px',
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
      justifyContent: 'space-between',
      gap: '8px',
      padding: '0 8px',
      minWidth: 0,
      minHeight: 0,
      overflow: 'hidden' as 'hidden',
      borderStyle: 'solid' as 'solid',
      borderWidth: '3px',
      backgroundColor: '#FAFAFA',
      cursor: 'move',
      fontSize: '12px'
    },
    selected: {
      backgroundColor: '#EDE7FF',
      outline: '2px solid #684BC7',
      outlineOffset: '-2px'
    },
    phantom: {
      borderStyle: 'dashed' as 'dashed',
      backgroundColor: '#F0ECFF',
      opacity: 0.7
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
      border: '2px dashed #684BC7',
      backgroundColor: 'rgba(104, 75, 199, 0.1)',
      pointerEvents: 'none' as 'none'
    },
    marker: {
      position: 'absolute' as 'absolute',
      backgroundColor: '#684BC7',
      pointerEvents: 'none' as 'none'
    },
    carried: {
      position: 'fixed' as 'fixed',
      zIndex: 10,
      boxSizing: 'border-box' as 'border-box',
      display: 'flex',
      alignItems: 'center',
      padding: '0 8px',
      overflow: 'hidden' as 'hidden',
      borderStyle: 'solid' as 'solid',
      borderWidth: '3px',
      backgroundColor: '#FFFFFF',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
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
