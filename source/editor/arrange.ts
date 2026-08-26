import { Box } from '../layout';

/** How many times boxes are shoved clear before the attempt is given up. */
const PASSES = 16;

/** How far a pasted copy sits from what it was copied from. */
const OFFSET = 20;

/** Returns copies of a set of boxes, shifted together so that a copy does
    not sit hidden behind what it was copied from. */
export function copyOf(boxes: Box[]): Box[] {
  return boxes.map(box => {
    const copy = box.clone();
    copy.x = box.x + OFFSET;
    copy.y = box.y + OFFSET;
    return copy;
  });
}

/** Returns the space a set of boxes covers. */
export function extentOf(boxes: Box[]) {
  if(boxes.length === 0) {
    return {x: 0, y: 0, width: 0, height: 0};
  }
  const x = Math.min(...boxes.map(box => box.x));
  const y = Math.min(...boxes.map(box => box.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map(box => box.right)) - x,
    height: Math.max(...boxes.map(box => box.bottom)) - y
  };
}

/** Returns the topmost box covering a point, or null when none does. */
export function boxAt(boxes: Box[], x: number, y: number): Box {
  for(let index = boxes.length - 1; index >= 0; index -= 1) {
    const box = boxes[index];
    if(x >= box.x && x < box.right && y >= box.y && y < box.bottom) {
      return box;
    }
  }
  return null;
}

/** Shoves boxes out of the way of the ones being moved, so that no two boxes
    ever cover the same space. The moved boxes stay where they were put; the
    rest give way. */
export function push(boxes: Box[], moving: Box[]): void {
  for(let pass = 0; pass < PASSES; pass += 1) {
    let shifted = false;
    for(const box of boxes) {
      for(const other of boxes) {
        if(box === other || !box.overlaps(other)) {
          continue;
        }
        const anchored = moving.indexOf(box) !== -1;
        if(anchored && moving.indexOf(other) !== -1) {
          continue;
        }
        const gave = (() => {
          if(anchored) {
            return shove(other, box);
          }
          return shove(box, other);
        })();
        shifted = shifted || gave;
      }
    }
    if(!shifted) {
      return;
    }
  }
}

/** Returns whether a box has been covered past its middle, which is when it
    gives way. Until then it holds its place, so that a box can be brought
    right up against another and lined up with it without the other fleeing
    the moment the two touch. The middle that counts is measured across
    whichever axis the boxes are least deeply into each other, since that is
    the one they are meeting along. */
function buried(box: Box, other: Box): boolean {
  const across = Math.min(box.right, other.right) - Math.max(box.x, other.x);
  const down = Math.min(box.bottom, other.bottom) - Math.max(box.y, other.y);
  if(across < down) {
    return across > box.width / 2;
  }
  return down > box.height / 2;
}

/** Moves a box to the nearest place clear of another, once it has been
    covered deeply enough to give way at all. */
function shove(box: Box, other: Box): boolean {
  if(!buried(box, other)) {
    return false;
  }
  const places = [
    {x: other.x - box.width, y: box.y},
    {x: other.right, y: box.y},
    {x: box.x, y: other.y - box.height},
    {x: box.x, y: other.bottom}
  ];
  let best = null as {x: number, y: number};
  let least = Infinity;
  for(const place of places) {
    if(place.x < 0 || place.y < 0) {
      continue;
    }
    const travel = Math.abs(place.x - box.x) + Math.abs(place.y - box.y);
    if(travel < least) {
      least = travel;
      best = place;
    }
  }
  if(best === null) {
    return false;
  }
  box.x = best.x;
  box.y = best.y;
  return true;
}
