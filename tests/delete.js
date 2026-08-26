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
  if(!ok) {
    console.log(`        got  ${actual}`);
    console.log(`        want ${expected}`);
  }
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
    if(r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };
  const mouse = async (type, x, y, buttons) => {
    await send('Input.dispatchMouseEvent', {type, x: Math.round(x),
      y: Math.round(y), button: 'left', clickCount: 1, buttons: buttons || 0});
    await new Promise(r => setTimeout(r, 14));
  };
  const key = async k => {
    await send('Input.dispatchKeyEvent',
      {type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: 46});
    await send('Input.dispatchKeyEvent', {type: 'keyUp', key: k, code: k});
    await new Promise(r => setTimeout(r, 150));
  };
  const NAMES = `(() => {
    const out = [];
    const walk = e => { for(const c of e.children) {
      if(c.style.boxShadow.indexOf('inset') !== -1) {
        const s = c.querySelector('span');
        out.push(s ? s.textContent : '?');
      } else if(c.children.length) walk(c); } };
    walk(document.querySelector('[data-canvas]'));
    return out.join(' ');
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
  const draw = async (y1, y2, name) => {
    await mouse('mousePressed', b.left + 40, b.top + y1);
    await mouse('mouseMoved', b.left + 200, b.top + (y1 + y2) / 2, 1);
    await mouse('mouseMoved', b.left + 360, b.top + y2, 1);
    await mouse('mouseReleased', b.left + 360, b.top + y2);
    await evaluate(`(() => {
      const i = document.querySelector('input[placeholder="Element:Name"]');
      const s = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value').set;
      s.call(i, ${JSON.stringify(name)});
      i.dispatchEvent(new Event('input', {bubbles: true}));
    })()`);
  };
  await draw(30, 110, 'A');
  await draw(130, 210, 'B');
  await draw(230, 310, 'C');
  check('three boxes drawn', await evaluate(NAMES), '<A> <B> <C>');

  // Select B by clicking its middle, then press Delete.
  const rect = await evaluate(`(() => {
    const out = [];
    const walk = e => { for(const c of e.children) {
      if(c.style.boxShadow.indexOf('inset') !== -1) {
        const s = c.querySelector('span');
        const r = c.getBoundingClientRect();
        out.push({name: s ? s.textContent : '', x: r.left + r.width / 2,
          y: r.top + r.height / 2, right: r.right, top: r.top});
      } else if(c.children.length) walk(c); } };
    walk(document.querySelector('[data-canvas]'));
    return out;
  })()`);
  const target = rect.find(r => r.name === '<B>');
  await mouse('mousePressed', target.x, target.y);
  await mouse('mouseReleased', target.x, target.y);
  await new Promise(r => setTimeout(r, 120));
  const hasButton = await evaluate(
    `document.querySelectorAll('[title="Delete"]').length`);
  check('the selected box shows a delete control', hasButton, 1);

  await key('Delete');
  check('Delete removes the selected box', await evaluate(NAMES), '<A> <C>');

  // Now use the on-canvas control.
  const again = await evaluate(`(() => {
    const out = [];
    const walk = e => { for(const c of e.children) {
      if(c.style.boxShadow.indexOf('inset') !== -1) {
        const s = c.querySelector('span');
        const r = c.getBoundingClientRect();
        out.push({name: s ? s.textContent : '', x: r.left + r.width / 2,
          y: r.top + r.height / 2});
      } else if(c.children.length) walk(c); } };
    walk(document.querySelector('[data-canvas]'));
    return out;
  })()`);
  const other = again.find(r => r.name === '<C>');
  await mouse('mousePressed', other.x, other.y);
  await mouse('mouseReleased', other.x, other.y);
  await new Promise(r => setTimeout(r, 120));
  const spot = await evaluate(`(() => {
    const btn = document.querySelector('[title="Delete"]');
    if(!btn) return null;
    const r = btn.getBoundingClientRect();
    return {x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2)};
  })()`);
  check('the control is on the canvas', spot !== null, true);
  console.log('   control at', JSON.stringify(spot));
  console.log('   element there:', await evaluate(
    `(() => { const e = document.elementFromPoint(${spot.x}, ${spot.y});
      return e.tagName + ' title=' + (e.getAttribute('title') || '-'); })()`));
  await mouse('mousePressed', spot.x, spot.y);
  await mouse('mouseReleased', spot.x, spot.y);
  await new Promise(r => setTimeout(r, 150));
  check('the control removes the box', await evaluate(NAMES), '<A>');

  // Backspace while typing a name must not delete anything.
  const last = await evaluate(`(() => {
    const c = document.querySelector('[data-canvas]').children[0];
    const r = c.getBoundingClientRect();
    return {x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2)};
  })()`);
  await mouse('mousePressed', last.x, last.y);
  await mouse('mouseReleased', last.x, last.y);
  await new Promise(r => setTimeout(r, 120));
  await evaluate(
    `document.querySelector('input[placeholder="Element:Name"]').focus()`);
  await send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Backspace',
    code: 'Backspace', windowsVirtualKeyCode: 8});
  await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Backspace',
    code: 'Backspace'});
  await new Promise(r => setTimeout(r, 150));
  check('Backspace in the name field leaves the box alone',
    (await evaluate(NAMES)).length > 0, true);

  console.log(failures === 0 ? '\ndeleting works' : `\n${failures} FAILURES`);
  process.exit(0);
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
