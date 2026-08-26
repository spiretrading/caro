const {Board, Box, Component, SizePolicy} =
  require('./cjs/layout/index.js');
const {ensureBlank, isBlank, makeBlank, prune} =
  require('./cjs/editor/scenarios.js');

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if(!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if(!ok) {
    console.log(`        got  ${actual}`);
    console.log(`        want ${expected}`);
  }
}
function shape(component) {
  return component.layouts.map(l => {
    const name = l.condition === '' ? '.' : l.condition;
    return `${name}/${l.boxes.length}`;
  }).join(' ');
}
function populated(condition) {
  const layout = makeBlank();
  layout.condition = condition;
  layout.boxes.push(new Box('X', 0, 0, 10, 10, SizePolicy.FIXED,
    SizePolicy.FIXED));
  return layout;
}

check('a fresh scenario is blank', isBlank(makeBlank()), true);
const named = makeBlank();
named.condition = 'any < status is READY';
check('a named one is not', isBlank(named), false);
check('a drawn-in one is not', isBlank(populated('')), false);
const layered = makeBlank();
layered.overlays.push([]);
check('one carrying a layer is not', isBlank(layered), false);

// A section starting with nothing at all gets a default and a blank.
const fresh = new Component('Fresh', []);
ensureBlank(fresh);
check('an empty section gets a default and a blank',
  shape(fresh), './0 ./0');

// The invariant: a blank always waits at the end.
const component = new Component('Main', [makeBlank()]);
ensureBlank(component);
check('a blank waits beside the default from the start',
  shape(component), './0 ./0');
ensureBlank(component);
check('calling again adds nothing', shape(component), './0 ./0');
component.layouts[0] = populated('');
ensureBlank(component);
check('populating the default keeps just the one blank',
  shape(component), './1 ./0');
component.layouts[1].condition = 'any < status is READY';
ensureBlank(component);
check('naming the blank opens another',
  shape(component), './1 any < status is READY/0 ./0');

// Saving must never write the waiting blanks.
const board = new Board('Spec', [component,
  new Component('Other', [makeBlank()])]);
const saved = prune(board);
check('the trailing blank is dropped',
  shape(saved.components[0]), './1 any < status is READY/0');
check('a component that is only a blank default keeps it',
  shape(saved.components[1]), './0');
check('the board itself is untouched',
  shape(board.components[0]), './1 any < status is READY/0 ./0');

// Several blanks in a row are all dropped, but never the default.
const many = new Component('Many',
  [populated(''), makeBlank(), makeBlank(), makeBlank()]);
check('all trailing blanks go',
  shape(prune(new Board('S', [many])).components[0]), './1');
const empty = new Component('Empty', [makeBlank(), makeBlank()]);
check('the default survives even when blank',
  shape(prune(new Board('S', [empty])).components[0]), './0');

// A blank in the middle is deliberate and must stay.
const middle = new Component('Middle',
  [populated(''), makeBlank(), populated('any < x'), makeBlank()]);
check('only the trailing blank goes',
  shape(prune(new Board('S', [middle])).components[0]),
  './1 ./0 any < x/1');

const banner = failures === 0 ? 'blank scenarios behave' :
  `${failures} FAILURES`;
console.log('');
console.log(banner);
process.exit(failures === 0 ? 0 : 1);
