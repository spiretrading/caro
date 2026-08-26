import * as React from 'react';
import { Box, Component, Layout } from '../layout';
import { POLICY_EDGE } from './palette';
import { isBlank } from './scenarios';

/** How far each level of the tree is indented, in pixels. */
const INDENT = 12;

/** How wide the panel is to begin with, in pixels. */
const WIDTH = 210;

/** How narrow and how wide the panel may be dragged. */
const NARROWEST = 120;
const WIDEST = 520;

interface Properties {

  /** The sections of the specification, outermost first. */
  sections: Component[];

  /** The section being edited. */
  component: Component;

  /** The boxes of the canvas being worked in, null when none is. */
  active: Box[];

  /** The boxes currently selected, empty when none are. */
  selection: Box[];

  /** Called to make a section the one being edited. */
  onSection?: (component: Component) => void;

  /** Called to make a canvas the one being worked in. */
  onActivate?: (component: Component, boxes: Box[]) => void;

  /** Called to select a box and bring it into view. */
  onReveal?: (component: Component, box: Box) => void;
}

interface State {
  open: Set<object>;
  width: number;
}

/** Lists a whole specification as a tree of sections, scenarios, layers and
    boxes, so that a box too small to hit, or buried in a section that is not
    on screen, can still be reached. */
export class OutlinePanel extends React.Component<Properties, State> {
  constructor(props: Properties) {
    super(props);
    this.state = {open: new Set<object>(), width: WIDTH};
    this.grabbed = 0;
    this.held = 0;
  }

  public render(): JSX.Element {
    return (
      <div style={{...OutlinePanel.STYLE.panel,
          width: `${this.state.width}px`}} data-keeps-selection=''
          data-outline=''>
        <div style={OutlinePanel.STYLE.tree}>
          {this.props.sections.map(this.renderSection)}
        </div>
        <div style={OutlinePanel.STYLE.grip} data-grip=''
          title='Drag to widen' onMouseDown={this.onGrab}/>
      </div>);
  }

  public componentDidMount(): void {
    this.reveal(this.props.component);
  }

  public componentWillUnmount(): void {
    this.release();
  }

  private grabbed: number;
  private held: number;

  private onGrab = (event: React.MouseEvent) => {
    event.preventDefault();
    this.grabbed = event.clientX;
    this.held = this.state.width;
    window.addEventListener('mousemove', this.onDrag);
    window.addEventListener('mouseup', this.release);
  }

  private onDrag = (event: MouseEvent) => {
    const width = this.held + event.clientX - this.grabbed;
    this.setState({
      width: Math.min(Math.max(width, NARROWEST), WIDEST)
    });
  }

  private release = () => {
    window.removeEventListener('mousemove', this.onDrag);
    window.removeEventListener('mouseup', this.release);
  }

  public componentDidUpdate(previous: Properties): void {
    if(previous.component !== this.props.component) {
      this.reveal(this.props.component);
    }
  }

  /** Opens a section and its scenarios, so that the one being edited is not
      left folded away out of sight. */
  private reveal(component: Component): void {
    const open = new Set(this.state.open);
    open.add(component);
    for(const layout of component.layouts) {
      open.add(layout);
    }
    this.setState({open});
  }

  private renderSection = (component: Component, index: number) => {
    const open = this.state.open.has(component);
    const scenarios = OutlinePanel.scenariosOf(component);
    const children = (() => {
      if(!open) {
        return [] as JSX.Element[];
      }
      return scenarios.map((layout, order) =>
        this.renderScenario(component, layout, order));
    })();
    const style = (() => {
      if(component !== this.props.component) {
        return {};
      }
      return OutlinePanel.STYLE.editing;
    })();
    return (
      <div key={index}>
        {this.renderRow({
          depth: 0,
          label: component.name,
          note: `${scenarios.length}`,
          open,
          leaf: scenarios.length === 0,
          style,
          onToggle: () => this.toggle(component),
          onChoose: () => {
            const here = component === this.props.component;
            this.props.onSection?.(component);
            this.spread(OutlinePanel.under(component), !(here && open));
          }
        })}
        {children}
      </div>);
  }

  private renderScenario(component: Component, layout: Layout,
      index: number): JSX.Element {
    const open = this.state.open.has(layout);
    const children = (() => {
      if(!open) {
        return [] as JSX.Element[];
      }
      const boxes = OutlinePanel.reading(layout.boxes).map((box, order) =>
        this.renderBox(component, box, order, 2));
      const layers = layout.overlays.map((overlay, order) =>
        this.renderLayer(component, overlay, order));
      return boxes.concat(layers);
    })();
    return (
      <div key={`scenario-${index}`}>
        {this.renderRow({
          depth: 1,
          label: OutlinePanel.conditionOf(layout, index),
          note: `${layout.boxes.length}`,
          open,
          leaf: layout.boxes.length === 0 && layout.overlays.length === 0,
          style: this.markFor(layout.boxes),
          onToggle: () => this.toggle(layout),
          onChoose: () => {
            const here = component === this.props.component;
            this.props.onActivate?.(component, layout.boxes);
            this.spread([layout as object].concat(layout.overlays),
              !(here && open));
          }
        })}
        {children}
      </div>);
  }

  private renderLayer(component: Component, overlay: Box[],
      index: number): JSX.Element {
    const open = this.state.open.has(overlay);
    const children = (() => {
      if(!open) {
        return [] as JSX.Element[];
      }
      return OutlinePanel.reading(overlay).map((box, order) =>
        this.renderBox(component, box, order, 3));
    })();
    return (
      <div key={`layer-${index}`}>
        {this.renderRow({
          depth: 2,
          label: `Layer ${index + 1}`,
          note: `${overlay.length}`,
          open,
          leaf: overlay.length === 0,
          style: this.markFor(overlay),
          onToggle: () => this.toggle(overlay),
          onChoose: () => {
            const here = component === this.props.component;
            this.props.onActivate?.(component, overlay);
            this.spread([overlay], !(here && open));
          }
        })}
        {children}
      </div>);
  }

  private renderBox(component: Component, box: Box, index: number,
      depth: number): JSX.Element {
    const style = (() => {
      if(this.props.selection.indexOf(box) === -1) {
        return {};
      }
      return OutlinePanel.STYLE.chosen;
    })();
    return (
      <div key={`box-${index}`}>
        {this.renderRow({
          depth,
          label: OutlinePanel.nameOf(box),
          title: `${box.width} x ${box.height} at ${box.x}, ${box.y}`,
          note: OutlinePanel.sizeOf(box,
            this.props.selection.indexOf(box) !== -1),
          open: false,
          leaf: true,
          style,
          onToggle: () => this.props.onReveal?.(component, box),
          onChoose: () => this.props.onReveal?.(component, box)
        })}
      </div>);
  }

  private renderRow(entry: {depth: number, label: string,
      note: React.ReactNode,
      open: boolean, leaf: boolean, style: object, onToggle: () => void,
      onChoose: () => void, title?: string}): JSX.Element {
    const title = (() => {
      if(entry.title === undefined) {
        return entry.label;
      }
      return entry.title;
    })();
    const twist = (() => {
      if(entry.leaf) {
        return '';
      }
      if(entry.open) {
        return '\u25BE';
      }
      return '\u25B8';
    })();
    return (
      <div style={{...OutlinePanel.STYLE.row, ...entry.style,
          paddingLeft: `${entry.depth * INDENT}px`}}>
        <button style={OutlinePanel.STYLE.twist} onClick={entry.onToggle}
            title='Fold'>
          {twist}
        </button>
        <button style={OutlinePanel.STYLE.label} onClick={entry.onChoose}
            title={title}>
          {entry.label}
        </button>
        <span style={OutlinePanel.STYLE.note}>{entry.note}</span>
      </div>);
  }

  /** Returns a box's size written in the colours of the policies that
      decide it, the width in one and the height in the other, so that what
      a box is made of can be read without selecting it. The darker shade of
      each colour is used, since the lighter one is what the box is painted
      and does not carry against a white page. */
  private static sizeOf(box: Box, chosen: boolean): React.ReactNode {
    if(chosen) {
      return `${box.width}x${box.height}`;
    }
    return (
      <React.Fragment>
        <span style={{color: POLICY_EDGE[box.widthPolicy]}}>{box.width}</span>
        x
        <span style={{color: POLICY_EDGE[box.heightPolicy]}}>
          {box.height}
        </span>
      </React.Fragment>);
  }

  /** Returns everything a section holds that can be opened or shut. */
  private static under(component: Component): object[] {
    const nodes = [component as object];
    for(const layout of OutlinePanel.scenariosOf(component)) {
      nodes.push(layout);
      for(const overlay of layout.overlays) {
        nodes.push(overlay);
      }
    }
    return nodes;
  }

  /** Opens or shuts a set of nodes together. */
  private spread(nodes: object[], open: boolean): void {
    const next = new Set(this.state.open);
    for(const node of nodes) {
      if(open) {
        next.add(node);
      } else {
        next.delete(node);
      }
    }
    this.setState({open: next});
  }

  private toggle(node: object): void {
    const open = new Set(this.state.open);
    if(open.has(node)) {
      open.delete(node);
    } else {
      open.add(node);
    }
    this.setState({open});
  }

  /** Returns the marking that says a canvas is the one being worked in. */
  private markFor(boxes: Box[]) {
    if(boxes !== this.props.active) {
      return {};
    }
    return OutlinePanel.STYLE.working;
  }

  /** Returns the scenarios a section is made of, without the blank waiting
      at the end for the next one to be drawn into. That blank is how a
      scenario is added rather than a scenario in its own right, and it is
      dropped when the specification is written out. A blank left in the
      middle is deliberate and stays. */
  private static scenariosOf(component: Component): Layout[] {
    const scenarios = component.layouts.slice();
    while(scenarios.length > 1 && isBlank(scenarios[scenarios.length - 1])) {
      scenarios.pop();
    }
    return scenarios;
  }

  /** Returns the boxes in the order they are read on the canvas rather than
      the order they happen to be drawn in, which is the order they were put
      there rather than where they now sit. */
  private static reading(boxes: Box[]): Box[] {
    return boxes.slice().sort((left, right) => {
      if(left.y !== right.y) {
        return left.y - right.y;
      }
      return left.x - right.x;
    });
  }

  private static conditionOf(layout: Layout, index: number): string {
    if(index === 0) {
      return 'default';
    }
    if(layout.condition === '') {
      return 'no condition';
    }
    return layout.condition;
  }

  /** Returns what a box is called, half of them standing for space alone and
      carrying no name to show. */
  private static nameOf(box: Box): string {
    if(box.name === '') {
      return 'space';
    }
    return `<${box.name}>`;
  }

  private static readonly STYLE = {
    panel: {
      position: 'relative' as 'relative',
      flexShrink: 0,
      display: 'flex',
      borderRight: '1px solid #C8C8C8',
      backgroundColor: '#FFFFFF',
      fontSize: '12px'
    },
    tree: {
      flexGrow: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column' as 'column',
      padding: '12px 0',
      overflow: 'auto' as 'auto'
    },
    grip: {
      position: 'absolute' as 'absolute',
      top: 0,
      bottom: 0,
      right: '-3px',
      width: '7px',
      cursor: 'col-resize',
      zIndex: 1
    },
    row: {
      display: 'flex',
      alignItems: 'center',
      gap: '2px',
      paddingRight: '8px'
    },
    editing: {
      fontWeight: 700
    },
    working: {
      backgroundColor: '#F0ECFA'
    },
    chosen: {
      backgroundColor: '#684BC7',
      color: '#FFFFFF'
    },
    twist: {
      flexShrink: 0,
      width: '14px',
      padding: 0,
      border: 'none',
      backgroundColor: 'transparent',
      color: 'inherit',
      fontSize: '10px',
      lineHeight: '18px',
      cursor: 'pointer'
    },
    label: {
      flexGrow: 1,
      minWidth: 0,
      padding: '2px 0',
      border: 'none',
      backgroundColor: 'transparent',
      color: 'inherit',
      fontFamily: 'inherit',
      fontSize: '12px',
      lineHeight: '18px',
      textAlign: 'left' as 'left',
      whiteSpace: 'nowrap' as 'nowrap',
      overflow: 'hidden' as 'hidden',
      textOverflow: 'ellipsis',
      cursor: 'pointer'
    },
    note: {
      flexShrink: 0,
      fontSize: '11px',
      color: '#999999'
    }
  };
}
