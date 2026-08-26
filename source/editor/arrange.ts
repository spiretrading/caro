import { Box } from '../layout';

/** How many times boxes are shoved clear before the attempt is given up. */
const PASSES = 16;

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
        if(anchored) {
          shove(other, box);
        } else {
          shove(box, other);
        }
        shifted = true;
      }
    }
    if(!shifted) {
      return;
    }
  }
}

/** Moves a box to the nearest place clear of another. */
function shove(box: Box, other: Box): void {
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
    return;
  }
  box.x = best.x;
  box.y = best.y;
}
