import * as React from 'react';
import { Clipboard, copyBoxes, copyOf, copyScenario, ensureBlank,
  ErrorPanel, History, keepsSelection, makeBlank, NodeProperties,
  OutlinePanel, prune, push, restoreSnapshot, Reveal, ScenarioBoard,
  SectionPicker, Snapshot, takeSnapshot, validate } from './editor';
import { Board, Box, Component, Layout } from './layout';
import { importFlatBoard, isFlatBoard } from './migration';
import { SpecificationFile } from './storage';

/** The magnifications a canvas steps through, in ascending order. */
const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8, 10];

interface State {
  file: SpecificationFile;
  board: Board;
  component: Component;
  selection: Box[];
  active: Box[];
  reveal: Reveal;
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
      selection: [],
      active: null,
      reveal: null,
      zoom: 1,
      revision: 0,
      status: ''
    };
    this.history = new History(Application.snapshotOf(this.state));
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
        {this.state.component !== null &&
          <OutlinePanel sections={this.state.board.components}
            component={this.state.component} active={this.state.active}
            selection={this.state.selection}
            onSection={this.onSelectSection} onActivate={this.onActivate}
            onReveal={this.onReveal}/>}
        <div style={Application.STYLE.content}>
          {this.renderToolbar()}
          {this.renderBody()}
          {this.state.component !== null &&
            <ErrorPanel problems={validate(this.state.component)}
              onSelect={this.onSelectProblem}/>}
        </div>
        {this.state.component !== null &&
          <NodeProperties selection={this.state.selection}
            onCommit={this.onEdit} onRemove={this.onRemove}/>}
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

  private clipboard: Clipboard = null;
  private history: History;

  /** Returns a specification as it stands, along with what is being worked
      on in it. */
  private static snapshotOf(state: State): Snapshot {
    return takeSnapshot(state.board, state.component, state.selection,
      state.active);
  }

  /** Applies a change to the specification and remembers it, so that it can
      be taken back. Changes tagged alike are taken back together. The change
      is remembered before it is drawn, so that what can be taken back is
      drawn along with it. */
  private commit(changes: Partial<State>, tag: string): void {
    if(this.state.component !== null) {
      ensureBlank(this.state.component);
    }
    this.history.record(Application.snapshotOf(
      {...this.state, ...changes} as State), tag);
    this.setState({...changes, revision: this.state.revision + 1} as State);
  }

  /** Notes what is now being worked on, which is put back along with the
      change it belongs to. */
  private note(changes: Partial<State>): void {
    this.history.note(Application.snapshotOf(
      {...this.state, ...changes} as State));
  }

  /** Applies a whole specification, which is then all there is to go back
      to. */
  private restart(changes: Partial<State>): void {
    this.history.reset(Application.snapshotOf(
      {...this.state, ...changes} as State));
    this.setState(changes as State);
  }

  private onUndo = () => {
    this.recall(this.history.undo(), 'Took back the last change.');
  }

  private onRedo = () => {
    this.recall(this.history.redo(), 'Put the change back.');
  }

  /** Puts a remembered specification back on screen, finding again within
      it whatever was being worked on when it was remembered. */
  private recall(snapshot: Snapshot, status: string): void {
    if(snapshot === null) {
      return;
    }
    const restored = restoreSnapshot(snapshot);
    this.setState({
      board: restored.board,
      component: restored.component,
      selection: restored.selection,
      active: restored.active,
      reveal: null,
      revision: this.state.revision + 1,
      status
    });
  }

  private onMouseDown = (event: MouseEvent) => {
    Application.release(event.target);
    if(this.state.selection.length === 0 || event.shiftKey ||
        keepsSelection(event.target)) {
      return;
    }
    this.note({selection: [], active: null});
    this.setState({selection: [], active: null});
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
    if(Application.isTyping()) {
      return;
    }
    if(event.ctrlKey || event.metaKey) {
      if(event.key === 'c' || event.key === 'C') {
        this.onCopy(event);
      } else if(event.key === 'v' || event.key === 'V') {
        this.onPaste(event);
      } else if(event.key === 'z' || event.key === 'Z') {
        event.preventDefault();
        if(event.shiftKey) {
          this.onRedo();
        } else {
          this.onUndo();
        }
      } else if(event.key === 'y' || event.key === 'Y') {
        event.preventDefault();
        this.onRedo();
      }
      return;
    }
    if(this.state.selection.length === 0) {
      return;
    }
    if(event.key === 'Escape') {
      this.note({selection: [], active: null});
      this.setState({selection: [], active: null});
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
        <button style={Application.STYLE.control} title='Undo'
            disabled={!this.history.canUndo} onClick={this.onUndo}>
          {'\u21B6'}
        </button>
        <button style={Application.STYLE.control} title='Redo'
            disabled={!this.history.canRedo} onClick={this.onRedo}>
          {'\u21B7'}
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
        <span style={Application.STYLE.build} title={`Built ${BUILD}`}>
          {BUILD.slice(11)}
        </span>
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
          selection={this.state.selection} active={this.state.active}
          reveal={this.state.reveal} onSelect={this.onSelect}
          onChange={this.onChange} onCommit={this.onCommit}
          onRemoveScenario={this.onRemoveScenario}
          onCopyScenario={this.onCopyScenario}
          onRemoveBox={this.onRemove} onMove={this.onMoveScenario}
          onCondition={this.onCondition}
          onProperties={this.onProperties} zoom={this.state.zoom}
          onZoom={this.onZoom} onAddLayer={this.onAddLayer}
          onRemoveLayer={this.onRemoveLayer}/>);
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
    this.restart({
      file: null,
      board,
      component,
      selection: [],
      active: null,
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
      this.restart({file, board, component, selection: [], active: null,
        status});
    } catch(error) {
      this.setState({status: `${error}`});
    }
  }

  private onSelectSection = (component: Component) => {
    ensureBlank(component);
    this.note({component, selection: [], active: null});
    this.setState({component, selection: [], active: null});
  }

  private onRemoveScenario = (layout: Layout) => {
    const layouts = this.state.component.layouts;
    const index = layouts.indexOf(layout);
    if(index <= 0) {
      return;
    }
    layouts.splice(index, 1);
    this.commit({
      selection: [],
      active: null,
      status: 'Removed a scenario.'
    }, null);
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
    this.commit({status: 'Moved a scenario.'}, null);
  }

  private onAddSection = () => {
    const components = this.state.board.components;
    const component = new Component(
      Application.nextName(this.state.board), []);
    ensureBlank(component);
    components.splice(this.componentIndex() + 1, 0, component);
    this.commit({
      component,
      selection: [],
      active: null,
      status: `Added ${component.name}.`
    }, null);
  }

  private onRemoveSection = () => {
    const components = this.state.board.components;
    if(components.length <= 1) {
      return;
    }
    const index = this.componentIndex();
    components.splice(index, 1);
    const component = components[Math.min(index, components.length - 1)];
    this.commit({
      component,
      selection: [],
      active: null,
      status: 'Removed a section.'
    }, null);
  }

  private onRename = (name: string) => {
    this.state.component.name = name;
    this.commit({}, 'section');
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
    this.commit({}, 'condition');
  }

  private onProperties = (layout: Layout, properties: string) => {
    layout.properties = properties;
    this.commit({}, 'properties');
  }

  private onActivate = (component: Component, boxes: Box[]) => {
    ensureBlank(component);
    this.note({component, active: boxes, selection: []});
    this.setState({component, active: boxes, selection: []});
  }

  private onReveal = (component: Component, box: Box) => {
    ensureBlank(component);
    const holder = Application.holderIn(component, box);
    this.note({component, selection: [box], active: holder});
    this.setState({component, selection: [box], active: holder,
      reveal: {box}});
  }

  /** Selects the box a problem stands for, bringing it into view. */
  private onSelectProblem = (box: Box) => {
    this.onReveal(this.state.component, box);
  }

  private onCopy = (event: KeyboardEvent) => {
    if(this.state.selection.length === 0) {
      return;
    }
    event.preventDefault();
    this.clipboard = copyBoxes(this.state.selection);
    this.setState({status: Application.count(this.state.selection.length,
      'Copied')});
  }

  private onCopyScenario = (layout: Layout) => {
    this.clipboard = copyScenario(layout);
    this.setState({status: 'Copied a scenario.'});
  }

  private onPaste = (event: KeyboardEvent) => {
    if(this.clipboard === null) {
      return;
    }
    event.preventDefault();
    if(this.clipboard.layout !== null) {
      this.pasteScenario();
      return;
    }
    this.pasteBoxes();
  }

  /** Puts copies of the boxes held into whichever canvas was last worked in,
      leaving them selected so that they can be carried where they are
      wanted. What is already there holds its ground and the copies give way
      to it, since pasting is meant to add a box rather than to rearrange the
      layout around one. Each paste is taken from where the last one landed,
      so that pasting repeatedly walks copies down the canvas rather than
      piling them all on the same spot. */
  private pasteBoxes(): void {
    const holder = this.pasteTarget();
    if(holder === null) {
      return;
    }
    const settled = holder.slice();
    const pasted = copyOf(this.clipboard.boxes);
    holder.push(...pasted);
    push(holder, settled);
    this.clipboard = copyBoxes(pasted);
    this.commit({
      selection: pasted,
      status: Application.count(pasted.length, 'Pasted')
    }, null);
  }

  /** Returns the boxes a paste goes into, which is the canvas last worked
      in, or the one holding the selection when that canvas has gone. */
  private pasteTarget(): Box[] {
    if(this.state.active !== null && this.holds(this.state.active)) {
      return this.state.active;
    }
    if(this.state.selection.length === 0) {
      return null;
    }
    return this.holderOf(this.state.selection[0]);
  }

  /** Returns whether a list of boxes is one this component holds. */
  private holds(boxes: Box[]): boolean {
    for(const layout of this.state.component.layouts) {
      if(layout.boxes === boxes || layout.overlays.indexOf(boxes) !== -1) {
        return true;
      }
    }
    return false;
  }

  /** Puts a copy of the scenario held beside the one it was taken from, or
      last of the scenarios that carry anything when that one has gone. The
      default is never displaced: it is the scenario every other one is a
      variant of. */
  private pasteScenario(): void {
    const layouts = this.state.component.layouts;
    const source = layouts.indexOf(this.clipboard.origin);
    const index = (() => {
      if(source === -1) {
        return Math.max(layouts.length - 1, 1);
      }
      return source + 1;
    })();
    layouts.splice(index, 0, this.clipboard.layout.clone());
    this.commit({
      selection: [],
      active: null,
      status: 'Pasted a scenario.'
    }, null);
  }

  private static count(many: number, verb: string): string {
    if(many === 1) {
      return `${verb} a box.`;
    }
    return `${verb} ${many} boxes.`;
  }

  private onSelect = (nodes: Box[], extend: boolean, holder: Box[]) => {
    if(!extend) {
      this.note({selection: nodes, active: holder});
      this.setState({selection: nodes, active: holder});
      return;
    }
    const selection = [...this.state.selection];
    for(const node of nodes) {
      const index = selection.indexOf(node);
      if(index === -1) {
        selection.push(node);
      } else {
        selection.splice(index, 1);
      }
    }
    this.note({selection, active: holder});
    this.setState({selection, active: holder});
  }

  /** Redraws what a gesture is doing, which is not a change to remember
      until the gesture is over. */
  private onChange = () => {
    ensureBlank(this.state.component);
    this.setState({revision: this.state.revision + 1});
  }

  private onCommit = () => {
    this.commit({}, null);
  }

  private onEdit = (tag: string) => {
    this.commit({}, tag);
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

  private onAddLayer = (layout: Layout) => {
    layout.overlays.push([]);
    this.commit({status: `Added layer ${layout.overlays.length}.`}, null);
  }

  private onRemoveLayer = (layout: Layout, layer: number) => {
    layout.overlays.splice(layer, 1);
    this.commit({
      selection: [],
      active: null,
      status: 'Removed a layer.'
    }, null);
  }

  private onRemove = () => {
    let removed = 0;
    for(const box of this.state.selection) {
      const holder = this.holderOf(box);
      if(holder === null) {
        continue;
      }
      holder.splice(holder.indexOf(box), 1);
      removed += 1;
    }
    if(removed === 0) {
      return;
    }
    const status = (() => {
      if(removed === 1) {
        return 'Removed a box.';
      }
      return `Removed ${removed} boxes.`;
    })();
    this.commit({selection: [], active: null, status}, null);
  }

  /** Returns the list of boxes a box belongs to, which is a layout's own or
      one of its layers'. */
  private holderOf(box: Box): Box[] {
    return Application.holderIn(this.state.component, box);
  }

  /** Returns the list of boxes a box belongs to within a section. */
  private static holderIn(component: Component, box: Box): Box[] {
    for(const layout of component.layouts) {
      if(layout.boxes.indexOf(box) !== -1) {
        return layout.boxes;
      }
      for(const layer of layout.overlays) {
        if(layer.indexOf(box) !== -1) {
          return layer;
        }
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
    build: {
      flexShrink: 0,
      fontSize: '11px',
      color: '#AAAAAA'
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
