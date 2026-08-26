const {Box, SizePolicy} = require('./cjs/layout/index.js');
const {boxAt, copyOf, extentOf, push} =
  require('./cjs/editor/arrange.js');

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if(!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if(!ok) {
    console.log(`        got  ${JSON.stringify(actual)}`);
    console.log(`        want ${JSON.stringify(expected)}`);
  }
}
function box(name, x, y, width, height) {
  return new Box(name, x, y, width, height, SizePolicy.FIXED,
    SizePolicy.FIXED);
}
function place(box) {
  return `${box.x},${box.y}`;
}
function clear(boxes) {
  for(const box of boxes) {
    for(const other of boxes) {
      if(box !== other && box.overlaps(other)) {
        return false;
      }
    }
  }
  return true;
}

// What space a set of boxes covers.
check('nothing covers nothing', extentOf([]),
  {x: 0, y: 0, width: 0, height: 0});
check('one box covers itself', extentOf([box('A', 10, 20, 30, 40)]),
  {x: 10, y: 20, width: 30, height: 40});
check('several cover the space around them all',
  extentOf([box('A', 10, 20, 30, 40), box('B', 100, 0, 50, 10)]),
  {x: 10, y: 0, width: 140, height: 60});

// Which box a point falls in. A box holds up to but not including its far
// edges, so boxes laid flush against each other never both claim a point.
const row = [box('A', 0, 0, 100, 100), box('B', 100, 0, 100, 100)];
check('a point inside a box finds it', boxAt(row, 50, 50).name, 'A');
check('the shared edge belongs to the box beginning there',
  boxAt(row, 100, 50).name, 'B');
check('a point past the last edge finds nothing',
  boxAt(row, 200, 50), null);
check('a point above them finds nothing', boxAt(row, 50, -1), null);
const stack = [box('under', 0, 0, 100, 100), box('over', 20, 20, 40, 40)];
check('the topmost box wins where they overlap',
  boxAt(stack, 30, 30).name, 'over');
check('and the one beneath keeps the rest', boxAt(stack, 80, 80).name,
  'under');

// A box holds its place until the one being moved has covered it past its
// middle, so that boxes can be brought up against each other and lined up.
const held = box('A', 0, 100, 100, 100);
const nudge = box('B', 0, 30, 100, 100);
push([held, nudge], [nudge]);
check('a box short of the middle holds its place', place(held), '0,100');
check('and the box being moved stays where it was put', place(nudge),
  '0,30');

const given = box('A', 0, 100, 100, 100);
const carried = box('B', 0, 60, 100, 100);
push([given, carried], [carried]);
check('past the middle it gives way', place(given), '0,160');
check('the box being moved still stays put', place(carried), '0,60');
check('and the two no longer overlap', given.overlaps(carried), false);

// It gives way to the nearest place clear of the box that displaced it,
// which here is sideways rather than the longer way down.
const beside = box('A', 200, 0, 100, 100);
const shover = box('B', 240, 0, 100, 100);
push([beside, shover], [shover]);
check('and it goes the shortest way clear', place(beside), '140,0');
check('landing clear of what displaced it', beside.overlaps(shover), false);

// Nothing is ever pushed off the top or left of the canvas.
const cornered = box('A', 0, 0, 100, 100);
const intruder = box('B', 0, 0, 100, 100);
push([cornered, intruder], [intruder]);
check('a box at the corner is not pushed off the canvas',
  cornered.x >= 0 && cornered.y >= 0, true);
check('and the box being moved is still where it was put',
  place(intruder), '0,0');

// A copy sits clear of what it was taken from, and a set of them keeps its
// arrangement.
const original = [box('A', 40, 40, 100, 100), box('B', 200, 40, 60, 80)];
const copies = copyOf(original);
check('a copy is offset from what it was taken from',
  copies.map(place), ['60,60', '220,60']);
check('keeping the space between them',
  copies[1].x - copies[0].x, original[1].x - original[0].x);
check('and its size and name', copies.map(
  box => `${box.name} ${box.width}x${box.height}`),
  ['A 100x100', 'B 60x80']);
copies[0].width = 1;
check('a copy is its own box', original[0].width, 100);

const banner = failures === 0 ? 'boxes give way as they should' :
  `${failures} FAILURES`;
console.log('');
console.log(banner);
process.exit(failures === 0 ? 0 : 1);
