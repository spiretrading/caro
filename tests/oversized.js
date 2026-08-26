// Checks that a box drawn past the edge of the canvas keeps the size it was
// drawn at and grows the section, while a box drawn to the edge still fills.
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
  const drag = async (from, to) => {
    await move(from.x, from.y, 'mousePressed');
    for(let i = 1; i <= 12; i++) {
      await move(from.x + (to.x - from.x) * i / 12,
        from.y + (to.y - from.y) * i / 12, 'mouseMoved');
      await pause(25);
    }
    await move(to.x, to.y, 'mouseReleased');
    await pause(450);
  };
  const canvas = () => evaluate(`(() => {
    const r = document.querySelector(
      '[data-canvas]').getBoundingClientRect();
    return {left: r.left, top: r.top, width: Math.round(r.width),
      height: Math.round(r.height)};
  })()`);
  const last = () => evaluate(`(() => {
    const drawn = Array.from(
      document.querySelectorAll('[data-keeps-selection]'))
      .filter(e => e.style.boxShadow.indexOf('inset') !== -1);
    const box = drawn[drawn.length - 1];
    const r = box.getBoundingClientRect();
    const fields = Array.from(
      document.querySelectorAll('input[type="number"]')).map(i => i.value);
    const chosen = Array.from(document.querySelectorAll('button'))
      .filter(b => b.style.fontWeight === '700').map(b => b.textContent.trim());
    return {width: Math.round(r.width), height: Math.round(r.height),
      model: fields, policy: chosen, flex: box.style.flex};
  })()`);
  const reset = async () => {
    await evaluate(`Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.trim() === 'New').click()`);
    await pause(400);
    return canvas();
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',
    {width: 1500, height: 950, deviceScaleFactor: 1, mobile: false});
  await send('Page.navigate', {url: 'http://localhost:8080/'});
  await pause(1800);

  let c = await reset();
  console.log(`  an empty canvas is ${c.width}x${c.height}`);

  await drag({x: c.left + 6, y: c.top + 20}, {x: c.left + 392, y: c.top + 70});
  let report = await last();
  check('a box drawn to the edge still fills', report.policy[0], 'Fill');
  console.log(`     drew ${report.model.join('x')}, ` +
    `rendered ${report.width}x${report.height}`);

  c = await reset();
  await drag({x: c.left + 20, y: c.top + 20}, {x: c.left + 720, y: c.top + 70});
  report = await last();
  check('a box drawn past the edge is not made to fill',
    report.policy[0], 'Fixed');
  check('it keeps the width it was drawn at', report.model[0], '700');
  check('and it is rendered at that width', report.width, 700);
  c = await canvas();
  check('the section grew to hold it', c.width >= 700, true);
  console.log(`     canvas is now ${c.width}x${c.height}`);

  c = await reset();
  await drag({x: c.left + 20, y: c.top + 20}, {x: c.left + 220, y: c.top + 70});
  c = await canvas();
  await drag({x: c.left + 20, y: c.top + 120},
    {x: c.left + 720, y: c.top + 170});
  report = await last();
  check('the same beside an existing box', report.width, 700);
  check('whose own size is untouched', report.model[0], '700');
  c = await canvas();
  console.log(`     canvas is now ${c.width}x${c.height}`);

  c = await reset();
  await drag({x: c.left + 20, y: c.top + 20}, {x: c.left + 120, y: c.top + 70});
  c = await canvas();
  await drag({x: c.left + 160, y: c.top + 20},
    {x: c.left + 260, y: c.top + 70});
  c = await canvas();
  await drag({x: c.left + 300, y: c.top + 10},
    {x: c.left + 380, y: c.top + 520});
  report = await last();
  check('a box drawn past the bottom keeps its height', report.model[1], '510');
  check('and is rendered at that height', report.height, 510);
  check('and is not made to fill', report.policy[1], 'Fixed');
  c = await canvas();
  check('the section grew down to hold it', c.height >= 510, true);
  console.log(`     canvas is now ${c.width}x${c.height}`);

  console.log(failures === 0 ? '\noversized draws keep their size' :
    `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(error => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
