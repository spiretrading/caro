import * as React from 'react';
import { Node, Reference, SizePolicy } from '../layout';

interface Properties {

  /** The node being edited, null when nothing is selected. */
  node: Node;

  /** Called when a property of the node changes. */
  onChange?: () => void;

  /** Called when the node is removed. */
  onRemove?: () => void;
}

/** Displays the properties of the selected node. */
export class NodeProperties extends React.Component<Properties> {
  public render(): JSX.Element {
    if(this.props.node === null) {
      return (
        <div style={NodeProperties.STYLE.panel}>
          <div style={NodeProperties.STYLE.empty}>
            Select a box to edit it.
          </div>
        </div>);
    }
    const node = this.props.node;
    return (
      <div style={NodeProperties.STYLE.panel}>
        <div style={NodeProperties.STYLE.heading}>Box</div>
        {node instanceof Reference &&
          <label style={NodeProperties.STYLE.field}>
            <span style={NodeProperties.STYLE.caption}>Name</span>
            <input style={NodeProperties.STYLE.input} value={node.name}
              onChange={this.onName} placeholder='Element:Name'/>
          </label>}
        {this.renderAxis('Width', node.widthPolicy, node.width,
          this.onWidthPolicy, this.onWidth)}
        {this.renderAxis('Height', node.heightPolicy, node.height,
          this.onHeightPolicy, this.onHeight)}
        <button style={NodeProperties.STYLE.remove}
            onClick={() => this.props.onRemove?.()}>
          Delete
        </button>
      </div>);
  }

  private renderAxis(caption: string, policy: SizePolicy, size: number,
      onPolicy: (policy: SizePolicy) => void,
      onSize: (event: React.ChangeEvent<HTMLInputElement>) => void) {
    return (
      <div style={NodeProperties.STYLE.field}>
        <span style={NodeProperties.STYLE.caption}>{caption}</span>
        <div style={NodeProperties.STYLE.choices}>
          {this.renderChoice('Fixed', SizePolicy.FIXED, policy, onPolicy)}
          {this.renderChoice('Fill', SizePolicy.FILL, policy, onPolicy)}
          {this.renderChoice('Fit', SizePolicy.FIT, policy, onPolicy)}
        </div>
        <input style={NodeProperties.STYLE.input} type='number' min='0'
          value={size} onChange={onSize}/>
      </div>);
  }

  private renderChoice(caption: string, value: SizePolicy,
      policy: SizePolicy, onPolicy: (policy: SizePolicy) => void) {
    const style = (() => {
      if(value === policy) {
        return {...NodeProperties.STYLE.choice,
          ...NodeProperties.STYLE.chosen,
          borderColor: NodeProperties.POLICY_COLOR[value]};
      }
      return NodeProperties.STYLE.choice;
    })();
    return (
      <button style={style} onClick={() => onPolicy(value)}>
        <span style={{...NodeProperties.STYLE.swatch,
          backgroundColor: NodeProperties.POLICY_COLOR[value]}}/>
        {caption}
      </button>);
  }

  private onName = (event: React.ChangeEvent<HTMLInputElement>) => {
    (this.props.node as Reference).name = event.target.value;
    this.props.onChange?.();
  }

  private onWidthPolicy = (policy: SizePolicy) => {
    this.props.node.widthPolicy = policy;
    this.props.onChange?.();
  }

  private onHeightPolicy = (policy: SizePolicy) => {
    this.props.node.heightPolicy = policy;
    this.props.onChange?.();
  }

  private onWidth = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.props.node.width = Number(event.target.value);
    this.props.onChange?.();
  }

  private onHeight = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.props.node.height = Number(event.target.value);
    this.props.onChange?.();
  }

  private static readonly POLICY_COLOR = {
    [SizePolicy.FIXED]: '#FFB800',
    [SizePolicy.FILL]: '#0066FF',
    [SizePolicy.FIT]: '#00BF2D',
    [SizePolicy.REPEAT]: '#744BFF'
  } as {[policy: string]: string};

  private static readonly STYLE = {
    panel: {
      width: '240px',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column' as 'column',
      gap: '16px',
      padding: '20px',
      borderLeft: '1px solid #C8C8C8',
      backgroundColor: '#FFFFFF'
    },
    heading: {
      fontSize: '14px',
      fontWeight: 700
    },
    empty: {
      fontSize: '12px',
      color: '#888888'
    },
    field: {
      display: 'flex',
      flexDirection: 'column' as 'column',
      gap: '6px'
    },
    caption: {
      fontSize: '12px',
      color: '#555555'
    },
    input: {
      boxSizing: 'border-box' as 'border-box',
      width: '100%',
      padding: '6px 8px',
      fontSize: '13px',
      border: '1px solid #C8C8C8'
    },
    choices: {
      display: 'flex',
      flexDirection: 'column' as 'column',
      gap: '4px'
    },
    choice: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 8px',
      fontSize: '12px',
      textAlign: 'left' as 'left',
      cursor: 'pointer',
      border: '2px solid #E6E6E6',
      backgroundColor: '#FFFFFF'
    },
    swatch: {
      width: '12px',
      height: '12px',
      flexShrink: 0,
      border: '1px solid rgba(0, 0, 0, 0.2)'
    },
    chosen: {
      fontWeight: 700
    },
    remove: {
      padding: '8px',
      fontSize: '12px',
      color: '#FFFFFF',
      backgroundColor: '#E63F44',
      border: 'none',
      cursor: 'pointer'
    }
  };
}
