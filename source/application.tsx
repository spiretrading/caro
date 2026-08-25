import * as React from 'react';
import { BoardView } from './board_view';
import { contains, detach, NodeProperties, normalize,
  ScenarioBoard } from './editor';
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
  selection: Node;
  revision: number;
  status: string;
}

/** Edits the layout specifications found in a local directory. */
export class Application extends React.Component<{}, State> {
  constructor(props: {}) {
    super(props);
    const board = Application.createBoard();
    const component = board.components[0];
    this.state = {
      directory: null,
      paths: [],
      path: '',
      board,
      component,
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
        <div style={Application.STYLE.content}>
          {this.renderToolbar()}
          {this.renderBody()}
        </div>
        {this.state.component !== null &&
          <NodeProperties node={this.state.selection}
            onChange={this.onChange} onRemove={this.onRemove}/>}
      </div>);
  }

  public componentDidMount(): void {
    window.addEventListener('keydown', this.onKeyDown);
  }

  public componentWillUnmount(): void {
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if(event.key !== 'Delete' && event.key !== 'Backspace') {
      return;
    }
    if(this.state.selection === null || Application.isTyping()) {
      return;
    }
    event.preventDefault();
    this.onRemove();
  }

  private static isTyping(): boolean {
    const active = document.activeElement;
    if(active === null) {
      return false;
    }
    return active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT';
  }

  private renderToolbar(): JSX.Element {
    return (
      <div style={Application.STYLE.toolbar}>
        <button style={Application.STYLE.button} onClick={this.onNew}>
          New
        </button>
        <button style={Application.STYLE.button} onClick={this.onOpen}>
          Open
        </button>
        <button style={Application.STYLE.button} onClick={this.onSave}>
          Save
        </button>
        {this.state.paths.length > 0 &&
          <select style={Application.STYLE.select} value={this.state.path}
              onChange={this.onPath}>
            <option value=''>{this.directoryName()}</option>
            {this.state.paths.map(path =>
              <option key={path} value={path}>{path}</option>)}
          </select>}
        {this.state.board !== null &&
          <select style={Application.STYLE.select}
              value={this.componentIndex()} onChange={this.onComponent}>
            <option value={-1}>Overview</option>
            {this.state.board.components.map((component, index) =>
              <option key={index} value={index}>{component.name}</option>)}
          </select>}
        <span style={Application.STYLE.status}>{this.state.status}</span>
      </div>);
  }

  private directoryName(): string {
    if(this.state.directory === null) {
      return 'Specifications';
    }
    return this.state.directory.name;
  }

  private renderBody(): JSX.Element {
    if(this.state.component !== null) {
      return (
        <ScenarioBoard component={this.state.component}
          selection={this.state.selection} onSelect={this.onSelect}
          onChange={this.onChange} onAdd={this.onAdd}
          onRemoveScenario={this.onRemoveScenario}
          onRemoveBox={this.onRemove} onMove={this.onMoveScenario}
          onCondition={this.onCondition}/>);
    } else if(this.state.board !== null) {
      return <BoardView board={this.state.board}/>;
    }
    return (
      <div style={Application.STYLE.placeholder}>
        Open a directory of specifications, or start a new one.
      </div>);
  }

  private componentIndex(): number {
    return this.state.board.components.indexOf(this.state.component);
  }

  private onNew = () => {
    const board = Application.createBoard();
    const component = board.components[0];
    this.setState({
      path: '',
      board,
      component,
      selection: null,
      status: 'Started a new specification.'
    });
  }

  private static createBoard(): Board {
    return new Board('Untitled', [new Component('Main',
      [new Layout('', '', Application.createRoot(), [])])]);
  }

  private static createRoot(): Container {
    return new Container(Orientation.COLUMN, 0, 0, SizePolicy.FILL,
      SizePolicy.FILL, []);
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

  private onPath = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const path = event.target.value;
    if(path === '') {
      return;
    }
    await this.onSelectPath(path);
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
      this.setState({path, board, component: null, selection: null, status});
    } catch(error) {
      this.setState({status: `${error}`});
    }
  }

  private onComponent = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const index = Number(event.target.value);
    if(index === -1) {
      this.setState({component: null, selection: null});
      return;
    }
    this.setState({
      component: this.state.board.components[index], selection: null});
  }

  private onAdd = () => {
    this.state.component.layouts.push(new Layout('', '',
      Application.createRoot(), []));
    this.setState({
      revision: this.state.revision + 1, status: 'Added a scenario.'});
  }

  private onRemoveScenario = (layout: Layout) => {
    const layouts = this.state.component.layouts;
    const index = layouts.indexOf(layout);
    if(index <= 0) {
      return;
    }
    layouts.splice(index, 1);
    this.setState({
      selection: null,
      revision: this.state.revision + 1,
      status: 'Removed a scenario.'
    });
  }

  private onMoveScenario = (layout: Layout, offset: number) => {
    const layouts = this.state.component.layouts;
    const index = layouts.indexOf(layout);
    const target = index + offset;
    if(index <= 0 || target <= 0 || target >= layouts.length) {
      return;
    }
    layouts.splice(index, 1);
    layouts.splice(target, 0, layout);
    this.setState({revision: this.state.revision + 1});
  }

  private onCondition = (layout: Layout, condition: string) => {
    layout.condition = condition;
    this.setState({revision: this.state.revision + 1});
  }

  private onSelect = (node: Node) => {
    this.setState({selection: node});
  }

  private onChange = () => {
    for(const layout of this.state.component.layouts) {
      normalize(layout.root);
    }
    this.setState({revision: this.state.revision + 1});
  }

  private onRemove = () => {
    const root = this.rootOf(this.state.selection);
    if(root === null) {
      return;
    }
    detach(root, this.state.selection);
    normalize(root);
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

  private rootOf(node: Node): Container {
    for(const layout of this.state.component.layouts) {
      const root = layout.root as Container;
      if(contains(root, node)) {
        return root;
      }
    }
    return null;
  }

  private static readonly STYLE = {
    container: {
      display: 'flex',
      height: '100vh',
      fontFamily: 'Roboto, Segoe UI, sans-serif',
      backgroundColor: '#F5F5F5'
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
