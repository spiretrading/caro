import * as React from 'react';
import { BoardView } from './board_view';
import { LayoutCanvas, NodeProperties } from './editor';
import { Board, Component, Container, Layout, Node, Orientation,
  SizePolicy } from './layout';
import { importFlatBoard, isFlatBoard } from './migration';
import { SpecificationDirectory } from './storage';

interface State {
  directory: SpecificationDirectory;
  paths: string[];
  path: string;
  board: Board;
  component: Component;
  layout: Layout;
  selection: Node;
  revision: number;
  status: string;
}

/** Edits the layout specifications found in a local directory. */
export class Application extends React.Component<{}, State> {
  constructor(props: {}) {
    super(props);
    this.state = {
      directory: null,
      paths: [],
      path: '',
      board: null,
      component: null,
      layout: null,
      selection: null,
      revision: 0,
      status: ''
    };
  }

  public render(): JSX.Element {
    if(!SpecificationDirectory.isSupported()) {
      return (
        <div style={Application.STYLE.message}>
          Caro needs a browser supporting the File System Access API.
          Use Chrome or Edge, served over localhost or https.
        </div>);
    }
    return (
      <div style={Application.STYLE.container}>
        <div style={Application.STYLE.sidebar}>
          <button style={Application.STYLE.button} onClick={this.onOpen}>
            Open specifications
          </button>
          <button style={Application.STYLE.button} onClick={this.onNew}>
            New specification
          </button>
          {this.state.directory !== null &&
            <div style={Application.STYLE.directoryName}>
              {this.state.directory.name}
            </div>}
          {this.state.paths.map(this.renderPath)}
        </div>
        <div style={Application.STYLE.content}>
          {this.renderToolbar()}
          {this.renderBody()}
        </div>
        {this.state.layout !== null &&
          <NodeProperties node={this.state.selection}
            onChange={this.onChange} onRemove={this.onRemove}/>}
      </div>);
  }

  private renderToolbar(): JSX.Element {
    return (
      <div style={Application.STYLE.toolbar}>
        {this.state.board !== null &&
          <select style={Application.STYLE.select}
              value={this.componentIndex()} onChange={this.onComponent}>
            <option value={-1}>Overview</option>
            {this.state.board.components.map((component, index) =>
              <option key={index} value={index}>{component.name}</option>)}
          </select>}
        {this.state.component !== null &&
          <select style={Application.STYLE.select} value={this.layoutIndex()}
              onChange={this.onLayout}>
            {this.state.component.layouts.map((layout, index) =>
              <option key={index} value={index}>
                {Application.describe(layout)}
              </option>)}
          </select>}
        <span style={Application.STYLE.status}>{this.state.status}</span>
        {this.state.board !== null &&
          <button style={Application.STYLE.button} onClick={this.onSave}>
            Save
          </button>}
      </div>);
  }

  private renderBody(): JSX.Element {
    if(this.state.layout !== null) {
      return (
        <LayoutCanvas layout={this.state.layout}
          selection={this.state.selection} onSelect={this.onSelect}
          onDraw={this.onDraw}/>);
    } else if(this.state.board !== null) {
      return <BoardView board={this.state.board}/>;
    }
    return (
      <div style={Application.STYLE.placeholder}>
        Open a directory of specifications, or start a new one.
      </div>);
  }

  private renderPath = (path: string) => {
    const style = (() => {
      if(path === this.state.path) {
        return {...Application.STYLE.path, ...Application.STYLE.selected};
      }
      return Application.STYLE.path;
    })();
    return (
      <button key={path} style={style} onClick={() => this.onSelectPath(path)}>
        {path}
      </button>);
  }

  private componentIndex(): number {
    return this.state.board.components.indexOf(this.state.component);
  }

  private layoutIndex(): number {
    return this.state.component.layouts.indexOf(this.state.layout);
  }

  private onNew = () => {
    const root = new Container(Orientation.COLUMN, 0, 0, SizePolicy.FLEXIBLE,
      SizePolicy.FLEXIBLE, []);
    const layout = new Layout('', '', root, []);
    const component = new Component('Main', [layout]);
    const board = new Board('Untitled', [component]);
    this.setState({
      path: '',
      board,
      component,
      layout,
      selection: null,
      status: 'Started a new specification.'
    });
  }

  private onOpen = async () => {
    try {
      const directory = await SpecificationDirectory.open();
      const paths = await directory.list();
      this.setState({
        directory,
        paths,
        status: `${paths.length} specifications found.`
      });
    } catch(error) {
      this.setState({status: `${error}`});
    }
  }

  private onSelectPath = async (path: string) => {
    try {
      const text = await this.state.directory.read(path);
      const value = JSON.parse(text);
      const board = (() => {
        if(isFlatBoard(value)) {
          return importFlatBoard(value);
        }
        return Board.fromJson(text);
      })();
      const status = (() => {
        if(isFlatBoard(value)) {
          return `Imported ${path} from the legacy format.`;
        }
        return `Loaded ${path}.`;
      })();
      this.setState({
        path, board, component: null, layout: null, selection: null, status});
    } catch(error) {
      this.setState({status: `${error}`});
    }
  }

  private onComponent = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const index = Number(event.target.value);
    if(index === -1) {
      this.setState({component: null, layout: null, selection: null});
      return;
    }
    const component = this.state.board.components[index];
    this.setState({component, layout: component.layouts[0], selection: null});
  }

  private onLayout = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const layout = this.state.component.layouts[Number(event.target.value)];
    this.setState({layout, selection: null});
  }

  private onSelect = (node: Node) => {
    this.setState({selection: node});
  }

  private onDraw = (node: Node, index: number) => {
    const root = this.state.layout.root as Container;
    root.children.splice(index, 0, node);
    this.setState({
      selection: node,
      revision: this.state.revision + 1,
      status: 'Drew a box.'
    });
  }

  private onChange = () => {
    this.setState({revision: this.state.revision + 1});
  }

  private onRemove = () => {
    const root = this.state.layout.root as Container;
    const index = root.children.indexOf(this.state.selection);
    if(index !== -1) {
      root.children.splice(index, 1);
    }
    this.setState({
      selection: null,
      revision: this.state.revision + 1,
      status: 'Removed a box.'
    });
  }

  private onSave = async () => {
    if(this.state.directory === null) {
      this.setState({
        status: 'Open a directory before saving.'});
      return;
    }
    const path = (() => {
      if(this.state.path !== '') {
        return this.state.path;
      }
      return window.prompt(
        'Save as', `${this.state.board.name.toLowerCase()}/layout.json`);
    })();
    if(path === null || path === '') {
      return;
    }
    try {
      await this.state.directory.write(path, this.state.board.toJson());
      const paths = await this.state.directory.list();
      this.setState({path, paths, status: `Saved ${path}.`});
    } catch(error) {
      this.setState({status: `${error}`});
    }
  }

  private static describe(layout: Layout): string {
    if(layout.condition === '') {
      return 'default';
    }
    return layout.condition.replace(/\n/g, ' | ');
  }

  private static readonly STYLE = {
    container: {
      display: 'flex',
      height: '100vh',
      fontFamily: 'Roboto, Segoe UI, sans-serif',
      backgroundColor: '#F5F5F5'
    },
    sidebar: {
      width: '300px',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column' as 'column',
      gap: '4px',
      padding: '12px',
      overflowY: 'auto' as 'auto',
      borderRight: '1px solid #C8C8C8',
      backgroundColor: '#FFFFFF'
    },
    content: {
      display: 'flex',
      flexDirection: 'column' as 'column',
      flexGrow: 1,
      minWidth: 0
    },
    toolbar: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 20px',
      borderBottom: '1px solid #C8C8C8',
      backgroundColor: '#FFFFFF'
    },
    select: {
      padding: '6px',
      fontSize: '13px',
      maxWidth: '260px'
    },
    button: {
      padding: '8px 12px',
      fontSize: '13px',
      cursor: 'pointer'
    },
    directoryName: {
      fontSize: '12px',
      fontWeight: 700,
      padding: '8px 4px'
    },
    path: {
      textAlign: 'left' as 'left',
      fontSize: '12px',
      padding: '4px',
      border: 'none',
      background: 'none',
      cursor: 'pointer'
    },
    selected: {
      backgroundColor: '#E6E6E6'
    },
    status: {
      flexGrow: 1,
      fontSize: '12px',
      color: '#555555'
    },
    placeholder: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexGrow: 1,
      fontSize: '13px',
      color: '#888888'
    },
    message: {
      padding: '40px',
      fontFamily: 'Roboto, Segoe UI, sans-serif',
      fontSize: '14px'
    }
  };
}
