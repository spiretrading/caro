const http = require('http');
const PORT = 9222;
function get(path) {
  return new Promise((resolve, reject) => {
    http.get({host: '127.0.0.1', port: PORT, path}, response => {
      let body = '';
      response.on('data', chunk => body += chunk);
      response.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}
let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if(!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if(!ok) { console.log(`        got  ${actual}`);
    console.log(`        want ${expected}`); }
}
async function main() {
  const targets = await get('/json/list');
  const page = targets.find(t => t.type === 'page');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => socket.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if(pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  });
  const send = (method, params) => new Promise(res => {
    id++; pending.set(id, res);
    socket.send(JSON.stringify({id, method, params: params || {}}));
  });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', {expression, returnByValue: true});
    if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const mouse = async (type, x, y, buttons) => {
    await send('Input.dispatchMouseEvent', {type, x: Math.round(x),
      y: Math.round(y), button: 'left', clickCount: 1, buttons: buttons || 0});
    await new Promise(r => setTimeout(r, 14));
  };
  const FIELDS = `Array.from(document.querySelectorAll(
    'input[type="number"]')).map(i => i.value).join(',')`;
  const RECTS = `(() => {
    const out = [];
    const walk = e => { for(const c of e.children) {
      if(c.style.boxShadow.indexOf('inset') !== -1) {
        const s = c.querySelector('span');
        const r = c.getBoundingClientRect();
        out.push({name: s ? s.textContent : '',
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
          top: Math.round(r.top), bottom: Math.round(r.bottom),
          w: Math.round(r.width), h: Math.round(r.height)});
      } else if(c.children.length) walk(c); } };
    walk(document.querySelector('[data-canvas]'));
    return out;
  })()`;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', {url: 'http://localhost:8080/'});
  await new Promise(r => setTimeout(r, 1600));
  const b = await evaluate(`(() => {
    const r = document.querySelector(
      '[data-canvas]').getBoundingClientRect();
    return {left: Math.round(r.left), top: Math.round(r.top)};
  })()`);
  await mouse('mousePressed', b.left + 40, b.top + 40);
  await mouse('mouseMoved', b.left + 150, b.top + 90, 1);
  await mouse('mouseMoved', b.left + 300, b.top + 140, 1);
  await mouse('mouseReleased', b.left + 300, b.top + 140);
  await evaluate(`(() => {
    const i = document.querySelector('input[placeholder="Element:Name"]');
    const s = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value').set;
    s.call(i, 'A');
    i.dispatchEvent(new Event('input', {bubbles: true}));
  })()`);
  let rects = await evaluate(RECTS);
  console.log(`   drawn ${rects[0].w}x${rects[0].h}, ` +
    `fields=[${await evaluate(FIELDS)}]`);

  // Drag the bottom edge far above the top edge.
  const box = rects[0];
  await mouse('mousePressed', box.x, box.bottom - 2);
  for(let i = 1; i <= 12; ++i) {
    await mouse('mouseMoved', box.x, box.bottom - 2 - i * 20, 1);
  }
  await mouse('mouseReleased', box.x, box.bottom - 242);
  await new Promise(r => setTimeout(r, 160));
  const collapsed = await evaluate(FIELDS);
  rects = await evaluate(RECTS);
  console.log(`   after collapsing: fields=[${collapsed}], ` +
    `rendered ${rects[0].w}x${rects[0].h}`);
  check('the height floors at one', collapsed.split(',')[1], '1');
  check('the box is still on the canvas', rects.length, 1);
  check('and is drawn at its literal size', rects[0].h, 1);

  // The properties panel can put it back.
  await evaluate(`(() => {
    const inputs = Array.from(
      document.querySelectorAll('input[type="number"]'));
    const s = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value').set;
    s.call(inputs[1], '120');
    inputs[1].dispatchEvent(new Event('input', {bubbles: true}));
  })()`);
  await new Promise(r => setTimeout(r, 160));
  rects = await evaluate(RECTS);
  console.log(`   restored to ${rects[0].w}x${rects[0].h}`);
  check('typing a height brings it back', rects[0].h, 120);

  console.log(failures === 0 ? '\nzero sizing works' :
    `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
