const {Board, Box, Component, Layout, SizePolicy} =
  require('./cjs/layout/index.js');
const {History, restoreSnapshot, takeSnapshot} =
  require('./cjs/editor/history.js');

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
function box(name, x, y) {
  return new Box(name, x, y, 100, 20, SizePolicy.FIXED, SizePolicy.FIXED);
}
function board() {
  const first = new Layout('', '', [box('A', 0, 0), box('B', 0, 40)], []);
  const second = new Layout('narrow', '', [box('C', 0, 0)], [[box('D', 0, 0)]]);
  return new Board('Untitled', [new Component('Main', [first, second]),
    new Component('Side', [new Layout('', '', [box('E', 0, 0)], [])])]);
}
function names(boxes) {
  return boxes.map(box => box.name);
}

// What is being worked on is found again by where it sits, since a
// specification put back is built afresh and holds none of the same boxes.
const first = board();
const layouts = first.components[0].layouts;
const kept = takeSnapshot(first, first.components[0],
  [layouts[1].boxes[0], layouts[1].overlays[0][0]], layouts[1].overlays[0]);
check('a box is remembered by where it sits', kept.selection,
  [[0, 1, -1, 0], [0, 1, 0, 0]]);
check('and so is the canvas being worked in', kept.active, [0, 1, 0]);
const back = restoreSnapshot(kept);
check('a specification comes back whole',
  back.board.components.map(component => component.name), ['Main', 'Side']);
check('with the boxes that were selected still selected',
  names(back.selection), ['C', 'D']);
check('found in the specification put back',
  back.selection[0] === back.board.components[0].layouts[1].boxes[0], true);
check('and none of them the boxes it was taken from',
  back.selection[0] === layouts[1].boxes[0], false);
check('the canvas being worked in is the one it was',
  back.active === back.board.components[0].layouts[1].overlays[0], true);
check('and the section being edited likewise',
  back.component === back.board.components[0], true);

// A box that has gone is no longer selected, rather than coming back as
// something else that happens to sit where it sat.
const emptied = takeSnapshot(first, first.components[0],
  [layouts[1].overlays[0][0]], layouts[1].overlays[0]);
emptied.board = new Board('Untitled',
  [new Component('Main', [new Layout('', '', [], [])])]).toJson();
const thinned = restoreSnapshot(emptied);
check('a box that is no longer there is not selected',
  thinned.selection.length, 0);
check('and a canvas that is no longer there is not worked in',
  thinned.active, null);

// The history holds what a specification has passed through.
const start = takeSnapshot(first, first.components[0], [], null);
const history = new History(start);
check('there is nothing to take back to begin with', history.canUndo, false);
check('nor anything to put back', history.canRedo, false);

const one = board();
one.components[0].layouts[0].boxes.push(box('F', 0, 80));
const added = takeSnapshot(one, one.components[0], [], null);
history.record(added, null);
check('a change can be taken back', history.canUndo, true);
check('taking it back returns what came before',
  names(restoreSnapshot(history.undo()).board.components[0].layouts[0].boxes),
  ['A', 'B']);
check('and there is then something to put back', history.canRedo, true);
check('putting it back returns the change',
  names(restoreSnapshot(history.redo()).board.components[0].layouts[0].boxes),
  ['A', 'B', 'F']);
check('with nothing left to put back after that', history.canRedo, false);

// A change made after taking one back leaves nothing to put back: the
// specification has gone another way.
history.undo();
const other = board();
other.components[0].layouts[0].boxes.push(box('G', 0, 80));
history.record(takeSnapshot(other, other.components[0], [], null), null);
check('a change made after taking one back drops what was put aside',
  history.canRedo, false);

// Changes tagged alike run together, so that a name typed a letter at a
// time is taken back a name at a time.
const typed = new History(start);
for(const name of ['N', 'Na', 'Nam', 'Name']) {
  const state = board();
  state.components[0].layouts[0].boxes[0].name = name;
  typed.record(takeSnapshot(state, state.components[0], [], null), 'name');
}
check('a run of changes tagged alike is one step',
  restoreSnapshot(typed.undo()).board.components[0].layouts[0].boxes[0].name,
  'A');
check('with nothing further to take back', typed.canUndo, false);

// A run ends when something else happens, or when what is being worked on
// changes, since what is typed next is being typed into something else.
const mixed = new History(start);
const once = board();
once.components[0].layouts[0].boxes[0].name = 'First';
mixed.record(takeSnapshot(once, once.components[0], [], null), 'name');
mixed.note(takeSnapshot(once, once.components[0],
  [once.components[0].layouts[0].boxes[1]], null));
const twice = board();
twice.components[0].layouts[0].boxes[0].name = 'Second';
mixed.record(takeSnapshot(twice, twice.components[0], [], null), 'name');
check('a run broken off does not gather what follows it',
  restoreSnapshot(mixed.undo()).board.components[0].layouts[0].boxes[0].name,
  'First');

// What is being worked on is put back with the change it belongs to, so
// that taking back a deletion selects what it took away.
const held = new History(start);
const selected = board();
held.note(takeSnapshot(selected, selected.components[0],
  [selected.components[0].layouts[0].boxes[1]], null));
const short = board();
short.components[0].layouts[0].boxes.splice(1, 1);
held.record(takeSnapshot(short, short.components[0], [], null), null);
const returned = restoreSnapshot(held.undo());
check('taking back a deletion selects what it took away',
  names(returned.selection), ['B']);
check('and what was noted is no change of its own',
  names(returned.board.components[0].layouts[0].boxes), ['A', 'B']);

// A change that changes nothing is not a step of its own, so that a gesture
// that put everything back where it was is not taken back twice.
const still = new History(start);
still.record(takeSnapshot(board(), first.components[0], [], null), null);
check('a change that changed nothing is no step at all', still.canUndo,
  false);

const banner = failures === 0 ? 'a specification can be taken back'
  : `${failures} FAILURES`;
console.log('');
console.log(banner);
process.exit(failures === 0 ? 0 : 1);
