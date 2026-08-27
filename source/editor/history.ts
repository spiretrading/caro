import { Board, Box, Component } from '../layout';

/** How many steps back the history holds. */
const DEPTH = 100;

/** Where something sits in a specification, named by number so that it can
    be found again in one restored from a snapshot: the section, the
    scenario, the layer within it or -1 for the scenario's own boxes, and,
    for a box, its place among them. */
export type Place = number[];

/** A specification as it stood, with what was being worked on in it. */
export interface Snapshot {

  /** The specification itself. */
  board: string;

  /** Which section was being edited. */
  component: number;

  /** Where the selected boxes sat. */
  selection: Place[];

  /** Where the canvas being worked in sat, null when none was. */
  active: Place;
}

/** A specification taken back out of a snapshot. */
export interface Restored {

  /** The specification. */
  board: Board;

  /** The section being edited. */
  component: Component;

  /** The boxes selected. */
  selection: Box[];

  /** The canvas being worked in, null when none was. */
  active: Box[];
}

/** Returns where a box sits, null when it sits nowhere in the board. */
export function placeOf(board: Board, box: Box): Place {
  for(let section = 0; section < board.components.length; section += 1) {
    const layouts = board.components[section].layouts;
    for(let scenario = 0; scenario < layouts.length; scenario += 1) {
      const own = layouts[scenario].boxes.indexOf(box);
      if(own !== -1) {
        return [section, scenario, -1, own];
      }
      const overlays = layouts[scenario].overlays;
      for(let layer = 0; layer < overlays.length; layer += 1) {
        const inside = overlays[layer].indexOf(box);
        if(inside !== -1) {
          return [section, scenario, layer, inside];
        }
      }
    }
  }
  return null;
}

/** Returns where a canvas sits, null when it belongs to no section. */
export function placeOfHolder(board: Board, boxes: Box[]): Place {
  if(boxes === null) {
    return null;
  }
  for(let section = 0; section < board.components.length; section += 1) {
    const layouts = board.components[section].layouts;
    for(let scenario = 0; scenario < layouts.length; scenario += 1) {
      if(layouts[scenario].boxes === boxes) {
        return [section, scenario, -1];
      }
      const layer = layouts[scenario].overlays.indexOf(boxes);
      if(layer !== -1) {
        return [section, scenario, layer];
      }
    }
  }
  return null;
}

/** Returns the box a place names, null when the place names none. */
export function boxAtPlace(board: Board, place: Place): Box {
  const holder = holderAtPlace(board, place);
  if(holder === null) {
    return null;
  }
  return holder[place[3]] ?? null;
}

/** Returns the canvas a place names, null when the place names none. */
export function holderAtPlace(board: Board, place: Place): Box[] {
  if(place === null) {
    return null;
  }
  const component = board.components[place[0]];
  if(component === undefined) {
    return null;
  }
  const layout = component.layouts[place[1]];
  if(layout === undefined) {
    return null;
  }
  if(place[2] === -1) {
    return layout.boxes;
  }
  return layout.overlays[place[2]] ?? null;
}

/** Returns a specification as it now stands, along with what is being
    worked on in it. */
export function takeSnapshot(board: Board, component: Component,
    selection: Box[], active: Box[]): Snapshot {
  return {
    board: board.toJson(),
    component: board.components.indexOf(component),
    selection: selection.map(box => placeOf(board, box)).filter(
      place => place !== null),
    active: placeOfHolder(board, active)
  };
}

/** Returns the specification a snapshot holds, with what was being worked
    on found again within it. */
export function restoreSnapshot(snapshot: Snapshot): Restored {
  const board = Board.fromJson(snapshot.board);
  return {
    board,
    component: board.components[snapshot.component] ?? null,
    selection: snapshot.selection.map(
      place => boxAtPlace(board, place)).filter(box => box !== null),
    active: holderAtPlace(board, snapshot.active)
  };
}

/** The specifications a session has passed through, so that a change can be
    taken back and put back again. */
export class History {
  constructor(present: Snapshot) {
    this.present = present;
    this.past = [];
    this.future = [];
    this.tag = null;
  }

  /** Whether there is a change to take back. */
  public get canUndo(): boolean {
    return this.past.length !== 0;
  }

  /** Whether there is a change to put back. */
  public get canRedo(): boolean {
    return this.future.length !== 0;
  }

  /** Records how a specification now stands. Changes tagged alike run
      together into a single step, so that a name typed a letter at a time
      is taken back a name at a time rather than a letter at a time. */
  public record(present: Snapshot, tag: string): void {
    if(present.board !== this.present.board) {
      if(tag === null || tag !== this.tag) {
        this.past.push(this.present);
        if(this.past.length > DEPTH) {
          this.past.shift();
        }
      }
      this.future = [];
    }
    this.present = present;
    this.tag = tag;
  }

  /** Notes what is being worked on without counting it as a change, so that
      a change taken back is taken back with whatever was selected when it
      was made. The specification itself is left as it was recorded, since
      what is selected says nothing about it. This ends a run of changes
      gathered together, so that whatever comes next begins a step of its
      own. */
  public note(present: Snapshot): void {
    this.present = {
      board: this.present.board,
      component: present.component,
      selection: present.selection,
      active: present.active
    };
    this.tag = null;
  }

  /** Returns the specification as it stood before the last change, null
      when there is nothing to take back. */
  public undo(): Snapshot {
    if(!this.canUndo) {
      return null;
    }
    this.future.push(this.present);
    this.present = this.past.pop();
    this.tag = null;
    return this.present;
  }

  /** Returns the specification as it stood before the last change was taken
      back, null when none was. */
  public redo(): Snapshot {
    if(!this.canRedo) {
      return null;
    }
    this.past.push(this.present);
    this.present = this.future.pop();
    this.tag = null;
    return this.present;
  }

  /** Starts afresh, the specification given being all there is. */
  public reset(present: Snapshot): void {
    this.present = present;
    this.past = [];
    this.future = [];
    this.tag = null;
  }

  private present: Snapshot;
  private past: Snapshot[];
  private future: Snapshot[];
  private tag: string;
}
