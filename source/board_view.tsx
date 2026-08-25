import * as React from 'react';
import { Board, Component, Container, Layout, Node, Reference, Spacer,
  SizePolicy } from './layout';

interface Properties {

  /** The board to display. */
  board: Board;
}

/** Displays the structure of a board as an indented outline. */
export class BoardView extends React.Component<Properties> {
  public render(): JSX.Element {
    return (
      <div style={BoardView.STYLE.container}>
        <div style={BoardView.STYLE.title}>{this.props.board.name}</div>
        {this.props.board.components.map(this.renderComponent)}
      </div>);
  }

  private renderComponent = (component: Component) => {
    return (
      <div key={component.name} style={BoardView.STYLE.card}>
        <div style={BoardView.STYLE.componentName}>{component.name}</div>
        {component.layouts.map(this.renderLayout)}
      </div>);
  }

  private renderLayout = (layout: Layout, index: number) => {
    const condition = (() => {
      if(layout.condition === '') {
        return 'default';
      }
      return layout.condition;
    })();
    return (
      <div key={index} style={BoardView.STYLE.layout}>
        <div style={BoardView.STYLE.condition}>{condition}</div>
        {this.renderNode(layout.root, 0, 'root')}
        {layout.overlays.map((overlay, layer) =>
          this.renderNode(overlay, 0, `layer ${layer + 1}`))}
        {layout.constraints !== '' &&
          <pre style={BoardView.STYLE.constraints}>{layout.constraints}</pre>}
      </div>);
  }

  private renderNode = (node: Node, depth: number, key: string):
      JSX.Element => {
    const label = (() => {
      if(node instanceof Container) {
        return node.orientation;
      } else if(node instanceof Reference) {
        return node.name;
      }
      return 'spacer';
    })();
    const children = (() => {
      if(node instanceof Container) {
        return node.children.map((child, index) =>
          this.renderNode(child, depth + 1, `${key}.${index}`));
      }
      return null;
    })();
    return (
      <div key={key}>
        <div style={{...BoardView.STYLE.node, paddingLeft: `${depth * 16}px`}}>
          <span style={BoardView.STYLE.nodeLabel}>{label}</span>
          <span style={BoardView.STYLE.size}>
            {node.width} x {node.height}
          </span>
          <span style={{...BoardView.STYLE.policy,
            color: BoardView.POLICY_COLOR[node.widthPolicy]}}>
            {node.widthPolicy}
          </span>
          <span style={{...BoardView.STYLE.policy,
            color: BoardView.POLICY_COLOR[node.heightPolicy]}}>
            {node.heightPolicy}
          </span>
        </div>
        {children}
      </div>);
  }

  private static readonly POLICY_COLOR = {
    [SizePolicy.FIXED]: '#FFB800',
    [SizePolicy.FILL]: '#0066FF',
    [SizePolicy.FIT]: '#00BF2D',
    [SizePolicy.REPEAT]: '#744BFF'
  } as {[policy: string]: string};

  private static readonly STYLE = {
    container: {
      padding: '20px',
      overflowY: 'auto' as 'auto',
      flexGrow: 1
    },
    title: {
      fontSize: '24px',
      fontWeight: 700,
      marginBottom: '20px'
    },
    card: {
      border: '1px solid #C8C8C8',
      borderRadius: '4px',
      padding: '16px',
      marginBottom: '16px',
      backgroundColor: '#FFFFFF'
    },
    componentName: {
      fontSize: '14px',
      fontWeight: 700,
      marginBottom: '12px'
    },
    layout: {
      borderTop: '1px solid #F0F0F0',
      paddingTop: '8px',
      marginTop: '8px'
    },
    condition: {
      fontSize: '12px',
      color: '#555555',
      whiteSpace: 'pre-wrap' as 'pre-wrap',
      marginBottom: '4px'
    },
    constraints: {
      fontSize: '11px',
      color: '#888888',
      margin: '4px 0 0 0'
    },
    node: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '12px',
      lineHeight: '20px'
    },
    nodeLabel: {
      minWidth: '200px'
    },
    size: {
      minWidth: '90px',
      color: '#888888'
    },
    policy: {
      minWidth: '80px',
      fontSize: '11px'
    }
  };
}
