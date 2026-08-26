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
  const SECTIONS = `Array.from(document.querySelectorAll('select'))[0]
    ? Array.from(document.querySelectorAll('select'))
        .filter(s => s.options.length &&
          !s.options[0].value.includes('/'))[0] : null`;
  const listing = `(() => {
    document.querySelector('[title="Choose a section"]').click();
    const items = Array.from(document.querySelectorAll('button'))
      .filter(b => b.parentElement.style.position === 'absolute');
    const names = items.map(b => b.textContent.trim());
    const at = items.findIndex(b => b.style.fontWeight === '700');
    document.querySelector('[title="Choose a section"]').click();
    return names.join(' | ') + '  [' + at + ']';
  })()`;
  const press = async title => {
    await evaluate(`document.querySelector('[title="${title}"]').click()`);
    await new Promise(r => setTimeout(r, 180));
  };
  const rename = async text => {
    await evaluate(`(() => {
      const i = document.querySelector('input[placeholder="Section:Name"]');
      const s = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value').set;
      s.call(i, ${JSON.stringify(text)});
      i.dispatchEvent(new Event('input', {bubbles: true}));
    })()`);
    await new Promise(r => setTimeout(r, 180));
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', {url: 'http://localhost:8080/'});
  await new Promise(r => setTimeout(r, 1600));

  check('one section to begin with', await evaluate(listing), 'Main  [0]');
  await press('Add a section');
  check('adding gives a fresh name and selects it',
    await evaluate(listing), 'Main | Section1  [1]');
  check('the new section starts with a default and a blank',
    await evaluate(
      `document.querySelectorAll('[data-canvas]').length`), 2);

  await rename('Section:RiskControls');
  check('renaming updates the picker',
    await evaluate(listing), 'Main | Section:RiskControls  [1]');

  await press('Add a section');
  await rename('Div:Controls');
  check('a third lands after the selected one',
    await evaluate(listing),
    'Main | Section:RiskControls | Div:Controls  [2]');
  check('there are no reorder controls', await evaluate(
    `document.querySelectorAll('[title^="Move section"]').length`), 0);
  check('there is no separate section dropdown', await evaluate(
    `document.querySelectorAll('select').length`), 0);
  check('the list is closed until asked for', await evaluate(
    `Array.from(document.querySelectorAll('div'))
      .filter(d => d.style.position === 'absolute' &&
        d.style.zIndex === '20').length`), 0);

  // Drawing into one section must not touch another.
  const b = await evaluate(`(() => {
    const r = document.querySelector(
      '[data-canvas]').getBoundingClientRect();
    return {left: Math.round(r.left), top: Math.round(r.top)};
  })()`);
  await mouse('mousePressed', b.left + 30, b.top + 30);
  await mouse('mouseMoved', b.left + 120, b.top + 70, 1);
  await mouse('mouseMoved', b.left + 210, b.top + 110, 1);
  await mouse('mouseReleased', b.left + 210, b.top + 110);
  await new Promise(r => setTimeout(r, 160));
  const boxes = `(() => {
    let n = 0;
    document.querySelectorAll('[data-canvas]').forEach(c => {
      const walk = e => { for(const x of e.children) {
        if(x.style.boxShadow.indexOf('inset') !== -1) n++;
        else if(x.children.length) walk(x); } };
      walk(c);
    });
    return n;
  })()`;
  check('the box landed in this section', await evaluate(boxes), 1);
  await evaluate(`(() => {
    document.querySelector('[title="Choose a section"]').click();
    const items = Array.from(document.querySelectorAll('button'))
      .filter(b => b.parentElement.style.position === 'absolute');
    items[0].click();
  })()`);
  await new Promise(r => setTimeout(r, 180));
  check('the first section is untouched', await evaluate(boxes), 0);
  check('and it is selected', await evaluate(listing),
    'Main | Section:RiskControls | Div:Controls  [0]');

  // A box referring to a deleted section is left dangling on purpose; the
  // validation pass reports it later.
  await evaluate(`(() => {
    document.querySelector('[title="Choose a section"]').click();
    const items = Array.from(document.querySelectorAll('button'))
      .filter(b => b.parentElement.style.position === 'absolute');
    items[2].click();
  })()`);
  await new Promise(r => setTimeout(r, 180));
  await press('Delete section');
  check('deleting removed the section',
    await evaluate(listing), 'Main | Section:RiskControls  [1]');
  check('and selected its neighbour', await evaluate(
    `document.querySelector('input[placeholder="Section:Name"]').value`),
    'Section:RiskControls');
  await press('Delete section');
  check('deleting again leaves one', await evaluate(listing), 'Main  [0]');
  check('the last section cannot be deleted', await evaluate(
    `document.querySelector('[title="Delete section"]').disabled`), true);

  console.log(failures === 0 ? '\nsections work' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
