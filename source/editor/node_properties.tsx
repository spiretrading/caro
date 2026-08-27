import * as React from 'react';
import { Box, RepeatDirection, SizePolicy } from '../layout';
import { POLICY_COLOR, POLICY_EDGE, REPEAT_DIRECTION } from './palette';
import { directionsFor, REPEAT_GLYPH, repeats, setHeightPolicy,
  setWidthPolicy } from './repeat';

interface Properties {

  /** The boxes currently selected, empty when none are. */
  selection: Box[];

  /** Called when a property of the node changes. */
  onChange?: () => void;

  /** Called when the node is removed. */
  onRemove?: () => void;
}

/** Displays the properties of the selected node. */
export class NodeProperties extends React.Component<Properties> {
  public render(): JSX.Element {
    if(this.props.selection.length === 0) {
      return (
        <div style={NodeProperties.STYLE.panel} data-keeps-selection=''>
          <div style={NodeProperties.STYLE.empty}>
            Select a box to edit it.
          </div>
        </div>);
    }
    if(this.props.selection.length > 1) {
      return (
        <div style={NodeProperties.STYLE.panel} data-keeps-selection=''>
          <div style={NodeProperties.STYLE.empty}>
            {`${this.props.selection.length} boxes selected.`}
          </div>
        </div>);
    }
    const node = this.props.selection[0];
    return (
      <div style={NodeProperties.STYLE.panel} data-keeps-selection=''>
        <div style={NodeProperties.STYLE.heading}>Box</div>
        {
          <label style={NodeProperties.STYLE.field}>
            <span style={NodeProperties.STYLE.caption}>Name</span>
            <input style={NodeProperties.STYLE.input} value={node.name}
              onChange={this.onName} placeholder='Element:Name'/>
          </label>}
        {this.renderAxis('Width', node.widthPolicy, node.width,
          this.onWidthPolicy, this.onWidth)}
        {this.renderAxis('Height', node.heightPolicy, node.height,
          this.onHeightPolicy, this.onHeight)}
        {this.renderDirection(node)}
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
          {this.renderChoice('Repeat', SizePolicy.REPEAT, policy, onPolicy)}
        </div>
        <input style={NodeProperties.STYLE.input} type='number' min='0'
          value={size} onChange={onSize}/>
      </div>);
  }

  /** Shows which way a repeating box repeats, offering only the directions
      the axes it repeats along allow. */
  private renderDirection(node: Box) {
    if(!repeats(node)) {
      return null;
    }
    return (
      <div style={NodeProperties.STYLE.field} data-repeat=''>
        <span style={NodeProperties.STYLE.caption}>Repeats</span>
        <div style={NodeProperties.STYLE.arrows}>
          {directionsFor(node).map(direction =>
            this.renderArrow(direction, node.repeatDirection))}
        </div>
      </div>);
  }

  private renderArrow(direction: RepeatDirection, chosen: RepeatDirection) {
    const style = (() => {
      if(direction === chosen) {
        return {...NodeProperties.STYLE.arrow, ...NodeProperties.STYLE.chosen,
          borderColor: REPEAT_DIRECTION};
      }
      return NodeProperties.STYLE.arrow;
    })();
    return (
      <button key={direction} style={style} title={direction}
          onClick={() => this.onDirection(direction)}>
        {REPEAT_GLYPH[direction]}
      </button>);
  }

  private renderChoice(caption: string, value: SizePolicy,
      policy: SizePolicy, onPolicy: (policy: SizePolicy) => void) {
    const style = (() => {
      if(value === policy) {
        return {...NodeProperties.STYLE.choice,
          ...NodeProperties.STYLE.chosen,
          borderColor: POLICY_EDGE[value]};
      }
      return NodeProperties.STYLE.choice;
    })();
    return (
      <button style={style} onClick={() => onPolicy(value)}>
        <span style={{...NodeProperties.STYLE.swatch,
          backgroundColor: POLICY_COLOR[value]}}/>
        {caption}
      </button>);
  }

  private onName = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.props.selection[0].name = event.target.value;
    this.props.onChange?.();
  }

  private onWidthPolicy = (policy: SizePolicy) => {
    setWidthPolicy(this.props.selection[0], policy);
    this.props.onChange?.();
  }

  private onHeightPolicy = (policy: SizePolicy) => {
    setHeightPolicy(this.props.selection[0], policy);
    this.props.onChange?.();
  }

  private onDirection = (direction: RepeatDirection) => {
    const node = this.props.selection[0];
    if(node.repeatDirection === direction) {
      node.repeatDirection = null;
    } else {
      node.repeatDirection = direction;
    }
    this.props.onChange?.();
  }

  private onWidth = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.props.selection[0].width = Number(event.target.value);
    this.props.onChange?.();
  }

  private onHeight = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.props.selection[0].height = Number(event.target.value);
    this.props.onChange?.();
  }

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
    arrows: {
      display: 'flex',
      gap: '4px'
    },
    arrow: {
      flexGrow: 1,
      padding: '6px 0',
      fontSize: '14px',
      lineHeight: '14px',
      cursor: 'pointer',
      border: '2px solid #E6E6E6',
      backgroundColor: '#FFFFFF'
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
