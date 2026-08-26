// Checks selecting several boxes with shift, then moving, deleting and
// resizing them together.
const http = require('http');

const PORT = 9222;

function get(target) {
  return new Promise((resolve, reject) => {
    http.get({host: '127.0.0.1', port: PORT, path: target}, response => {
      let body = '';
      response.on('data', chunk => body += chunk);
      response.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

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

async function main() {
  const page = (await get('/json/list')).find(t => t.type === 'page');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => socket.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if(pending.has(message.id)) {
      pending.get(message.id)(message.result);
      pending.delete(message.id);
    }
  });
  const send = (method, params) => new Promise(resolve => {
    id++;
    pending.set(id, resolve);
    socket.send(JSON.stringify({id, method, params: params || {}}));
  });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate',
      {expression, returnByValue: true, awaitPromise: true});
    if(r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
    }
    return r.result.value;
  };
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const SHIFT = 8;
  const move = (x, y, type, modifiers) => send('Input.dispatchMouseEvent',
    {type, x: Math.round(x), y: Math.round(y), button: 'left', buttons: 1,
      clickCount: 1, modifiers: modifiers || 0});
  const tap = async (point, modifiers) => {
    await move(point.x, point.y, 'mousePressed', modifiers);
    await move(point.x, point.y, 'mouseReleased', modifiers);
    await pause(300);
  };
  const drag = async (from, to) => {
    await move(from.x, from.y, 'mousePressed');
    for(let i = 1; i <= 10; i++) {
      await move(from.x + (to.x - from.x) * i / 10,
        from.y + (to.y - from.y) * i / 10, 'mouseMoved');
      await pause(30);
    }
    await move(to.x, to.y, 'mouseReleased');
    await pause(450);
  };
  const key = async name => {
    const code = name === 'Delete' ? 46 : 27;
    for(const type of ['keyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', {type, key: name, code: name,
        windowsVirtualKeyCode: code, nativeVirtualKeyCode: code});
    }
    await pause(350);
  };
  const canvas = () => evaluate(`(() => {
    const r = document.querySelector(
      '[data-canvas]').getBoundingClientRect();
    return {left: r.left, top: r.top};
  })()`);
  // Every box on the first canvas, by its name, with where it sits.
  const BOXES = `(() => {
    const canvas = document.querySelector('[data-canvas]');
    const found = [];
    const walk = element => {
      for(const child of element.children) {
        if(child.style.boxShadow.indexOf('inset') !== -1) found.push(child);
        else if(child.children.length) walk(child);
      }
    };
    walk(canvas);
    return found.map(box => {
      const r = box.getBoundingClientRect();
      const label = box.querySelector('span');
      return {name: label === null ? '' : label.textContent.trim(),
        left: Math.round(r.left), top: Math.round(r.top),
        width: Math.round(r.width), height: Math.round(r.height),
        selected: box.style.outline.indexOf('104, 75, 199') !== -1};
    });
  })()`;
  const boxes = () => evaluate(BOXES);
  const at = async name => {
    const found = (await boxes()).find(box => box.name === name);
    return {x: found.left + found.width / 2, y: found.top + found.height / 2};
  };
  const panel = () => evaluate(`document.body.textContent`);
  const name = async (text) => {
    await evaluate(`(() => {
      const field = document.querySelector('input[placeholder="Element:Name"]');
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value').set;
      setter.call(field, ${JSON.stringify(text)});
      field.dispatchEvent(new Event('input', {bubbles: true}));
    })()`);
    await pause(300);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',
    {width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false});
  await send('Page.navigate', {url: 'http://localhost:8080/'});
  await pause(1800);
  await evaluate(`Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.trim() === 'New').click()`);
  await pause(400);

  // Three boxes stacked in a column, named A, B and C.
  const c = await canvas();
  for(const [index, label] of [['A'], ['B'], ['C']].entries()) {
    const top = c.top + 10 + index * 60;
    await drag({x: c.left + 20, y: top}, {x: c.left + 220, y: top + 50});
    await name(label[0]);
  }
  let drawn = await boxes();
  check('three boxes drawn', drawn.map(box => box.name),
    ['<A>', '<B>', '<C>']);

  await tap(await at('<A>'));
  drawn = await boxes();
  check('a plain press selects one', drawn.map(box => box.selected),
    [true, false, false]);

  await tap(await at('<B>'), SHIFT);
  drawn = await boxes();
  check('shift adds a second', drawn.map(box => box.selected),
    [true, true, false]);
  check('and the panel stands back',
    (await panel()).indexOf('2 boxes selected.') !== -1, true);

  await tap(await at('<B>'), SHIFT);
  drawn = await boxes();
  check('shift again takes it out', drawn.map(box => box.selected),
    [true, false, false]);
  await tap(await at('<B>'), SHIFT);

  // Resize the pair from the bottom: only the bottom-most box grows.
  drawn = await boxes();
  const before = drawn.map(box => box.height);
  const pair = drawn.filter(box => box.selected);
  const bottom = Math.max(...pair.map(box => box.top + box.height));
  await drag({x: pair[0].left + pair[0].width / 2, y: bottom - 1},
    {x: pair[0].left + pair[0].width / 2, y: bottom - 1 + 30});
  drawn = await boxes();
  check('resizing the group from the bottom grows only its lowest box',
    drawn.map(box => box.height - before[drawn.indexOf(box)]), [0, 30, 0]);

  // Resize from the right: both boxes are right-most, so both widen.
  drawn = await boxes();
  const widths = drawn.map(box => box.width);
  const chosen = drawn.filter(box => box.selected);
  const right = Math.max(...chosen.map(box => box.left + box.width));
  await drag({x: right - 1, y: chosen[0].top + chosen[0].height / 2},
    {x: right - 1 + 40, y: chosen[0].top + chosen[0].height / 2});
  drawn = await boxes();
  check('resizing from the right widens every box along that edge',
    drawn.map(box => box.width - widths[drawn.indexOf(box)]), [40, 40, 0]);

  // Move the pair below C.
  const spot = await at('<C>');
  const grabbed = await at('<A>');
  const held = drawn.filter(box => box.selected).map(
    box => ({name: box.name, left: box.left, top: box.top}));
  await drag(grabbed, {x: spot.x, y: spot.y + 20});
  drawn = await boxes();
  const carried = drawn.filter(box => box.selected).map(
    box => ({name: box.name, left: box.left, top: box.top}));
  check('moving the pair carries both of them',
    carried.map(box => box.name), held.map(box => box.name));
  const shifts = carried.map((box, index) =>
    `${box.left - held[index].left},${box.top - held[index].top}`);
  check('each of them by the same distance', shifts[0], shifts[1]);
  check('and they really did move', shifts[0] !== '0,0', true);
  check('and they stay selected', drawn.map(box => box.selected),
    [true, true, false]);

  // Delete them together.
  await key('Delete');
  drawn = await boxes();
  check('deleting removes the whole selection',
    drawn.map(box => box.name), ['<C>']);
  check('and the panel is empty again',
    (await panel()).indexOf('Select a box to edit it.') !== -1, true);

  console.log(failures === 0 ? '\nmultiple selection works' :
    `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(error => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
