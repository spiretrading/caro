import * as React from 'react';
import { Container, Layout, Node, Orientation, Reference,
  SizePolicy } from '../layout';

/** The distance a drag must cover before it draws instead of selects. */
const DRAG_THRESHOLD = 4;

/** The fraction of the cross axis a box must span to become flexible. */
const FILL_RATIO = 0.95;

interface Point {
  x: number;
  y: number;
}

interface Properties {

  /** The layout being edited. */
  layout: Layout;

  /** The currently selected node, null when nothing is selected. */
  selection: Node;

  /** Called when a node is selected, with null when the selection clears. */
  onSelect?: (node: Node) => void;

  /** Called when a box is drawn, with the position to insert it at. */
  onDraw?: (node: Node, index: number) => void;
}

interface State {
  origin: Point;
  current: Point;
  isDrawing: boolean;
}

/** Displays a layout and lets boxes be drawn into it. */
export class LayoutCanvas extends React.Component<Properties, State> {
  constructor(props: Properties) {
    super(props);
    this.state = {origin: null, current: null, isDrawing: false};
    this.children = [];
  }

  public render(): JSX.Element {
    const root = this.props.layout.root;
    if(!(root instanceof Container)) {
      return (
        <div style={LayoutCanvas.STYLE.message}>
          This layout has no container at its root.
        </div>);
    }
    this.children = [];
    return (
      <div style={LayoutCanvas.STYLE.surface}>
        <div ref={element => this.container = element}
            style={{...LayoutCanvas.STYLE.container,
              flexDirection: LayoutCanvas.toDirection(root.orientation)}}
            onMouseDown={this.onMouseDown}>
          {root.children.map(this.renderChild)}
          {this.renderPreview()}
          {root.children.length === 0 && !this.state.isDrawing &&
            <div style={LayoutCanvas.STYLE.hint}>Drag to draw a box.</div>}
        </div>
      </div>);
  }

  public componentWillUnmount(): void {
    this.detach();
  }

  private container: HTMLDivElement;
  private children: HTMLDivElement[];

  private renderChild = (node: Node, index: number) => {
    const root = this.props.layout.root as Container;
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
    return (
      <div key={index} ref={element => this.children[index] = element}
          style={{...LayoutCanvas.STYLE.box,
            ...LayoutCanvas.toFlex(node, root.orientation),
            borderLeftColor: LayoutCanvas.POLICY_COLOR[node.widthPolicy],
            borderRightColor: LayoutCanvas.POLICY_COLOR[node.widthPolicy],
            borderTopColor: LayoutCanvas.POLICY_COLOR[node.heightPolicy],
            borderBottomColor: LayoutCanvas.POLICY_COLOR[node.heightPolicy],
            ...selection}}>
        <span style={LayoutCanvas.STYLE.label}>{label}</span>
        <span style={LayoutCanvas.STYLE.size}>
          {node.width} x {node.height}
        </span>
      </div>);
  }

  private renderPreview = () => {
    if(!this.state.isDrawing) {
      return null;
    }
    const region = this.measure();
    if(region.width < DRAG_THRESHOLD && region.height < DRAG_THRESHOLD) {
      return null;
    }
    return (
      <div style={{...LayoutCanvas.STYLE.preview, left: `${region.x}px`,
        top: `${region.y}px`, width: `${region.width}px`,
        height: `${region.height}px`}}/>);
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

  private toLocal(event: MouseEvent | React.MouseEvent): Point {
    const bounds = this.container.getBoundingClientRect();
    return {x: event.clientX - bounds.left, y: event.clientY - bounds.top};
  }

  private onMouseDown = (event: React.MouseEvent) => {
    const point = this.toLocal(event);
    this.setState({origin: point, current: point, isDrawing: true});
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    event.preventDefault();
  }

  private onMouseMove = (event: MouseEvent) => {
    this.setState({current: this.toLocal(event)});
  }

  private onMouseUp = () => {
    this.detach();
    const region = this.measure();
    this.setState({isDrawing: false});
    if(region.width < DRAG_THRESHOLD && region.height < DRAG_THRESHOLD) {
      this.props.onSelect?.(this.hitTest(this.state.origin));
      return;
    }
    const root = this.props.layout.root as Container;
    const node = this.build(region, root.orientation);
    this.props.onDraw?.(
      node, this.findIndex(this.state.origin, root.orientation));
  }

  private detach(): void {
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
  }

  private hitTest(point: Point): Node {
    const bounds = this.container.getBoundingClientRect();
    const root = this.props.layout.root as Container;
    for(let i = 0; i < this.children.length; ++i) {
      const element = this.children[i];
      if(element === null || element === undefined) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      const x = rect.left - bounds.left;
      const y = rect.top - bounds.top;
      if(point.x >= x && point.x <= x + rect.width && point.y >= y &&
          point.y <= y + rect.height) {
        return root.children[i];
      }
    }
    return null;
  }

  private findIndex(point: Point, orientation: Orientation): number {
    const bounds = this.container.getBoundingClientRect();
    for(let i = 0; i < this.children.length; ++i) {
      const element = this.children[i];
      if(element === null || element === undefined) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      const middle = (() => {
        if(orientation === Orientation.ROW) {
          return rect.left - bounds.left + rect.width / 2;
        }
        return rect.top - bounds.top + rect.height / 2;
      })();
      const position = (() => {
        if(orientation === Orientation.ROW) {
          return point.x;
        }
        return point.y;
      })();
      if(position < middle) {
        return i;
      }
    }
    return this.children.length;
  }

  private build(region: {width: number, height: number},
      orientation: Orientation): Node {
    const bounds = this.container.getBoundingClientRect();
    const widthPolicy = (() => {
      if(orientation === Orientation.COLUMN &&
          region.width >= bounds.width * FILL_RATIO) {
        return SizePolicy.FLEXIBLE;
      }
      return SizePolicy.FIXED;
    })();
    const heightPolicy = (() => {
      if(orientation === Orientation.ROW &&
          region.height >= bounds.height * FILL_RATIO) {
        return SizePolicy.FLEXIBLE;
      }
      return SizePolicy.FIXED;
    })();
    return new Reference('', Math.round(region.width),
      Math.round(region.height), widthPolicy, heightPolicy);
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
    box: {
      position: 'relative' as 'relative',
      boxSizing: 'border-box' as 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '8px',
      padding: '0 8px',
      overflow: 'hidden' as 'hidden',
      borderStyle: 'solid' as 'solid',
      borderWidth: '3px',
      backgroundColor: '#FAFAFA',
      fontSize: '12px'
    },
    selected: {
      backgroundColor: '#EDE7FF',
      outline: '2px solid #684BC7',
      outlineOffset: '-2px'
    },
    label: {
      fontWeight: 700,
      whiteSpace: 'nowrap' as 'nowrap'
    },
    size: {
      color: '#888888',
      whiteSpace: 'nowrap' as 'nowrap'
    },
    preview: {
      position: 'absolute' as 'absolute',
      border: '2px dashed #684BC7',
      backgroundColor: 'rgba(104, 75, 199, 0.1)',
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
