import * as React from 'react';
import { Box, SizePolicy } from '../layout';
import { boxAt, extentOf, push } from './arrange';

/** The distance a press must cover before it draws or drags, in pixels of
    screen. */
const DRAG_THRESHOLD = 4;

/** The fraction of the canvas a drawn box must span to be taken as filling
    it. */
const FILL_RATIO = 0.8;

/** The smallest a box may be resized to. */
const MINIMUM_SIZE = 1;

/** How thick a box's policy edges are painted, in pixels of screen. */
const EDGE = 3;

/** How close to an edge the cursor must be to resize a box, in pixels of
    screen. */
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

/** The smallest a canvas is drawn, whatever it holds. */
const FLOOR = {width: 400, height: 300};

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

interface Guide {
  vertical: boolean;
  offset: number;
}

/** A box and the place it held when a gesture began. */
interface Held {
  box: Box;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The edges a resize has hold of. */
interface Handle {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
}

/** The boxes a press takes hold of, and the edges of them it has. */
interface Grasp {
  handle: Handle;
  boxes: Box[];
}

interface Properties {

  /** The boxes being drawn. */
  boxes: Box[];

  /** How much the canvas is magnified, 1 being its literal size. */
  zoom: number;

  /** The boxes currently selected, empty when none are. */
  selection: Box[];

  /** Called when the selection changes, adding to it rather than replacing
      it when asked, and naming the boxes of the canvas it changed in. */
  onSelect?: (boxes: Box[], extend: boolean, holder: Box[]) => void;

  /** Called whenever the layout has been modified. */
  onChange?: () => void;

  /** Called when the selected box is deleted from the canvas. */
  onRemove?: () => void;
}

interface State {
  gesture: Gesture;
  origin: Point;
  current: Point;
  handle: Handle;
  guides: Guide[];
  aligned: Box[];
}

/** Displays a layout, letting boxes be drawn into it and moved around it. */
export class LayoutCanvas extends React.Component<Properties, State> {
  constructor(props: Properties) {
    super(props);
    this.state = {
      gesture: Gesture.NONE,
      origin: null,
      current: null,
      handle: null,
      guides: [],
      aligned: []
    };
    this.held = [];
    this.settled = [];
    this.active = false;
    this.identifiers = new WeakMap<Box, string>();
    this.count = 0;
    this.extend = false;
    this.pointer = null;
  }

  public render(): JSX.Element {
    const extent = this.extent();
    return (
      <div ref={element => this.container = element} data-canvas=''
          data-keeps-selection=''
          style={{...LayoutCanvas.STYLE.container, zoom: this.props.zoom,
            width: `${extent.width}px`, height: `${extent.height}px`,
            ...LayoutCanvas.cursorFor(this.state.handle)}}
          onMouseDown={this.onMouseDown} onMouseMove={this.onHover}
          onMouseLeave={this.onLeave}>
        {this.props.boxes.map(this.renderBox)}
        {this.renderRubberBand()}
        {this.state.guides.map(this.renderGuide)}
        {this.props.boxes.length === 0 &&
          <div style={{...LayoutCanvas.STYLE.hint,
            fontSize: `${this.local(HINT_SIZE)}px`}}>
            Drag to draw a box.
          </div>}
      </div>);
  }

  public componentDidUpdate(): void {
    if(this.state.gesture !== Gesture.NONE || this.pointer === null ||
        this.container === null) {
      return;
    }
    const handle = this.handleAt(this.pointOf(this.pointer));
    if(LayoutCanvas.sameHandle(handle, this.state.handle)) {
      return;
    }
    this.setState({handle});
  }

  public componentWillUnmount(): void {
    this.detachListeners();
  }

  private container: HTMLDivElement;
  private pointer: {clientX: number, clientY: number};
  private held: Held[];
  private settled: Held[];
  private active: boolean;
  private identifiers: WeakMap<Box, string>;
  private count: number;
  private extend: boolean;
  private origin: Point;

  /** Returns how much room the canvas needs, never less than its floor. */
  private extent() {
    const region = extentOf(this.props.boxes);
    return {
      width: Math.max(region.x + region.width, FLOOR.width),
      height: Math.max(region.y + region.height, FLOOR.height)
    };
  }

  private renderBox = (box: Box) => {
    const label = LayoutCanvas.labelOf(box);
    const selection = (() => {
      if(this.props.selection.indexOf(box) !== -1) {
        return LayoutCanvas.STYLE.selected;
      }
      return {};
    })();
    const alignment = (() => {
      if(this.state.aligned.indexOf(box) === -1) {
        return {};
      }
      return LayoutCanvas.STYLE.aligned;
    })();
    return (
      <div key={this.keyOf(box)} data-keeps-selection=''
          style={{...LayoutCanvas.STYLE.box,
            left: `${box.x}px`, top: `${box.y}px`,
            width: `${box.width}px`, height: `${box.height}px`,
            ...LayoutCanvas.paintFor(box), ...selection, ...alignment,
            ...LayoutCanvas.cursorFor(this.state.handle)}}>
        {label !== '' &&
          <span style={{...LayoutCanvas.STYLE.label,
            ...LayoutCanvas.inkFor(box),
            fontSize: `${this.local(LABEL_SIZE)}px`}}>{label}</span>}
        {this.renderDelete(box)}
      </div>);
  }

  private renderDelete(box: Box): JSX.Element {
    if(this.props.selection.length !== 1 ||
        this.props.selection[0] !== box ||
        this.state.gesture !== Gesture.NONE) {
      return null;
    }
    const room = this.local(DELETE_ROOM);
    if(box.width < room || box.height < room) {
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

  private renderRubberBand(): JSX.Element {
    if(this.state.gesture !== Gesture.DRAW || !this.isActive()) {
      return null;
    }
    const region = this.measure();
    return (
      <div style={{...LayoutCanvas.STYLE.rubberBand,
        left: `${region.x}px`, top: `${region.y}px`,
        width: `${region.width}px`, height: `${region.height}px`}}/>);
  }

  private renderGuide = (guide: Guide, index: number) => {
    const style = (() => {
      if(guide.vertical) {
        return {left: `${guide.offset}px`, top: 0, bottom: 0, width: '1px'};
      }
      return {top: `${guide.offset}px`, left: 0, right: 0, height: '1px'};
    })();
    return (
      <div key={index}
        style={{...LayoutCanvas.STYLE.guide, ...style}}/>);
  }

  /** Converts a length in pixels of screen into one in the layout. */
  private local(value: number): number {
    return value / this.props.zoom;
  }

  /** Converts a place on screen into a place in the layout. */
  private pointOf(place: {clientX: number, clientY: number}): Point {
    const bounds = this.container.getBoundingClientRect();
    return {
      x: this.local(place.clientX - bounds.left) - this.container.clientLeft,
      y: this.local(place.clientY - bounds.top) - this.container.clientTop
    };
  }

  /** Returns the rectangle a press has swept out. */
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

  /** Returns whether a press has become a gesture. Once it has, it stays
      one: a cursor brought back to where it started has still travelled, and
      a drag that stopped counting there would leave the box behind wherever
      it last looked far enough away. */
  private isActive(): boolean {
    if(this.state.gesture === Gesture.NONE) {
      return false;
    }
    if(this.active) {
      return true;
    }
    const region = this.measure();
    const threshold = this.local(DRAG_THRESHOLD);
    this.active = region.width >= threshold || region.height >= threshold;
    return this.active;
  }

  /** Returns the edges of a set of boxes a point has hold of, or null when
      it has hold of none of them, taking a point outside them only when
      asked to reach beyond their edges. */
  private handleFor(boxes: Box[], point: Point, beyond: boolean): Handle {
    if(boxes.length === 0) {
      return null;
    }
    const region = extentOf(boxes);
    const across = Math.min(this.local(RESIZE_MARGIN), region.width / 3);
    const down = Math.min(this.local(RESIZE_MARGIN), region.height / 3);
    const reach = (() => {
      if(beyond) {
        return {across, down};
      }
      return {across: 0, down: 0};
    })();
    if(point.x < region.x - reach.across ||
        point.x > region.x + region.width + reach.across ||
        point.y < region.y - reach.down ||
        point.y > region.y + region.height + reach.down) {
      return null;
    }
    const handle = {
      left: Math.abs(point.x - region.x) <= across,
      right: Math.abs(point.x - (region.x + region.width)) <= across,
      top: Math.abs(point.y - region.y) <= down,
      bottom: Math.abs(point.y - (region.y + region.height)) <= down
    };
    if(!handle.left && !handle.right && !handle.top && !handle.bottom) {
      return null;
    }
    return handle;
  }

  /** Returns what a point takes hold of: the selection when the point is at
      its edges, otherwise the topmost box whose edges it is at, or null when
      it takes hold of nothing. Boxes the point lies within are asked first,
      so that the edge between two touching boxes belongs to the one the
      point is actually over, and a box only reaches past its edges over the
      empty canvas beside it. */
  private grasp(point: Point): Grasp {
    const chosen = this.chosen();
    const held = this.handleFor(chosen, point, true);
    if(held !== null) {
      return {handle: held, boxes: chosen};
    }
    const within = this.nearest(point, false);
    if(within !== null) {
      return within;
    }
    if(boxAt(this.props.boxes, point.x, point.y) !== null) {
      return null;
    }
    return this.nearest(point, true);
  }

  /** Returns the topmost box a point has an edge of, or null when it has
      none of them. */
  private nearest(point: Point, beyond: boolean): Grasp {
    for(let index = this.props.boxes.length - 1; index >= 0; index -= 1) {
      const box = this.props.boxes[index];
      const handle = this.handleFor([box], point, beyond);
      if(handle !== null) {
        return {handle, boxes: [box]};
      }
    }
    return null;
  }

  /** Returns the edges a point has hold of, or null when it has hold of none
      of them. */
  private handleAt(point: Point): Handle {
    const grasp = this.grasp(point);
    if(grasp === null) {
      return null;
    }
    return grasp.handle;
  }

  /** Returns the selected boxes that are on this canvas. */
  private chosen(): Box[] {
    return this.props.boxes.filter(
      box => this.props.selection.indexOf(box) !== -1);
  }

  private onHover = (event: React.MouseEvent) => {
    this.pointer = {clientX: event.clientX, clientY: event.clientY};
    if(this.state.gesture !== Gesture.NONE) {
      return;
    }
    const handle = this.handleAt(this.pointOf(event));
    if(LayoutCanvas.sameHandle(handle, this.state.handle)) {
      return;
    }
    this.setState({handle});
  }

  private onLeave = () => {
    this.pointer = null;
    if(this.state.gesture === Gesture.NONE && this.state.handle !== null) {
      this.setState({handle: null});
    }
  }

  private onMouseDown = (event: React.MouseEvent) => {
    const point = this.pointOf(event);
    this.extend = event.shiftKey;
    this.active = false;
    this.origin = point;
    event.preventDefault();
    this.attach();
    const grasp = (() => {
      if(this.extend) {
        return null;
      }
      return this.grasp(point);
    })();
    if(grasp !== null) {
      this.hold(grasp.boxes);
      if(grasp.boxes.length === 1 &&
          this.props.selection.indexOf(grasp.boxes[0]) === -1) {
        this.props.onSelect?.(grasp.boxes, false, this.props.boxes);
      }
      this.setState({gesture: Gesture.RESIZE, handle: grasp.handle,
        origin: point, current: point});
      return;
    }
    const picked = boxAt(this.props.boxes, point.x, point.y);
    if(picked === null) {
      this.hold([]);
      this.setState({gesture: Gesture.DRAW, handle: null, origin: point,
        current: point});
      return;
    }
    const taken = this.props.selection.indexOf(picked) !== -1;
    const moving = (() => {
      if(this.extend || !taken) {
        return [picked];
      }
      return this.chosen();
    })();
    this.hold(moving);
    if(!this.extend && !taken) {
      this.props.onSelect?.([picked], false, this.props.boxes);
    }
    this.setState({gesture: Gesture.DRAG, handle: null, origin: point,
      current: point});
  }

  /** Remembers where a set of boxes sat when a gesture began, and where
      every other box sat with them. */
  private hold(boxes: Box[]): void {
    this.held = boxes.map(box => ({box, x: box.x, y: box.y,
      width: box.width, height: box.height}));
    this.settled = this.props.boxes.map(box => ({box, x: box.x, y: box.y,
      width: box.width, height: box.height}));
  }

  /** Puts every box back where it stood when the gesture began. A drag shows
      what the layout would be if it ended here, so what gives way has to be
      decided by where the box is now and not by the path the cursor took to
      get there: without this a box shoved aside on the way past stays shoved
      even after the box that shoved it has moved on. */
  private restore(): void {
    for(const held of this.settled) {
      held.box.x = held.x;
      held.box.y = held.y;
      held.box.width = held.width;
      held.box.height = held.height;
    }
  }

  private onMouseMove = (event: MouseEvent) => {
    this.pointer = {clientX: event.clientX, clientY: event.clientY};
    const point = this.pointOf(event);
    this.setState({current: point}, () => {
      if(!this.isActive()) {
        return;
      }
      if(this.state.gesture === Gesture.DRAG) {
        this.move(point);
      } else if(this.state.gesture === Gesture.RESIZE) {
        this.resize(point);
      }
      this.setState(this.measureGuides());
    });
  }

  /** Moves the held boxes by however far the cursor has travelled. */
  private move(point: Point): void {
    this.restore();
    const across = point.x - this.state.origin.x;
    const down = point.y - this.state.origin.y;
    const shift = {
      x: Math.max(across, -Math.min(...this.held.map(held => held.x))),
      y: Math.max(down, -Math.min(...this.held.map(held => held.y)))
    };
    for(const held of this.held) {
      held.box.x = Math.round(held.x + shift.x);
      held.box.y = Math.round(held.y + shift.y);
    }
    push(this.props.boxes, this.held.map(held => held.box));
    this.props.onChange?.();
  }

  /** Resizes the held boxes, moving only the edges the press has hold of. */
  private resize(point: Point): void {
    this.restore();
    const handle = this.state.handle;
    const across = point.x - this.state.origin.x;
    const down = point.y - this.state.origin.y;
    const region = extentOf(this.held.map(held => held.box));
    for(const held of this.held) {
      if(handle.right && held.x + held.width >= region.x + region.width - 1) {
        held.box.width = Math.max(Math.round(held.width + across),
          MINIMUM_SIZE);
      }
      if(handle.left && held.x <= region.x + 1) {
        const width = Math.max(Math.round(held.width - across), MINIMUM_SIZE);
        held.box.x = Math.max(Math.round(held.x + held.width - width), 0);
        held.box.width = width;
      }
      if(handle.bottom &&
          held.y + held.height >= region.y + region.height - 1) {
        held.box.height = Math.max(Math.round(held.height + down),
          MINIMUM_SIZE);
      }
      if(handle.top && held.y <= region.y + 1) {
        const height = Math.max(Math.round(held.height - down), MINIMUM_SIZE);
        held.box.y = Math.max(Math.round(held.y + held.height - height), 0);
        held.box.height = height;
      }
    }
    push(this.props.boxes, this.held.map(held => held.box));
    this.props.onChange?.();
  }

  private onMouseUp = () => {
    this.detachListeners();
    const gesture = this.state.gesture;
    const active = this.isActive();
    const region = this.measure();
    const origin = this.state.origin;
    this.setState({gesture: Gesture.NONE, handle: null, guides: [],
      aligned: []});
    if(!active) {
      if(gesture !== Gesture.RESIZE) {
        const picked = boxAt(this.props.boxes, origin.x, origin.y);
        const chosen = (() => {
          if(picked === null) {
            return [];
          }
          return [picked];
        })();
        this.props.onSelect?.(chosen, this.extend, this.props.boxes);
      }
      return;
    }
    if(gesture !== Gesture.DRAW) {
      this.props.onChange?.();
      return;
    }
    const box = this.build(region);
    this.props.boxes.push(box);
    push(this.props.boxes, [box]);
    this.props.onSelect?.([box], false, this.props.boxes);
    this.props.onChange?.();
  }

  /** Returns a box covering a drawn rectangle. */
  private build(region: {x: number, y: number, width: number,
      height: number}): Box {
    const extent = this.extent();
    const widthPolicy = (() => {
      if(LayoutCanvas.fills(region.width, extent.width)) {
        return SizePolicy.FILL;
      }
      return SizePolicy.FIXED;
    })();
    const heightPolicy = (() => {
      if(LayoutCanvas.fills(region.height, extent.height)) {
        return SizePolicy.FILL;
      }
      return SizePolicy.FIXED;
    })();
    return new Box('', Math.round(region.x), Math.round(region.y),
      Math.max(Math.round(region.width), MINIMUM_SIZE),
      Math.max(Math.round(region.height), MINIMUM_SIZE), widthPolicy,
      heightPolicy);
  }

  private static fills(extent: number, available: number): boolean {
    return extent >= available * FILL_RATIO && extent <= available;
  }

  /** Measures what the boxes being moved line up with. */
  private measureGuides(): {guides: Guide[], aligned: Box[]} {
    const moving = this.held.map(held => held.box);
    if(moving.length === 0) {
      return {guides: [], aligned: []};
    }
    const region = extentOf(moving);
    const verticals = [region.x, region.x + region.width];
    const horizontals = [region.y, region.y + region.height];
    const guides = [] as Guide[];
    const aligned = [] as Box[];
    for(const other of this.props.boxes) {
      if(moving.indexOf(other) !== -1) {
        continue;
      }
      const across = LayoutCanvas.collect(guides, verticals,
        [other.x, other.right], true);
      const down = LayoutCanvas.collect(guides, horizontals,
        [other.y, other.bottom], false);
      if(across || down) {
        aligned.push(other);
      }
    }
    if(aligned.length > 0) {
      aligned.push(...moving);
    }
    return {guides, aligned};
  }

  private static collect(guides: Guide[], moving: number[], edges: number[],
      vertical: boolean): boolean {
    let found = false;
    for(const position of moving) {
      for(const edge of edges) {
        if(Math.abs(position - edge) > ALIGN_TOLERANCE) {
          continue;
        }
        found = true;
        const known = guides.some(guide => guide.vertical === vertical &&
          Math.abs(guide.offset - edge) <= ALIGN_TOLERANCE);
        if(!known) {
          guides.push({vertical, offset: edge});
        }
      }
    }
    return found;
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if(event.key !== 'Escape') {
      return;
    }
    this.detachListeners();
    this.restore();
    this.setState({gesture: Gesture.NONE, handle: null, guides: [],
      aligned: []});
    this.props.onChange?.();
  }

  private attach(): void {
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('keydown', this.onKeyDown);
  }

  private detachListeners(): void {
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private keyOf(box: Box): string {
    const identifier = this.identifiers.get(box);
    if(identifier !== undefined) {
      return identifier;
    }
    this.count += 1;
    const assigned = `box-${this.count}`;
    this.identifiers.set(box, assigned);
    return assigned;
  }

  private static labelOf(box: Box): string {
    if(box.name === '') {
      return '';
    }
    return `<${box.name}>`;
  }

  /** Returns the cursor an edge of the selection is grabbed by. */
  private static cursorFor(handle: Handle) {
    if(handle === null) {
      return {};
    }
    if((handle.left && handle.top) || (handle.right && handle.bottom)) {
      return {cursor: 'nwse-resize'};
    }
    if((handle.right && handle.top) || (handle.left && handle.bottom)) {
      return {cursor: 'nesw-resize'};
    }
    if(handle.left || handle.right) {
      return {cursor: 'ew-resize'};
    }
    return {cursor: 'ns-resize'};
  }

  private static sameHandle(left: Handle, right: Handle): boolean {
    if(left === null || right === null) {
      return left === right;
    }
    return left.left === right.left && left.right === right.right &&
      left.top === right.top && left.bottom === right.bottom;
  }

  private static paintFor(box: Box) {
    const same = box.widthPolicy === box.heightPolicy;
    const across = (() => {
      if(same) {
        return LayoutCanvas.POLICY_EDGE[box.widthPolicy];
      }
      return LayoutCanvas.POLICY_COLOR[box.widthPolicy];
    })();
    const down = (() => {
      if(same) {
        return LayoutCanvas.POLICY_EDGE[box.heightPolicy];
      }
      return LayoutCanvas.POLICY_COLOR[box.heightPolicy];
    })();
    const boxShadow = `inset ${EDGE}px 0 0 0 ${across}, ` +
      `inset -${EDGE}px 0 0 0 ${across}, inset 0 ${EDGE}px 0 0 ${down}, ` +
      `inset 0 -${EDGE}px 0 0 ${down}`;
    if(!same) {
      return {boxShadow};
    }
    return {boxShadow,
      backgroundColor: LayoutCanvas.POLICY_COLOR[box.widthPolicy]};
  }

  private static inkFor(box: Box) {
    if(box.widthPolicy !== box.heightPolicy) {
      return {color: '#000000'};
    }
    return {color: LayoutCanvas.POLICY_INK[box.widthPolicy]};
  }

  private static readonly POLICY_COLOR = {
    [SizePolicy.FIXED]: '#FFB800',
    [SizePolicy.FILL]: '#0066FF',
    [SizePolicy.FIT]: '#00BF2D',
    [SizePolicy.REPEAT]: '#744BFF'
  };

  private static readonly POLICY_EDGE = {
    [SizePolicy.FIXED]: '#B28100',
    [SizePolicy.FILL]: '#0047B2',
    [SizePolicy.FIT]: '#008620',
    [SizePolicy.REPEAT]: '#5135B2'
  };

  private static readonly POLICY_INK = {
    [SizePolicy.FIXED]: '#000000',
    [SizePolicy.FILL]: '#FFFFFF',
    [SizePolicy.FIT]: '#000000',
    [SizePolicy.REPEAT]: '#FFFFFF'
  };

  private static readonly STYLE = {
    container: {
      position: 'relative' as 'relative',
      alignSelf: 'flex-start',
      backgroundColor: '#FFFFFF',
      border: '1px solid #C8C8C8',
      cursor: 'crosshair',
      userSelect: 'none' as 'none'
    },
    box: {
      position: 'absolute' as 'absolute',
      boxSizing: 'border-box' as 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden' as 'hidden',
      backgroundColor: '#FAFAFA',
      cursor: 'move',
      fontSize: '12px'
    },
    selected: {
      outline: '2px solid #684BC7',
      outlineOffset: '-2px'
    },
    aligned: {
      outline: '2px solid #E63F44',
      outlineOffset: '-2px'
    },
    remove: {
      position: 'absolute' as 'absolute',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
      border: 'none',
      backgroundColor: '#684BC7',
      color: '#FFFFFF',
      cursor: 'pointer'
    },
    label: {
      fontWeight: 700,
      whiteSpace: 'nowrap' as 'nowrap',
      overflow: 'hidden' as 'hidden'
    },
    rubberBand: {
      position: 'absolute' as 'absolute',
      boxSizing: 'border-box' as 'border-box',
      border: '2px dashed #684BC7',
      backgroundColor: 'rgba(104, 75, 199, 0.1)',
      pointerEvents: 'none' as 'none'
    },
    guide: {
      position: 'absolute' as 'absolute',
      backgroundColor: '#E63F44',
      pointerEvents: 'none' as 'none',
      zIndex: 5
    },
    hint: {
      position: 'absolute' as 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      color: '#AAAAAA',
      pointerEvents: 'none' as 'none'
    }
  };
}
