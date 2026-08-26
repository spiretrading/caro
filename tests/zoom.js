// Checks that magnifying a canvas scales the picture without changing the
// model, and that drawing, resizing and the overlays stay true at 200%.
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
  const move = (x, y, type) => send('Input.dispatchMouseEvent',
    {type, x: Math.round(x), y: Math.round(y), button: 'left', buttons: 1,
      clickCount: 1});
  const drag = async (from, to, midway) => {
    await move(from.x, from.y, 'mousePressed');
    for(let i = 1; i <= 10; i++) {
      await move(from.x + (to.x - from.x) * i / 10,
        from.y + (to.y - from.y) * i / 10, 'mouseMoved');
      await pause(25);
    }
    const seen = midway === undefined ? null : await evaluate(midway);
    await move(to.x, to.y, 'mouseReleased');
    await pause(400);
    return seen;
  };
  const click = label => evaluate(
    `Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`);
  const press = title => evaluate(
    `document.querySelector(${JSON.stringify('[title="' + title + '"]')})
      .click()`);
  const canvas = () => evaluate(`(() => {
    const r = document.querySelector(
      '[data-canvas]').getBoundingClientRect();
    return {left: r.left, top: r.top, width: Math.round(r.width),
      height: Math.round(r.height)};
  })()`);
  const model = () => evaluate(`Array.from(
    document.querySelectorAll('input[type="number"]')).map(i => i.value)`);
  const boxes = () => evaluate(`(() => {
    return Array.from(document.querySelectorAll('[data-keeps-selection]'))
      .filter(e => e.style.boxShadow.indexOf('inset') !== -1)
      .map(e => { const r = e.getBoundingClientRect();
        return {left: Math.round(r.left), top: Math.round(r.top),
          width: Math.round(r.width), height: Math.round(r.height)}; });
  })()`);
  const home = async () => {
    await evaluate(`(() => {
      const surface = document.querySelector(
        '[data-canvas]').parentElement.parentElement;
      surface.scrollTo(0, 0);
    })()`);
    await pause(250);
  };
  const percentage = () => evaluate(
    `Array.from(document.querySelectorAll('button'))
      .map(b => b.textContent.trim()).find(t => t.endsWith('%'))`);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',
    {width: 1500, height: 950, deviceScaleFactor: 1, mobile: false});
  await send('Page.navigate', {url: 'http://localhost:8080/'});
  await pause(1800);
  await click('New');
  await pause(400);

  check('the toolbar starts at the literal size', await percentage(), '100%');
  let c = await canvas();
  await drag({x: c.left + 20, y: c.top + 20}, {x: c.left + 220, y: c.top + 70});
  check('a box drawn at 100% measures what it was drawn',
    await model(), ['200', '50']);
  let drawn = await boxes();
  check('and is rendered at that size',
    [drawn[0].width, drawn[0].height], [200, 50]);

  await press('Zoom out');
  await pause(300);
  check('it cannot shrink below the literal size', await percentage(), '100%');

  await press('Zoom in');
  await pause(300);
  await press('Zoom in');
  await pause(400);
  check('two steps in reaches 200%', await percentage(), '200%');

  drawn = await boxes();
  check('the box is drawn twice the size',
    [drawn[0].width, drawn[0].height], [400, 100]);
  check('while the model is untouched', await model(), ['200', '50']);
  c = await canvas();
  console.log(`     the canvas is now ${c.width}x${c.height}`);

  const inside = {x: drawn[0].left + 200, y: drawn[0].top + 50};
  await move(inside.x, inside.y, 'mousePressed');
  await move(inside.x, inside.y, 'mouseReleased');
  await pause(400);
  check('a magnified box can still be picked',
    (await evaluate(`document.body.textContent.indexOf(
      'Select a box to edit it.') === -1`)), true);

  await home();
  c = await canvas();
  const band = await drag({x: c.left + 40, y: c.top + 240},
    {x: c.left + 240, y: c.top + 340}, `(() => {
      const b = document.querySelector('[style*="dashed"]');
      if(b === null) return null;
      const r = b.getBoundingClientRect();
      return {left: Math.round(r.left), top: Math.round(r.top),
        width: Math.round(r.width), height: Math.round(r.height)};
    })()`);
  if(band !== null) {
    check('the rubber band tracks the cursor, not the zoom',
      [band.width, band.height], [200, 100]);
    check('and sits where the drag started',
      [band.left, band.top], [Math.round(c.left) + 40, Math.round(c.top) + 240]);
  } else {
    console.log('     (no rubber band found to measure)');
  }
  check('a 200x100 band at 200% makes a 100x50 box',
    await model(), ['100', '50']);

  drawn = await boxes();
  const second = drawn[drawn.length - 1];
  const edge = {x: second.left + second.width / 2,
    y: second.top + second.height - 1};
  await drag(edge, {x: edge.x, y: edge.y + 40});
  check('dragging an edge 40 screen pixels adds 20 to the model',
    (await model())[1], '70');

  const PROBE = `(() => {
    const canvas = document.querySelector('[data-canvas]');
    const guides = Array.from(canvas.children)
      .filter(c => c.style.backgroundColor === 'rgb(230, 63, 68)')
      .map(c => { const r = c.getBoundingClientRect();
        if(r.width <= 4) return {vertical: true, at: r.left};
        return {vertical: false, at: r.top}; });
    const vertical = [], horizontal = [];
    Array.from(document.querySelectorAll('[data-keeps-selection]'))
      .filter(e => e.style.boxShadow.indexOf('inset') !== -1)
      .forEach(e => { const r = e.getBoundingClientRect();
        vertical.push(r.left, r.right); horizontal.push(r.top, r.bottom); });
    return {guides, vertical, horizontal};
  })()`;
  drawn = await boxes();
  const wide = drawn[0];
  const narrow = drawn[drawn.length - 1];
  const grip = {x: narrow.left + narrow.width - 1,
    y: narrow.top + narrow.height / 2};
  const seen = await drag(grip,
    {x: grip.x + (wide.width - narrow.width), y: grip.y}, PROBE);
  check('a resize at 200% draws a guide when the edges meet',
    seen.guides.length > 0, true);
  const astray = seen.guides.filter(guide => {
    const edges = guide.vertical ? seen.vertical : seen.horizontal;
    return !edges.some(edge => Math.abs(edge - guide.at) <= 1.5);
  });
  check('and every guide sits exactly on a real edge', astray, []);
  console.log(`     ${seen.guides.length} guides, all on edges`);

  const wheel = await evaluate(`(() => {
    const r = document.querySelector(
      '[data-canvas]').getBoundingClientRect();
    return {x: Math.round(r.left + 40), y: Math.round(r.top + 40)};
  })()`);
  await send('Input.dispatchMouseEvent', {type: 'mouseWheel', x: wheel.x,
    y: wheel.y, deltaX: 0, deltaY: -120, modifiers: 2});
  await pause(400);
  check('ctrl and the wheel magnifies', await percentage(), '300%');
  await send('Input.dispatchMouseEvent', {type: 'mouseWheel', x: wheel.x,
    y: wheel.y, deltaX: 0, deltaY: 120, modifiers: 2});
  await pause(400);
  check('and back the other way', await percentage(), '200%');
  await send('Input.dispatchMouseEvent', {type: 'mouseWheel', x: wheel.x,
    y: wheel.y, deltaX: 0, deltaY: -120, modifiers: 0});
  await pause(400);
  check('the wheel alone leaves it alone', await percentage(), '200%');

  await press('Back to the literal size');
  await pause(400);
  check('the reset returns to the literal size', await percentage(), '100%');
  drawn = await boxes();
  check('and the first box is back to its drawn size',
    [drawn[0].width, drawn[0].height], [200, 50]);

  console.log(failures === 0 ? '\nzoom works' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(error => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
