// Checks that a scenario's layers are drawn one below another under the
// layout they are superimposed on, and are edited independently of it.
const path = require('path');

// The specifications, which live beside the repository, a layout.json next
// to each drawing. Suites needing them report themselves skipped when they
// are not there.
const SPECS = process.env.CARO_SPECS ||
  path.resolve(__dirname, '..', '..', 'specs');
const SPEC = path.join(SPECS, 'fees_detail_page/layout.json');
if(!require('fs').existsSync(SPEC)) {
  console.log(`skipped: no specification at ${SPEC}`);
  process.exit(0);
}

const http = require('http');
const fs = require('fs');

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
  const text = fs.readFileSync(SPEC, 'utf8');
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
  const tap = async point => {
    await move(point.x, point.y, 'mousePressed');
    await move(point.x, point.y, 'mouseReleased');
    await pause(300);
  };
  const key = async name => {
    const code = name === 'Delete' ? 46 : 27;
    for(const type of ['keyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', {type, key: name, code: name,
        windowsVirtualKeyCode: code, nativeVirtualKeyCode: code});
    }
    await pause(350);
  };
  const click = label => evaluate(
    `Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`);

  // Every canvas on the board, with the card it belongs to, whether it is a
  // layer, and what it holds.
  const SURVEY = `(() => {
    const first = document.querySelector('[data-canvas]');
    const cards = Array.from(first.parentElement.parentElement.children);
    return Array.from(document.querySelectorAll('[data-canvas]'))
      .map(canvas => {
        const rect = canvas.getBoundingClientRect();
        const card = cards.findIndex(c => c.contains(canvas));
        const holder = canvas.parentElement;
        const caption = (() => {
          if(holder === cards[card]) return null;
          const label = holder.querySelector('span');
          return label === null ? null : label.textContent.trim();
        })();
        let boxes = 0;
        const walk = element => {
          for(const child of element.children) {
            if(child.style.boxShadow.indexOf('inset') !== -1) boxes++;
            else if(child.children.length) walk(child);
          }
        };
        walk(canvas);
        return {card, top: Math.round(rect.top), caption, boxes};
      });
  })()`;
  const boxIn = index => evaluate(`(() => {
    const canvas = document.querySelectorAll(
      '[data-canvas]')[${index}];
    const found = [];
    const walk = element => {
      for(const child of element.children) {
        if(child.style.boxShadow.indexOf('inset') !== -1) found.push(child);
        else if(child.children.length) walk(child);
      }
    };
    walk(canvas);
    const r = found[0].getBoundingClientRect();
    return {x: r.left + r.width / 2, y: r.top + r.height / 2};
  })()`);
  const captions = () => evaluate(
    `Array.from(document.querySelectorAll('span'))
      .map(s => s.textContent.trim()).filter(t => /^Layer \\d+$/.test(t))`);
  const adders = () => evaluate(
    `Array.from(document.querySelectorAll('button'))
      .filter(b => b.textContent.trim() === 'Add a layer').length`);

  const stub = `(() => {
    const TEXT = ${JSON.stringify(text)};
    window.__written = '';
    const handle = {
      name: 'layout.json',
      getFile: async () => ({text: async () => TEXT}),
      createWritable: async () => ({
        write: async t => { window.__written = t; }, close: async () => {}
      })
    };
    window.showOpenFilePicker = async () => [handle];
    window.showSaveFilePicker = async () => handle;
    window.__section = name => {
      document.querySelector('[title="Choose a section"]').click();
      Array.from(document.querySelectorAll('button')).find(b =>
        b.parentElement.style.position === 'absolute' &&
        b.textContent.trim() === name).click();
    };
  })()`;

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',
    {width: 1500, height: 1400, deviceScaleFactor: 1, mobile: false});
  await send('Page.addScriptToEvaluateOnNewDocument', {source: stub});
  await send('Page.navigate', {url: 'http://localhost:8080/'});
  await pause(1800);

  let survey = await evaluate(SURVEY);
  check('a new specification has no layers', survey.length, 2);
  check('only a real scenario offers one', await adders(), 1);

  await click('Add a layer');
  await pause(400);
  survey = await evaluate(SURVEY);
  check('adding one puts a second canvas on the card', survey.length, 3);
  const base = survey.find(c => c.card === 0 && c.caption === null);
  const layer = survey.find(c => c.card === 0 && c.caption !== null);
  check('it is captioned', layer.caption, 'Layer 1');
  check('and it sits below the layout it covers', layer.top > base.top, true);

  const rectOf = index => evaluate(`(() => {
    const r = document.querySelectorAll(
      '[data-canvas]')[${index}].getBoundingClientRect();
    return {left: r.left, top: r.top};
  })()`);
  let where = await rectOf(0);
  await drag({x: where.left + 20, y: where.top + 20},
    {x: where.left + 200, y: where.top + 60});
  where = await rectOf(1);
  await drag({x: where.left + 20, y: where.top + 20},
    {x: where.left + 120, y: where.top + 50});
  survey = await evaluate(SURVEY);
  check('each canvas holds only what was drawn into it',
    survey.filter(c => c.card === 0).map(c => c.boxes), [1, 1]);

  await tap(await boxIn(1));
  check('a box in a layer can be selected',
    await evaluate(`document.body.textContent.indexOf(
      'Select a box to edit it.') === -1`), true);
  await key('Delete');
  survey = await evaluate(SURVEY);
  check('and deleting it leaves the layout alone',
    survey.filter(c => c.card === 0).map(c => c.boxes), [1, 0]);

  await click('Add a layer');
  await pause(400);
  check('layers stack in order', await captions(), ['Layer 1', 'Layer 2']);
  survey = await evaluate(SURVEY);
  const stack = survey.filter(c => c.card === 0).map(c => c.top);
  check('each one below the last',
    stack[0] < stack[1] && stack[1] < stack[2], true);

  await evaluate(`Array.from(document.querySelectorAll('[title="Delete layer"]'))
    [0].click()`);
  await pause(400);
  check('removing one renumbers the rest', await captions(), ['Layer 1']);

  await click('Save');
  await pause(900);
  const saved = JSON.parse(await evaluate(`window.__written`));
  const layouts = saved.components[0].layouts;
  check('the layer reached the file', layouts[0].overlays.length, 1);
  check('and the layout kept its own box',
    layouts[0].boxes.length, 1);

  console.log('');
  console.log('  ' + SPEC);
  await click('Open');
  await pause(900);
  await evaluate(`window.__section('Main')`);
  await pause(700);
  survey = await evaluate(SURVEY);
  const covered = survey.filter(c => c.card === 0);
  check('the converted layer is drawn under its layout', covered.length, 2);
  check('captioned as the first layer', covered[1].caption, 'Layer 1');
  check('holding the spacer and the sheet pinned to it', covered[1].boxes, 2);
  console.log(`     layout has ${covered[0].boxes} boxes, ` +
    `its layer ${covered[1].boxes}`);

  console.log(failures === 0 ? '\nlayers work' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(error => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
