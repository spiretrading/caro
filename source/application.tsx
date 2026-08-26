import * as React from 'react';
import { contains, detach, ensureBlank, keepsSelection, makeBlank,
  NodeProperties, normalize, prune, ScenarioBoard,
  SectionPicker } from './editor';
import { Board, Component, Container, Layout, Node, Orientation,
  SizePolicy } from './layout';
import { importFlatBoard, isFlatBoard } from './migration';
import { SpecificationFile } from './storage';

/** The magnifications a canvas steps through, in ascending order. */
const ZOOM_STEPS = [1, 1.5, 2, 3, 4];

interface State {
  file: SpecificationFile;
  board: Board;
  component: Component;
  selection: Node;
  zoom: number;
  revision: number;
  status: string;
}

/** Edits a layout specification held in a local file. */
export class Application extends React.Component<{}, State> {
  constructor(props: {}) {
    super(props);
    const board = Application.createBoard();
    const component = board.components[0];
    this.state = {
      file: null,
      board,
      component,
      selection: null,
      zoom: 1,
      revision: 0,
      status: ''
    };
  }

  public render(): JSX.Element {
    if(!SpecificationFile.isSupported()) {
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
    window.addEventListener('mousedown', this.onMouseDown);
  }

  public componentWillUnmount(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('mousedown', this.onMouseDown);
  }

  private onMouseDown = (event: MouseEvent) => {
    Application.release(event.target);
    if(this.state.selection === null || keepsSelection(event.target)) {
      return;
    }
    this.setState({selection: null});
  }

  private static release(target: EventTarget): void {
    const active = document.activeElement;
    if(!Application.isTyping() || !(active instanceof HTMLElement)) {
      return;
    }
    if(target instanceof Element &&
        (active === target || active.contains(target))) {
      return;
    }
    active.blur();
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if(this.state.selection === null || Application.isTyping()) {
      return;
    }
    if(event.key === 'Escape') {
      this.setState({selection: null});
      return;
    }
    if(event.key !== 'Delete' && event.key !== 'Backspace') {
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
        {this.state.component !== null &&
          <SectionPicker sections={this.state.board.components}
            selected={this.state.component} onSelect={this.onSelectSection}
            onRename={this.onRename}/>}
        {this.state.board !== null &&
          <button style={Application.STYLE.control} title='Add a section'
              onClick={this.onAddSection}>
            +
          </button>}
        {this.state.board !== null &&
          <button style={Application.STYLE.control} title='Delete section'
              disabled={this.state.board.components.length <= 1}
              onClick={this.onRemoveSection}>
            {'\u00D7'}
          </button>}
        <span style={Application.STYLE.status}>{this.state.status}</span>
        {this.state.component !== null && this.renderZoom()}
      </div>);
  }

  private renderZoom(): JSX.Element {
    const zoom = this.state.zoom;
    return (
      <div style={Application.STYLE.zoom}>
        <button style={Application.STYLE.control} title='Zoom out'
            disabled={zoom <= ZOOM_STEPS[0]}
            onClick={() => this.onZoom(-1)}>
          {'\u2212'}
        </button>
        <button style={Application.STYLE.magnification}
            title='Back to the literal size' onClick={this.onResetZoom}>
          {`${Math.round(zoom * 100)}%`}
        </button>
        <button style={Application.STYLE.control} title='Zoom in'
            disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
            onClick={() => this.onZoom(1)}>
          +
        </button>
      </div>);
  }

  private onZoom = (steps: number) => {
    const index = ZOOM_STEPS.indexOf(this.state.zoom) + steps;
    const zoom = ZOOM_STEPS[
      Math.min(Math.max(index, 0), ZOOM_STEPS.length - 1)];
    if(zoom === this.state.zoom) {
      return;
    }
    this.setState({zoom});
  }

  private onResetZoom = () => {
    this.setState({zoom: 1});
  }

  private renderBody(): JSX.Element {
    if(this.state.component !== null) {
      return (
        <ScenarioBoard component={this.state.component}
          selection={this.state.selection} onSelect={this.onSelect}
          onChange={this.onChange}
          onRemoveScenario={this.onRemoveScenario}
          onRemoveBox={this.onRemove} onMove={this.onMoveScenario}
          onCondition={this.onCondition}
          onProperties={this.onProperties} zoom={this.state.zoom}
          onZoom={this.onZoom}/>);
    }
    return (
      <div style={Application.STYLE.placeholder}>
        Open a specification, or start a new one.
      </div>);
  }

  private componentIndex(): number {
    return this.state.board.components.indexOf(this.state.component);
  }

  private onNew = () => {
    const board = Application.createBoard();
    const component = board.components[0];
    this.setState({
      file: null,
      board,
      component,
      selection: null,
      status: 'Started a new specification.'
    });
  }

  private static createBoard(): Board {
    const component = new Component('Main', [makeBlank()]);
    ensureBlank(component);
    return new Board('Untitled', [component]);
  }

  private onOpen = async () => {
    try {
      const file = await SpecificationFile.open();
      const text = await file.read();
      const value = JSON.parse(text);
      const board = (() => {
        if(isFlatBoard(value)) {
          return importFlatBoard(value);
        }
        return Board.fromJson(text);
      })();
      const status = (() => {
        if(isFlatBoard(value)) {
          return `Imported ${file.name} from the legacy format.`;
        }
        return `Opened ${file.name}.`;
      })();
      const component = board.components[0] ?? null;
      if(component !== null) {
        ensureBlank(component);
      }
      this.setState({file, board, component, selection: null, status});
    } catch(error) {
      this.setState({status: `${error}`});
    }
  }

  private onSelectSection = (component: Component) => {
    ensureBlank(component);
    this.setState({component, selection: null});
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

  private onAddSection = () => {
    const components = this.state.board.components;
    const component = new Component(
      Application.nextName(this.state.board), []);
    ensureBlank(component);
    components.splice(this.componentIndex() + 1, 0, component);
    this.setState({
      component,
      selection: null,
      revision: this.state.revision + 1,
      status: `Added ${component.name}.`
    });
  }

  private onRemoveSection = () => {
    const components = this.state.board.components;
    if(components.length <= 1) {
      return;
    }
    const index = this.componentIndex();
    components.splice(index, 1);
    const component = components[Math.min(index, components.length - 1)];
    this.setState({
      component,
      selection: null,
      revision: this.state.revision + 1,
      status: 'Removed a section.'
    });
  }

  private onRename = (name: string) => {
    this.state.component.name = name;
    this.setState({revision: this.state.revision + 1});
  }

  private static nextName(board: Board): string {
    let index = 1;
    while(board.find(`Section${index}`) !== null) {
      index += 1;
    }
    return `Section${index}`;
  }

  private onCondition = (layout: Layout, condition: string) => {
    layout.condition = condition;
    ensureBlank(this.state.component);
    this.setState({revision: this.state.revision + 1});
  }

  private onProperties = (layout: Layout, properties: string) => {
    layout.properties = properties;
    this.setState({revision: this.state.revision + 1});
  }

  private onSelect = (node: Node) => {
    this.setState({selection: node});
  }

  private onChange = () => {
    for(const layout of this.state.component.layouts) {
      normalize(layout.root);
    }
    ensureBlank(this.state.component);
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
    try {
      const file = await (async () => {
        if(this.state.file !== null) {
          return this.state.file;
        }
        return await SpecificationFile.create('layout.json');
      })();
      await file.write(prune(this.state.board).toJson());
      this.setState({file, status: `Saved ${file.name}.`});
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
    control: {
      width: '28px',
      height: '28px',
      padding: 0,
      fontSize: '14px',
      border: '1px solid #C8C8C8',
      backgroundColor: '#FFFFFF',
      cursor: 'pointer'
    },
    zoom: {
      display: 'flex',
      flexShrink: 0
    },
    magnification: {
      width: '52px',
      height: '28px',
      padding: 0,
      fontSize: '12px',
      fontFamily: 'inherit',
      border: '1px solid #C8C8C8',
      borderLeft: 'none',
      borderRight: 'none',
      backgroundColor: '#FFFFFF',
      cursor: 'pointer'
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
