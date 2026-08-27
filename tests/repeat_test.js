const {Box, RepeatDirection, SizePolicy} = require('./cjs/layout/index.js');
const {directionsFor, repeats, runsFrom, setHeightPolicy, setWidthPolicy,
  settleRepeat} = require('./cjs/editor/repeat.js');
const {importFrame} = require('./cjs/migration/flat_board.js');

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
function box(width, height) {
  return new Box('', 0, 0, 100, 100, width, height);
}
function sizing(box) {
  return [box.widthPolicy, box.heightPolicy];
}
const EVERY = [RepeatDirection.LEFT, RepeatDirection.RIGHT,
  RepeatDirection.UP, RepeatDirection.DOWN];

const fixed = box(SizePolicy.FIXED, SizePolicy.FIXED);
check('a box that does not repeat', repeats(fixed), false);
check('is asked nothing about which way it does', directionsFor(fixed), []);

// A box repeats as a whole, so an axis carries the other with it into
// repeating and back out again.
const whole = box(SizePolicy.FIXED, SizePolicy.FIXED);
setWidthPolicy(whole, SizePolicy.REPEAT);
check('repeating one axis repeats the box', sizing(whole),
  [SizePolicy.REPEAT, SizePolicy.REPEAT]);
check('and every direction is open to it', directionsFor(whole), EVERY);

whole.repeatDirection = RepeatDirection.DOWN;
setHeightPolicy(whole, SizePolicy.FILL);
check('sizing one axis otherwise stops the box repeating', sizing(whole),
  [SizePolicy.FILL, SizePolicy.FILL]);
check('and it no longer says which way it ran', whole.repeatDirection, null);

const apart = box(SizePolicy.FILL, SizePolicy.FILL);
setWidthPolicy(apart, SizePolicy.FIXED);
check('axes that are not repeating are sized on their own', sizing(apart),
  [SizePolicy.FIXED, SizePolicy.FILL]);

const down = box(SizePolicy.REPEAT, SizePolicy.REPEAT);
down.repeatDirection = RepeatDirection.DOWN;
setWidthPolicy(down, SizePolicy.REPEAT);
check('repeating a box that already repeats leaves its direction alone',
  down.repeatDirection, RepeatDirection.DOWN);

// The drawings themselves say nothing about direction, so a box read from
// one repeats without a direction until it is given one.
const drawn = box(SizePolicy.REPEAT, SizePolicy.REPEAT);
settleRepeat(drawn);
check('a box that repeats without saying which way stays that way',
  drawn.repeatDirection, null);
check('and is still offered every direction', directionsFor(drawn), EVERY);

const stopped = box(SizePolicy.REPEAT, SizePolicy.REPEAT);
stopped.repeatDirection = RepeatDirection.UP;
stopped.widthPolicy = SizePolicy.FIXED;
stopped.heightPolicy = SizePolicy.FIXED;
settleRepeat(stopped);
check('a direction outlasting the repeat that carried it is dropped',
  stopped.repeatDirection, null);

// The copies run away from the edge the original sits along, which is the
// edge the drawings mark in the strong purple.
check('a box repeating down runs from its top edge',
  runsFrom(RepeatDirection.DOWN), 'top');
check('one repeating up runs from its bottom',
  runsFrom(RepeatDirection.UP), 'bottom');
check('one repeating right runs from its left',
  runsFrom(RepeatDirection.RIGHT), 'left');
check('and one repeating left runs from its right',
  runsFrom(RepeatDirection.LEFT), 'right');

// A converted specification says which way its copies run, the parser
// having turned around the side the drawing marks.
const read = importFrame([{name: 'Item', x: 0, y: 0, width: 100, height: 20,
  width_policy: 'repeat', height_policy: 'repeat',
  repeat_direction: 'down'}]);
check('a repeat is read running the way it was converted as running',
  read[0].repeatDirection, RepeatDirection.DOWN);
const plain = importFrame([{name: 'Item', x: 0, y: 0, width: 100, height: 20,
  width_policy: 'repeat', height_policy: 'repeat', repeat_direction: ''}]);
check('and one marked nowhere is read as running nowhere',
  plain[0].repeatDirection, null);

const banner = failures === 0 ? 'a box repeats as a whole or not at all'
  : `${failures} FAILURES`;
console.log('');
console.log(banner);
process.exit(failures === 0 ? 0 : 1);
