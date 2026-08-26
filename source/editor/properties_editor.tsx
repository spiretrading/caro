import * as React from 'react';

/** The smallest number of rows the field is drawn with. */
const MINIMUM_ROWS = 2;

/** The largest number of rows the field grows to before scrolling. */
const MAXIMUM_ROWS = 12;

interface Properties {

  /** The properties being edited. */
  properties: string;

  /** Called when the properties are edited. */
  onChange?: (properties: string) => void;
}

/** Edits the properties a scenario applies to its layout. */
export class PropertiesEditor extends React.Component<Properties> {
  public render(): JSX.Element {
    const properties = this.props.properties ?? '';
    return (
      <div style={PropertiesEditor.STYLE.wrapper}>
        <span style={PropertiesEditor.STYLE.label}>Properties</span>
        <textarea style={PropertiesEditor.STYLE.field} spellCheck={false}
          rows={PropertiesEditor.rowsFor(properties)} value={properties}
          onChange={this.onChange}/>
      </div>);
  }

  private static rowsFor(properties: string): number {
    const rows = properties.split('\n').length;
    return Math.min(Math.max(rows, MINIMUM_ROWS), MAXIMUM_ROWS);
  }

  private onChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    this.props.onChange?.(event.target.value);
  }

  private static readonly STYLE = {
    wrapper: {
      display: 'flex',
      flexDirection: 'column' as 'column',
      gap: '4px'
    },
    label: {
      fontSize: '11px',
      color: '#808080'
    },
    field: {
      boxSizing: 'border-box' as 'border-box',
      width: '100%',
      maxWidth: '560px',
      padding: '6px',
      fontSize: '12px',
      lineHeight: '16px',
      fontFamily: 'Consolas, "Courier New", monospace',
      border: '1px solid #C8C8C8',
      resize: 'vertical' as 'vertical'
    }
  };
}
