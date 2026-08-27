// Checks what the error panel is told about a section.
const {Board, Box, Component, Layout, RepeatDirection,
  SizePolicy} = require('./cjs/layout/index.js');
const {Severity, validate,
  validateBoard} = require('./cjs/editor/validation.js');

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

function repeating(x, y, width, height, direction) {
  const made = new Box('', x, y, width, height, SizePolicy.REPEAT,
    SizePolicy.REPEAT);
  made.repeatDirection = direction;
  return made;
}

function said(problems) {
  return problems.map(problem => problem.message);
}

function sectionOf(boxes) {
  return new Component('Main', [new Layout('', '', boxes, [])]);
}

check('a section with nothing in it says nothing',
  said(validate(sectionOf([]))), []);
check('and neither does one with a single box',
  said(validate(sectionOf([box('Body', 0, 0, 100, 100)]))), []);

// Boxes brought up against one another meet rather than overlap, on either
// axis and at a corner, and leave nothing unaccounted for between them.
const met = [box('Left', 0, 0, 100, 100), box('Right', 100, 0, 100, 100),
  box('Below', 0, 100, 100, 100), box('Corner', 100, 100, 100, 100)];
check('boxes tiling a square are whole and cover one another nowhere',
  said(validate(sectionOf(met))), []);

// A box drawn within another covers it without leaving a gap anywhere, so
// the overlap is all there is to say.
const body = box('Body', 0, 0, 200, 120);
const header = box('Header', 50, 30, 100, 60);
const covered = validate(sectionOf([body, header]));
check('a box drawn over another is an error',
  said(covered), ['default: <Body> is covered by <Header>']);
check('reported as an error rather than a warning',
  covered[0].severity, Severity.ERROR);
check('and what it offers is the box underneath',
  covered[0].box === body, true);

// The box underneath is the one drawn first, since a canvas paints them in
// order and a press finds the topmost.
const swapped = validate(sectionOf([header, body]));
check('drawing them the other way round names the other one',
  said(swapped), ['default: <Header> is covered by <Body>']);
check('which is again the one underneath', swapped[0].box === header, true);

check('a box standing for space alone is named as space',
  said(validate(sectionOf([box('', 0, 0, 200, 120), header.clone()]))),
  ['default: space is covered by <Header>']);

// Every pair is reported, so that a box buried under two is not half told.
const piled = [box('A', 0, 0, 120, 120), box('B', 10, 10, 100, 100),
  box('C', 20, 20, 80, 80)];
check('three boxes over one another are three pairs',
  said(validate(sectionOf(piled))), [
    'default: <A> is covered by <B>',
    'default: <A> is covered by <C>',
    'default: <B> is covered by <C>']);

// Space nothing accounts for is a gap, named by where it is and offering a
// box along its edge, a gap being nothing that can be selected in itself.
const apart = [box('Left', 0, 0, 100, 100), box('Right', 140, 0, 100, 100)];
const gapped = validate(sectionOf(apart));
check('space between two boxes is a gap',
  said(gapped), ['default: a gap 40x100 at 100,0, beside <Left>']);
check('and what it offers is a box along its edge',
  gapped[0].box === apart[0], true);

// A gap is one gap however many cells the cutting leaves it in, and an
// L is the plainest case of a gap the cut lines run through.
const bent = [box('A', 0, 0, 100, 100), box('B', 100, 0, 100, 100),
  box('C', 0, 100, 100, 100)];
check('a bent gap is reported once',
  said(validate(sectionOf(bent))),
  ['default: a gap 100x100 at 100,100, beside <B>']);

const holed = [box('Top', 0, 0, 300, 50), box('Left', 0, 50, 50, 100),
  box('Right', 250, 50, 50, 100), box('Bottom', 0, 150, 300, 50)];
check('a hole ringed by boxes is a gap',
  said(validate(sectionOf(holed))),
  ['default: a gap 200x100 at 50,50, beside <Top>']);

const twice = [box('A', 0, 0, 50, 50), box('B', 100, 0, 50, 50),
  box('C', 200, 0, 50, 50)];
check('two gaps are two problems', said(validate(sectionOf(twice))), [
  'default: a gap 50x50 at 50,0, beside <A>',
  'default: a gap 50x50 at 150,0, beside <B>']);

// A gap and an overlap of the same size leave the boxes adding up to the
// space they span, which is why the area is not what is measured.
const cancelling = [box('A', 0, 0, 100, 100), box('B', 50, 0, 100, 100),
  box('C', 200, 0, 100, 100)];
check('a gap is found though the areas come out equal',
  said(validate(sectionOf(cancelling))), [
    'default: <A> is covered by <B>',
    'default: a gap 50x100 at 150,0, beside <B>']);

// A scenario is named by its condition, and the default by being the
// default, so a problem says which canvas to look at.
const scenarios = new Component('Main', [
  new Layout('', '', [], []),
  new Layout('any < modified', '', [body.clone(), header.clone()], []),
  new Layout('', '', [body.clone(), header.clone()], [])]);
check('a scenario is named by its condition, and the default by name',
  said(validate(scenarios)), [
    'any < modified: <Body> is covered by <Header>',
    'no condition: matches everything, so no scenario before it can be ' +
      'reached',
    'no condition: <Body> is covered by <Header>']);

const layered = new Component('Main', [
  new Layout('', '', [], [[apart[0].clone(), apart[1].clone()]])]);
check('a layer is named by the scenario it covers and its order',
  said(validate(layered)),
  ['default, layer 1: a gap 40x100 at 100,0, beside <Left>']);

// A scenario is chosen by reading right to left and taking the first that
// matches, so one carrying no condition leaves everything before it dead.
const shadowed = new Component('Main', [
  new Layout('', '', [box('A', 0, 0, 100, 100)], []),
  new Layout('any < modified', '', [box('B', 0, 0, 100, 100)], []),
  new Layout('', '', [box('C', 0, 0, 100, 100)], [])]);
check('a scenario with no condition shadows every one before it',
  said(validate(shadowed)), ['no condition: matches everything, so no ' +
    'scenario before it can be reached']);

// The blank waiting past the last scenario carries no condition either, but
// nothing has been drawn in it and it is dropped when the file is written.
const waiting = new Component('Main', [
  new Layout('', '', [box('A', 0, 0, 100, 100)], []),
  new Layout('', '', [], [])]);
check('the blank waiting past the last scenario is not one of them',
  said(validate(waiting)), []);

const repeated = new Component('Main', [
  new Layout('', '', [box('A', 0, 0, 100, 100)], []),
  new Layout('any < modified', '', [box('B', 0, 0, 100, 100)], []),
  new Layout('any < modified', '', [box('C', 0, 0, 100, 100)], [])]);
check('a condition used twice leaves the earlier scenario unreachable',
  said(validate(repeated)), ['any < modified: repeats a condition, so the ' +
    'earlier scenario cannot be reached']);

// A box repeats whatever is drawn on the edge its copies run from, so
// something has to be there and it has to span the box.
check('a repeat attached to what it repeats is sound',
  said(validate(sectionOf([box('Item', 0, 0, 150, 26),
    repeating(0, 26, 150, 26, RepeatDirection.DOWN)]))), []);
check('and so is one attached to a row of cells spanning it together',
  said(validate(sectionOf([box('Head', 0, 0, 80, 26),
    box('Tail', 80, 0, 70, 26),
    repeating(0, 26, 150, 26, RepeatDirection.DOWN)]))), []);

const nowhere = validate(sectionOf([box('Item', 0, 0, 150, 26),
  repeating(0, 26, 150, 26, RepeatDirection.RIGHT)]));
check('a repeat running from an edge with nothing on it is an error',
  said(nowhere), ['default: space repeats right with nothing on its left ' +
    'to repeat']);
check('reported against the box that repeats',
  nowhere[0].severity, Severity.ERROR);

check('a repeat wider than what it repeats is an error',
  said(validate(sectionOf([box('Item', 0, 0, 100, 26),
    repeating(0, 26, 150, 26, RepeatDirection.DOWN)]))), [
    'default: a gap 50x26 at 100,0, beside space',
    'default: space repeats down but what is on its top does not span it']);

const adrift = validate(sectionOf([box('Item', 0, 0, 150, 26),
  repeating(0, 26, 150, 26, null)]));
check('a repeat that does not say which way it runs is a warning',
  said(adrift), ['default: space repeats without saying which way it runs']);
check('and only a warning, the drawing being unfinished rather than wrong',
  adrift[0].severity, Severity.WARNING);

// A problem says which canvas it was found in, so that the outline can mark
// the row holding it rather than hunt for it.
const framed = sectionOf(
  [box('Left', 0, 0, 100, 100), box('Right', 140, 0, 100, 100)]);
check('a problem names the canvas it was found in',
  validate(framed)[0].frame === framed.layouts[0].boxes, true);

// Every section of a board is read, so that one can be marked in the
// outline without being opened.
const whole = sectionOf(
  [box('Left', 0, 0, 100, 100), box('Right', 100, 0, 100, 100)]);
const spread = new Board('Spec', [framed,
  new Component('Other', whole.layouts), new Component('Empty', [])]);
const bySection = validateBoard(spread);
check('every section of a board is read',
  spread.components.map(component => said(bySection.get(component))),
  [['default: a gap 40x100 at 100,0, beside <Left>'], [], []]);

// None of these is anything a drawing arrives with; each is a rename or a
// press away in the editor, and would be saved as it stands.
const nameless = new Component('', [new Layout('', '', [], [])]);
const twinned = new Component('Div:Body', [new Layout('', '', [], [])]);
const alike = new Component('Div:Body', [new Layout('', '', [], [])]);
const named = new Component('Main', [new Layout('', '', [], [])]);
const board = new Board('Spec', [named, nameless, twinned, alike,
  new Component('Div:', [new Layout('', '', [], [])])]);
const byName = validateBoard(board);
check('a section with no name can be named by nothing',
  said(byName.get(nameless)),
  ['The section has no name, so nothing can name it']);
check('and neither can one whose name is only its element',
  said(byName.get(board.components[4])),
  ['The section has no name, so nothing can name it']);
check('two sections called the same cannot be told apart',
  [said(byName.get(twinned)), said(byName.get(alike))],
  [['Another section is called Div:Body too, so a box naming it cannot ' +
    'say which'],
   ['Another section is called Div:Body too, so a box naming it cannot ' +
    'say which']]);
check('a section named once and named at all says nothing',
  said(byName.get(named)), []);
check('a section is not read for this on its own, only against a board',
  said(validate(nameless)), []);

const bare = new Component('Main', [
  new Layout('', '', [box('A', 0, 0, 100, 100)], [[]])]);
const empty = validate(bare);
check('a layer with nothing drawn in it is a warning',
  said(empty), ['default, layer 1: nothing has been drawn in it']);
check('and only a warning, an empty layer drawing nothing either way',
  empty[0].severity, Severity.WARNING);

check('a section that is not there says nothing', validate(null), []);
check('and neither does a board that is not there',
  validateBoard(null).size, 0);

console.log(failures === 0 ? '\nthe section is read for what is amiss' :
  `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
