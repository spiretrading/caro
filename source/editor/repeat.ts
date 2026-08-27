import { Box, RepeatDirection, SizePolicy } from '../layout';

/** One side of a box. */
export type Edge = 'left' | 'right' | 'top' | 'bottom';

/** The arrow each direction is marked with. */
export const REPEAT_GLYPH = {
  [RepeatDirection.LEFT]: '\u2190',
  [RepeatDirection.RIGHT]: '\u2192',
  [RepeatDirection.UP]: '\u2191',
  [RepeatDirection.DOWN]: '\u2193'
};

/** Returns whether a box repeats. */
export function repeats(box: Box): boolean {
  return box.widthPolicy === SizePolicy.REPEAT ||
    box.heightPolicy === SizePolicy.REPEAT;
}

/** Returns the directions a box may repeat in, which is every one of them
    while it repeats: a box repeats as a whole, and the side the copies run
    from is a matter of its own. */
export function directionsFor(box: Box): RepeatDirection[] {
  if(!repeats(box)) {
    return [];
  }
  return [RepeatDirection.LEFT, RepeatDirection.RIGHT, RepeatDirection.UP,
    RepeatDirection.DOWN];
}

/** Sizes a box across, carrying its other axis with it into or out of
    repeating, which a box does as a whole or not at all. */
export function setWidthPolicy(box: Box, policy: SizePolicy): void {
  const paired = policy === SizePolicy.REPEAT || repeats(box);
  box.widthPolicy = policy;
  if(paired) {
    box.heightPolicy = policy;
  }
  settleRepeat(box);
}

/** Sizes a box down, carrying its other axis with it into or out of
    repeating, which a box does as a whole or not at all. */
export function setHeightPolicy(box: Box, policy: SizePolicy): void {
  const paired = policy === SizePolicy.REPEAT || repeats(box);
  box.heightPolicy = policy;
  if(paired) {
    box.widthPolicy = policy;
  }
  settleRepeat(box);
}

/** Returns the edge a repeat runs from, which is the one facing the way it
    runs: the original sits along that edge and the copies march away from
    it. This is the edge the drawings mark. */
export function runsFrom(direction: RepeatDirection): Edge {
  if(direction === RepeatDirection.LEFT) {
    return 'right';
  }
  if(direction === RepeatDirection.RIGHT) {
    return 'left';
  }
  if(direction === RepeatDirection.UP) {
    return 'bottom';
  }
  return 'top';
}

/** Drops the direction of a box that no longer repeats, so that nothing is
    left saying which way a box runs that does not run at all. */
export function settleRepeat(box: Box): void {
  if(directionsFor(box).indexOf(box.repeatDirection) === -1) {
    box.repeatDirection = null;
  }
}
