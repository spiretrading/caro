import * as React from 'react';
import { Component } from '../layout';

interface Properties {

  /** The sections to choose from. */
  sections: Component[];

  /** The section being edited. */
  selected: Component;

  /** Called when a different section is chosen. */
  onSelect?: (section: Component) => void;

  /** Called when the selected section is renamed. */
  onRename?: (name: string) => void;
}

interface State {
  isOpen: boolean;
}

/** Names the section being edited and chooses among the others. */
export class SectionPicker extends React.Component<Properties, State> {
  constructor(props: Properties) {
    super(props);
    this.state = {isOpen: false};
  }

  public render(): JSX.Element {
    return (
      <div ref={element => this.wrapper = element}
          style={SectionPicker.STYLE.wrapper}>
        <input style={SectionPicker.STYLE.name} placeholder='Section:Name'
          value={this.props.selected.name} onChange={this.onRename}/>
        <button style={SectionPicker.STYLE.toggle} title='Choose a section'
            onClick={this.onToggle}>
          {'\u25BE'}
        </button>
        {this.state.isOpen &&
          <div style={SectionPicker.STYLE.list}>
            {this.props.sections.map(this.renderSection)}
          </div>}
      </div>);
  }

  public componentDidMount(): void {
    window.addEventListener('mousedown', this.onPress);
    window.addEventListener('keydown', this.onKeyDown);
  }

  public componentWillUnmount(): void {
    window.removeEventListener('mousedown', this.onPress);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private wrapper: HTMLDivElement;

  private renderSection = (section: Component, index: number) => {
    const style = (() => {
      if(section === this.props.selected) {
        return {...SectionPicker.STYLE.item, ...SectionPicker.STYLE.chosen};
      }
      return SectionPicker.STYLE.item;
    })();
    const label = (() => {
      if(section.name === '') {
        return '(unnamed)';
      }
      return section.name;
    })();
    return (
      <button key={index} style={style} title={label}
          onClick={() => this.onChoose(section)}>
        {label}
      </button>);
  }

  private onRename = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.props.onRename?.(event.target.value);
  }

  private onToggle = () => {
    this.setState({isOpen: !this.state.isOpen});
  }

  private onChoose = (section: Component) => {
    this.setState({isOpen: false});
    this.props.onSelect?.(section);
  }

  private onPress = (event: MouseEvent) => {
    if(!this.state.isOpen || this.wrapper === null) {
      return;
    }
    if(this.wrapper.contains(event.target as Node)) {
      return;
    }
    this.setState({isOpen: false});
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if(event.key === 'Escape' && this.state.isOpen) {
      this.setState({isOpen: false});
    }
  }

  private static readonly STYLE = {
    wrapper: {
      position: 'relative' as 'relative',
      display: 'flex',
      flexShrink: 0
    },
    name: {
      width: '200px',
      padding: '6px',
      fontSize: '13px',
      fontFamily: 'inherit',
      border: '1px solid #C8C8C8',
      borderRight: 'none'
    },
    toggle: {
      width: '24px',
      padding: 0,
      fontSize: '11px',
      border: '1px solid #C8C8C8',
      backgroundColor: '#FFFFFF',
      cursor: 'pointer'
    },
    list: {
      position: 'absolute' as 'absolute',
      top: '100%',
      left: 0,
      zIndex: 20,
      display: 'flex',
      flexDirection: 'column' as 'column',
      minWidth: '224px',
      maxHeight: '320px',
      overflowY: 'auto' as 'auto',
      border: '1px solid #C8C8C8',
      backgroundColor: '#FFFFFF',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
    },
    item: {
      padding: '6px 8px',
      fontSize: '13px',
      textAlign: 'left' as 'left',
      whiteSpace: 'nowrap' as 'nowrap',
      border: 'none',
      backgroundColor: '#FFFFFF',
      cursor: 'pointer'
    },
    chosen: {
      fontWeight: 700,
      backgroundColor: '#EDE7FF'
    }
  };
}
