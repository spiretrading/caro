import * as React from 'react';
import { BoardView } from './board_view';
import { Board } from './layout';
import { importFlatBoard, isFlatBoard } from './migration';
import { SpecificationDirectory } from './storage';

interface State {
  directory: SpecificationDirectory;
  paths: string[];
  path: string;
  board: Board;
  status: string;
}

/** Displays the specifications found in a local directory. */
export class Application extends React.Component<{}, State> {
  constructor(props: {}) {
    super(props);
    this.state = {
      directory: null,
      paths: [],
      path: '',
      board: null,
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
          {this.state.directory !== null &&
            <div style={Application.STYLE.directoryName}>
              {this.state.directory.name}
            </div>}
          {this.state.paths.map(this.renderPath)}
        </div>
        <div style={Application.STYLE.content}>
          <div style={Application.STYLE.toolbar}>
            <span style={Application.STYLE.status}>{this.state.status}</span>
            {this.state.board !== null &&
              <button style={Application.STYLE.button} onClick={this.onSave}>
                Save
              </button>}
          </div>
          {this.state.board !== null &&
            <BoardView board={this.state.board}/>}
        </div>
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
      <button key={path} style={style} onClick={() => this.onSelect(path)}>
        {path}
      </button>);
  }

  private onOpen = async () => {
    try {
      const directory = await SpecificationDirectory.open();
      const paths = await directory.list();
      this.setState({
        directory,
        paths,
        path: '',
        board: null,
        status: `${paths.length} specifications found.`
      });
    } catch(error) {
      this.setState({status: `${error}`});
    }
  }

  private onSelect = async (path: string) => {
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
      this.setState({path, board, status});
    } catch(error) {
      this.setState({status: `${error}`});
    }
  }

  private onSave = async () => {
    try {
      await this.state.directory.write(
        this.state.path, this.state.board.toJson());
      this.setState({status: `Saved ${this.state.path}.`});
    } catch(error) {
      this.setState({status: `${error}`});
    }
  }

  private static readonly STYLE = {
    container: {
      display: 'flex',
      height: '100vh',
      fontFamily: 'Roboto, Segoe UI, sans-serif',
      backgroundColor: '#F5F5F5'
    },
    sidebar: {
      width: '320px',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column' as 'column',
      gap: '2px',
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
      justifyContent: 'space-between',
      gap: '12px',
      padding: '12px 20px',
      borderBottom: '1px solid #C8C8C8',
      backgroundColor: '#FFFFFF'
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
      fontSize: '12px',
      color: '#555555'
    },
    message: {
      padding: '40px',
      fontFamily: 'Roboto, Segoe UI, sans-serif',
      fontSize: '14px'
    }
  };
}
