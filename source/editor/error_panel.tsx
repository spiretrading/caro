import * as React from 'react';
import { PROBLEM_COLOR, VALID_COLOR, WARNING_COLOR } from './palette';
import { Problem, Severity } from './validation';

interface Properties {

  /** What is amiss in the section being edited, empty when nothing is. */
  problems: Problem[];

  /** Called to show a problem on the canvas. */
  onSelect?: (problem: Problem) => void;
}

/** Lists what is amiss in the section being edited, along the bottom of the
    board, where it can be read without leaving the drawing. */
export class ErrorPanel extends React.Component<Properties> {
  public render(): JSX.Element {
    return (
      <div style={ErrorPanel.STYLE.panel} data-keeps-selection=''
          data-errors=''>
        <div style={{...ErrorPanel.STYLE.heading, ...this.toneOf()}}>
          {this.summary()}
        </div>
        <div style={ErrorPanel.STYLE.list}>
          {this.props.problems.map(this.renderProblem)}
        </div>
      </div>);
  }

  private renderProblem = (problem: Problem, index: number) => {
    return (
      <button key={index} data-problem=''
          style={{...ErrorPanel.STYLE.row,
            ...ErrorPanel.markFor(problem.severity),
            ...ErrorPanel.reachFor(problem)}}
          disabled={problem.box === null && problem.frame === null}
          title='Show it on the canvas'
          onClick={() => this.props.onSelect?.(problem)}>
        {problem.message}
      </button>);
  }

  private toneOf() {
    if(this.props.problems.length === 0) {
      return ErrorPanel.STYLE.valid;
    }
    return {};
  }

  private summary(): string {
    const problems = this.props.problems;
    if(problems.length === 0) {
      return 'Layout valid.';
    }
    const errors = problems.filter(
      problem => problem.severity === Severity.ERROR).length;
    const said = [] as string[];
    if(errors !== 0) {
      said.push(ErrorPanel.count(errors, 'error'));
    }
    if(errors !== problems.length) {
      said.push(ErrorPanel.count(problems.length - errors, 'warning'));
    }
    return said.join(', ');
  }

  private static count(many: number, what: string): string {
    if(many === 1) {
      return `1 ${what}`;
    }
    return `${many} ${what}s`;
  }

  private static reachFor(problem: Problem) {
    if(problem.box !== null || problem.frame !== null) {
      return {};
    }
    return ErrorPanel.STYLE.said;
  }

  private static markFor(severity: Severity) {
    if(severity === Severity.WARNING) {
      return ErrorPanel.STYLE.warning;
    }
    return ErrorPanel.STYLE.error;
  }

  private static readonly STYLE = {
    panel: {
      flexShrink: 0,
      height: '120px',
      display: 'flex',
      flexDirection: 'column' as 'column',
      borderTop: '1px solid #C8C8C8',
      backgroundColor: '#FFFFFF',
      fontSize: '12px'
    },
    heading: {
      flexShrink: 0,
      padding: '8px 20px 4px 20px',
      fontWeight: 700
    },
    list: {
      flexGrow: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column' as 'column',
      alignItems: 'flex-start',
      overflow: 'auto' as 'auto'
    },
    row: {
      flexShrink: 0,
      maxWidth: '100%',
      padding: '3px 20px',
      border: 'none',
      backgroundColor: 'transparent',
      fontFamily: 'inherit',
      fontSize: '12px',
      textAlign: 'left' as 'left',
      cursor: 'pointer'
    },
    said: {
      cursor: 'default' as 'default'
    },
    valid: {
      color: VALID_COLOR
    },
    error: {
      color: PROBLEM_COLOR
    },
    warning: {
      color: WARNING_COLOR
    }
  };
}
