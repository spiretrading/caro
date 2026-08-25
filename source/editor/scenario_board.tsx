import * as React from 'react';
import { Component, Layout, Node } from '../layout';
import { LayoutCanvas } from './layout_canvas';

interface Properties {

  /** The component whose scenarios are shown. */
  component: Component;

  /** The currently selected node, null when nothing is selected. */
  selection: Node;

  /** Called when a node is selected, with null when the selection clears. */
  onSelect?: (node: Node) => void;

  /** Called whenever a scenario's layout has been modified. */
  onChange?: () => void;

  /** Called to add a blank scenario after the last one. */
  onAdd?: () => void;

  /** Called to remove a scenario. */
  onRemoveScenario?: (layout: Layout) => void;

  /** Called to remove the selected box from its scenario. */
  onRemoveBox?: () => void;

  /** Called to move a scenario one place left or right. */
  onMove?: (layout: Layout, offset: number) => void;

  /** Called when a scenario's condition is edited. */
  onCondition?: (layout: Layout, condition: string) => void;
}

/** Displays every scenario of a component side by side. */
export class ScenarioBoard extends React.Component<Properties> {
  public render(): JSX.Element {
    return (
      <div style={ScenarioBoard.STYLE.surface}>
        {this.props.component.layouts.map(this.renderScenario)}
        <button style={ScenarioBoard.STYLE.add} title='Add a scenario'
            onClick={() => this.props.onAdd?.()}>
          +
        </button>
      </div>);
  }

  private renderScenario = (layout: Layout, index: number) => {
    return (
      <div key={index} style={ScenarioBoard.STYLE.card}>
        <div style={ScenarioBoard.STYLE.heading}>
          {this.renderCondition(layout, index)}
          {this.renderControls(layout, index)}
        </div>
        <LayoutCanvas layout={layout} selection={this.props.selection}
          onSelect={this.props.onSelect} onChange={this.props.onChange}
          onRemove={this.props.onRemoveBox}/>
      </div>);
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
    if(index === 0) {
      return null;
    }
    const count = this.props.component.layouts.length;
    return (
      <div style={ScenarioBoard.STYLE.controls}>
        <button style={ScenarioBoard.STYLE.control} title='Move left'
            disabled={index <= 1}
            onClick={() => this.props.onMove?.(layout, -1)}>
          {'\u2039'}
        </button>
        <button style={ScenarioBoard.STYLE.control} title='Move right'
            disabled={index >= count - 1}
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
    },
    add: {
      flexShrink: 0,
      alignSelf: 'center',
      width: '40px',
      height: '40px',
      fontSize: '20px',
      border: '1px dashed #C8C8C8',
      backgroundColor: '#FFFFFF',
      cursor: 'pointer'
    }
  };
}
