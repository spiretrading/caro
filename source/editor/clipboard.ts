import { Box, Layout } from '../layout';

/** What was last copied. Boxes and a scenario are never held at once:
    copying either lets go of the other. */
export interface Clipboard {

  /** The boxes copied, empty when a scenario was copied instead. */
  boxes: Box[];

  /** The scenario copied, null when boxes were copied instead. */
  layout: Layout;

  /** The scenario the copy was taken from, which a paste is placed after,
      null when boxes were copied instead. */
  origin: Layout;
}

/** Returns a clipboard holding copies of some boxes. */
export function copyBoxes(boxes: Box[]): Clipboard {
  return {boxes: boxes.map(box => box.clone()), layout: null, origin: null};
}

/** Returns a clipboard holding a copy of a scenario. */
export function copyScenario(layout: Layout): Clipboard {
  return {boxes: [], layout: layout.clone(), origin: layout};
}
