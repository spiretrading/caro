import { Board, Box, Component, Layout } from '../layout';

/** How much a problem matters. */
export enum Severity {

  /** The layout as drawn is wrong. */
  ERROR = 'error',

  /** Something is worth another look without being wrong on its own. */
  WARNING = 'warning'
}

/** Something amiss in a section. */
export interface Problem {

  /** How much the problem matters. */
  severity: Severity;

  /** What is wrong, naming where in the section it was found. */
  message: string;

  /** The canvas it was found in. */
  frame: Box[];

  /** The box to select to see it, null when no one box stands for it. */
  box: Box;
}

/** Returns what is amiss in each section of a board, by section, so that a
    section can be marked without being visited. */
export function validateBoard(board: Board): Map<Component, Problem[]> {
  const found = new Map<Component, Problem[]>();
  if(board === null) {
    return found;
  }
  for(const component of board.components) {
    found.set(component, validate(component));
  }
  return found;
}

/** Returns everything amiss in a section, in the order it is drawn. */
export function validate(component: Component): Problem[] {
  const problems = [] as Problem[];
  if(component === null) {
    return problems;
  }
  for(let index = 0; index !== component.layouts.length; ++index) {
    const layout = component.layouts[index];
    const caption = captionOf(layout, index);
    findFaults(layout.boxes, caption, problems);
    for(let order = 0; order !== layout.overlays.length; ++order) {
      findFaults(layout.overlays[order], `${caption}, layer ${order + 1}`,
        problems);
    }
  }
  return problems;
}

/** Reports what is amiss within one canvas. */
function findFaults(boxes: Box[], caption: string,
    problems: Problem[]): void {
  findOverlaps(boxes, caption, problems);
  findGaps(boxes, caption, problems);
}

/** Reports each pair of boxes covering the same space, naming the one
    underneath, which is the one a press on the canvas cannot reach. */
function findOverlaps(boxes: Box[], caption: string,
    problems: Problem[]): void {
  for(let under = 0; under !== boxes.length; ++under) {
    for(let over = under + 1; over !== boxes.length; ++over) {
      if(!boxes[under].overlaps(boxes[over])) {
        continue;
      }
      problems.push({
        severity: Severity.ERROR,
        message: `${caption}: ${nameOf(boxes[under])} is covered by ` +
          `${nameOf(boxes[over])}`,
        frame: boxes,
        box: boxes[under]
      });
    }
  }
}

/** Reports each run of space within a canvas that no box accounts for.

    The boxes are cut along every edge any of them has, which leaves a grid
    whose every cell is either wholly covered or wholly empty, since no edge
    can now fall inside a cell. Empty cells touching one another are the one
    gap between them. Comparing the area the boxes add up to against the
    space they span would answer only whether a gap exists, could not say
    where, and would call a layout whole when a gap and an overlap happen to
    cancel out. */
function findGaps(boxes: Box[], caption: string, problems: Problem[]): void {
  if(boxes.length < 2) {
    return;
  }
  const columns = edgesOf(boxes.map(box => box.x),
    boxes.map(box => box.right));
  const rows = edgesOf(boxes.map(box => box.y),
    boxes.map(box => box.bottom));
  const across = columns.length - 1;
  const down = rows.length - 1;
  const open = [] as boolean[];
  for(let column = 0; column !== across; ++column) {
    for(let row = 0; row !== down; ++row) {
      open[column * down + row] = !covered(boxes, columns[column],
        rows[row], columns[column + 1], rows[row + 1]);
    }
  }
  for(let column = 0; column !== across; ++column) {
    for(let row = 0; row !== down; ++row) {
      if(!open[column * down + row]) {
        continue;
      }
      problems.push(gapOf(spread(open, across, down, column, row),
        columns, rows, boxes, caption));
    }
  }
}

/** Returns the distinct edges of a set of boxes, in ascending order. */
function edgesOf(near: number[], far: number[]): number[] {
  const sorted = near.concat(far).sort((first, second) => first - second);
  const edges = [] as number[];
  for(const value of sorted) {
    if(edges.length === 0 || edges[edges.length - 1] !== value) {
      edges.push(value);
    }
  }
  return edges;
}

/** Returns whether any box covers a cell, which it does wholly or not at
    all. */
function covered(boxes: Box[], left: number, top: number, right: number,
    bottom: number): boolean {
  for(const box of boxes) {
    if(box.x <= left && box.y <= top && box.right >= right &&
        box.bottom >= bottom) {
      return true;
    }
  }
  return false;
}

/** Returns the run of empty cells reached from one, taking them as it
    goes so that a gap is reported once however many cells it spans. */
function spread(open: boolean[], across: number, down: number,
    column: number, row: number): number[][] {
  const region = [] as number[][];
  const pending = [[column, row]];
  open[column * down + row] = false;
  while(pending.length !== 0) {
    const cell = pending.pop();
    region.push(cell);
    const around = [[cell[0] - 1, cell[1]], [cell[0] + 1, cell[1]],
      [cell[0], cell[1] - 1], [cell[0], cell[1] + 1]];
    for(const next of around) {
      if(next[0] < 0 || next[0] === across || next[1] < 0 ||
          next[1] === down) {
        continue;
      }
      if(!open[next[0] * down + next[1]]) {
        continue;
      }
      open[next[0] * down + next[1]] = false;
      pending.push(next);
    }
  }
  return region;
}

/** Returns what to say about a run of empty cells, offering a box along its
    edge, a gap being nothing that can be selected in itself. */
function gapOf(region: number[][], columns: number[], rows: number[],
    boxes: Box[], caption: string): Problem {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for(const cell of region) {
    left = Math.min(left, columns[cell[0]]);
    right = Math.max(right, columns[cell[0] + 1]);
    top = Math.min(top, rows[cell[1]]);
    bottom = Math.max(bottom, rows[cell[1] + 1]);
  }
  const beside = bordering(region, columns, rows, boxes);
  const where = `${caption}: a gap ${right - left}x${bottom - top} at ` +
    `${left},${top}`;
  if(beside === null) {
    return {
      severity: Severity.ERROR,
      message: where,
      frame: boxes,
      box: null
    };
  }
  return {
    severity: Severity.ERROR,
    message: `${where}, beside ${nameOf(beside)}`,
    frame: boxes,
    box: beside
  };
}

/** Returns the box lying along the most of a run of empty cells, which is
    the one that reads as being beside the gap: a box merely touching the end
    of a long gap is along it as truly as the box running its whole length,
    and naming the first found would as often as not name that one. */
function bordering(region: number[][], columns: number[], rows: number[],
    boxes: Box[]): Box {
  let beside = null as Box;
  let most = 0;
  for(const box of boxes) {
    let shared = 0;
    for(const cell of region) {
      const left = columns[cell[0]];
      const right = columns[cell[0] + 1];
      const top = rows[cell[1]];
      const bottom = rows[cell[1] + 1];
      if(box.right === left || box.x === right) {
        shared += Math.max(
          Math.min(box.bottom, bottom) - Math.max(box.y, top), 0);
      }
      if(box.bottom === top || box.y === bottom) {
        shared += Math.max(
          Math.min(box.right, right) - Math.max(box.x, left), 0);
      }
    }
    if(shared > most) {
      most = shared;
      beside = box;
    }
  }
  return beside;
}

/** Returns what a scenario is called. */
function captionOf(layout: Layout, index: number): string {
  if(index === 0) {
    return 'default';
  }
  if(layout.condition === '') {
    return 'no condition';
  }
  return layout.condition;
}

/** Returns what a box is called, half of them standing for space alone and
    carrying no name to show. */
function nameOf(box: Box): string {
  if(box.name === '') {
    return 'space';
  }
  return `<${box.name}>`;
}
