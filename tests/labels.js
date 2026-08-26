// Checks that a box's name stays the same size on screen however far the
// canvas is magnified, so magnifying reveals a name a small box cuts off.
const http = require('http');

const PORT = 9222;
const NAME = 'VeryLongElementName';

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
    for(let i = 1; i <= 8; i++) {
      await move(from.x + (to.x - from.x) * i / 8,
        from.y + (to.y - from.y) * i / 8, 'mouseMoved');
      await pause(25);
    }
    await move(to.x, to.y, 'mouseReleased');
    await pause(400);
  };
  const press = title => evaluate(
    `document.querySelector(${JSON.stringify('[title="' + title + '"]')})
      .click()`);
  const percentage = () => evaluate(
    `Array.from(document.querySelectorAll('button'))
      .map(b => b.textContent.trim()).find(t => t.endsWith('%'))`);
  const probe = () => evaluate(`(() => {
    const canvas = document.querySelector('[style*="crosshair"]');
    const zoom = Number(canvas.style.zoom);
    const box = Array.from(document.querySelectorAll('[data-keeps-selection]'))
      .filter(e => e.style.boxShadow.indexOf('inset') !== -1)[0];
    const span = box.querySelector('span');
    const boxRect = box.getBoundingClientRect();
    const spanRect = span.getBoundingClientRect();
    return {
      zoom,
      text: span.textContent,
      lineHeight: Math.round(spanRect.height),
      textWidth: Math.round(span.scrollWidth * zoom),
      boxWidth: Math.round(boxRect.width),
      clipped: span.scrollWidth > span.clientWidth + 1
    };
  })()`);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',
    {width: 1500, height: 950, deviceScaleFactor: 1, mobile: false});
  await send('Page.navigate', {url: 'http://localhost:8080/'});
  await pause(1800);
  await evaluate(`Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.trim() === 'New').click()`);
  await pause(400);

  const c = await evaluate(`(() => {
    const r = document.querySelector(
      '[style*="crosshair"]').getBoundingClientRect();
    return {left: r.left, top: r.top};
  })()`);
  await drag({x: c.left + 20, y: c.top + 20}, {x: c.left + 90, y: c.top + 50});
  await evaluate(`(() => {
    const field = document.querySelector('input[placeholder="Element:Name"]');
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value').set;
    setter.call(field, ${JSON.stringify(NAME)});
    field.dispatchEvent(new Event('input', {bubbles: true}));
  })()`);
  await pause(400);

  const small = await probe();
  console.log(`  at ${Math.round(small.zoom * 100)}%: box ` +
    `${small.boxWidth}px wide, "${small.text}" needs ${small.textWidth}px`);
  check('the name is cut off in a small box', small.clipped, true);

  for(let i = 0; i < 4; i++) {
    await press('Zoom in');
    await pause(300);
  }
  check('four steps in reaches 400%', await percentage(), '400%');

  const large = await probe();
  console.log(`  at ${Math.round(large.zoom * 100)}%: box ` +
    `${large.boxWidth}px wide, "${large.text}" needs ${large.textWidth}px`);
  check('the box is drawn four times the size',
    large.boxWidth, small.boxWidth * 4);
  check('but the name is drawn the same size on screen',
    large.textWidth, small.textWidth);
  check('and sits on a line of the same height',
    large.lineHeight, small.lineHeight);
  check('so magnifying reveals the whole name', large.clipped, false);

  await press('Back to the literal size');
  await pause(400);
  const back = await probe();
  check('and it is cut off again at the literal size', back.clipped, true);
  check('with the name still the same size on screen',
    back.textWidth, small.textWidth);

  console.log(failures === 0 ? '\nnames keep their size' :
    `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(error => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
