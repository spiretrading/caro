import * as React from 'react';
import { Component, Layout, Node } from '../layout';
import { LayoutCanvas } from './layout_canvas';
import { PropertiesEditor } from './properties_editor';

interface Anchor {
  element: Element;
  point: {x: number, y: number};
  across: number;
  down: number;
}

interface Properties {

  /** The component whose scenarios are shown. */
  component: Component;

  /** The currently selected node, null when nothing is selected. */
  selection: Node;

  /** How much the canvases are magnified, 1 being their literal size. */
  zoom: number;

  /** Called to magnify or shrink the canvases by a number of steps. */
  onZoom?: (steps: number) => void;

  /** Called when a node is selected, with null when the selection clears. */
  onSelect?: (node: Node) => void;

  /** Called whenever a scenario's layout has been modified. */
  onChange?: () => void;

  /** Called to remove a scenario. */
  onRemoveScenario?: (layout: Layout) => void;

  /** Called to remove the selected box from its scenario. */
  onRemoveBox?: () => void;

  /** Called to move a scenario one place left or right. */
  onMove?: (layout: Layout, offset: number) => void;

  /** Called when a scenario's condition is edited. */
  onCondition?: (layout: Layout, condition: string) => void;

  /** Called when a scenario's properties are edited. */
  onProperties?: (layout: Layout, properties: string) => void;
}

/** Displays every scenario of a component side by side. */
export class ScenarioBoard extends React.Component<Properties> {
  public render(): JSX.Element {
    return (
      <div ref={element => this.surface = element}
          style={ScenarioBoard.STYLE.surface}>
        {this.props.component.layouts.map(this.renderScenario)}
      </div>);
  }

  public componentDidMount(): void {
    this.surface.addEventListener('wheel', this.onWheel, {passive: false});
  }

  public componentWillUnmount(): void {
    this.surface.removeEventListener('wheel', this.onWheel);
  }

  public getSnapshotBeforeUpdate(previous: Properties): Anchor {
    if(this.props.zoom === previous.zoom) {
      return null;
    }
    const rect = this.surface.getBoundingClientRect();
    const point = this.cursor ?? {x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2};
    this.cursor = null;
    const element = document.elementFromPoint(point.x, point.y);
    if(element === null || !this.surface.contains(element)) {
      return null;
    }
    const bounds = element.getBoundingClientRect();
    return {
      element,
      point,
      across: (point.x - bounds.left) / Math.max(bounds.width, 1),
      down: (point.y - bounds.top) / Math.max(bounds.height, 1)
    };
  }

  public componentDidUpdate(previous: Properties, state: {},
      anchor: Anchor): void {
    if(anchor === null || anchor === undefined ||
        !this.surface.contains(anchor.element)) {
      return;
    }
    const bounds = anchor.element.getBoundingClientRect();
    this.surface.scrollLeft +=
      bounds.left + anchor.across * bounds.width - anchor.point.x;
    this.surface.scrollTop +=
      bounds.top + anchor.down * bounds.height - anchor.point.y;
  }

  private surface: HTMLDivElement;
  private cursor: {x: number, y: number};

  private onWheel = (event: WheelEvent) => {
    if(!event.ctrlKey) {
      return;
    }
    event.preventDefault();
    const steps = (() => {
      if(event.deltaY < 0) {
        return 1;
      }
      return -1;
    })();
    this.cursor = {x: event.clientX, y: event.clientY};
    this.props.onZoom?.(steps);
  }

  private renderScenario = (layout: Layout, index: number) => {
    return (
      <div key={index} style={ScenarioBoard.STYLE.card}>
        <div style={ScenarioBoard.STYLE.heading}>
          {this.renderCondition(layout, index)}
          {this.renderControls(layout, index)}
        </div>
        <LayoutCanvas layout={layout} selection={this.props.selection}
          zoom={this.props.zoom} onSelect={this.props.onSelect}
          onChange={this.props.onChange} onRemove={this.props.onRemoveBox}/>
        {this.renderProperties(layout, index)}
      </div>);
  }

  private renderProperties(layout: Layout, index: number): JSX.Element {
    if(index >= this.props.component.layouts.length - 1) {
      return null;
    }
    return (
      <PropertiesEditor properties={layout.properties}
        onChange={properties =>
          this.props.onProperties?.(layout, properties)}/>);
  }

  private renderCondition(layout: Layout, index: number): JSX.Element {
    if(index === 0) {
      return <span style={ScenarioBoard.STYLE.default}>default</span>;
    }
    return (
      <input style={ScenarioBoard.STYLE.condition} value={layout.condition}
        placeholder='condition'
        onChange={event =>
          this.props.onCondition?.(layout, event.target.value)}/>);
  }

  private renderControls(layout: Layout, index: number): JSX.Element {
    const count = this.props.component.layouts.length;
    if(index === 0 || index >= count - 1) {
      return null;
    }
    return (
      <div style={ScenarioBoard.STYLE.controls}>
        <button style={ScenarioBoard.STYLE.control} title='Move left'
            disabled={index <= 1}
            onClick={() => this.props.onMove?.(layout, -1)}>
          {'\u2039'}
        </button>
        <button style={ScenarioBoard.STYLE.control} title='Move right'
            disabled={index >= count - 2}
            onClick={() => this.props.onMove?.(layout, 1)}>
          {'\u203A'}
        </button>
        <button style={ScenarioBoard.STYLE.control} title='Delete scenario'
            onClick={() => this.props.onRemoveScenario?.(layout)}>
          {'\u00D7'}
        </button>
      </div>);
  }

  private static readonly STYLE = {
    surface: {
      flexGrow: 1,
      display: 'flex',
      alignItems: 'flex-start',
      gap: '20px',
      padding: '20px',
      overflow: 'auto' as 'auto',
      backgroundColor: '#F5F5F5'
    },
    card: {
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column' as 'column',
      gap: '8px',
      padding: '16px',
      border: '1px solid #C8C8C8',
      borderRadius: '4px',
      backgroundColor: '#FFFFFF'
    },
    heading: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      minHeight: '26px'
    },
    default: {
      flexGrow: 1,
      fontSize: '13px',
      fontWeight: 700
    },
    condition: {
      flexGrow: 1,
      minWidth: 0,
      padding: '4px 6px',
      fontSize: '12px',
      fontFamily: 'inherit',
      border: '1px solid #C8C8C8'
    },
    controls: {
      display: 'flex',
      flexShrink: 0,
      gap: '4px'
    },
    control: {
      width: '22px',
      height: '22px',
      padding: 0,
      fontSize: '13px',
      lineHeight: '13px',
      border: '1px solid #C8C8C8',
      backgroundColor: '#FFFFFF',
      cursor: 'pointer'
    }
  };
}
