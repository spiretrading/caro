// Checks that pressing anywhere clears the selection, except on a box or
// inside the properties panel, and that Escape clears it at rest.
const path = require('path');

// A converted specification kept with the tests, since the folder the
// drawings are staged in is emptied once they have been converted.
const SPEC = path.resolve(__dirname, 'fees_detail_page.json');

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
  const targets = await get('/json/list');
  const page = targets.find(t => t.type === 'page');
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
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
    }
    return r.result.value;
  };
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const press = async point => {
    for(const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', {type, x: Math.round(point.x),
        y: Math.round(point.y), button: 'left', clickCount: 1});
    }
    await pause(250);
  };
  const escape = async () => {
    for(const type of ['keyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', {type, key: 'Escape',
        code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27});
    }
    await pause(250);
  };

  const stub = `(() => {
    const TEXT = ${JSON.stringify(text)};
    const handle = {
      name: 'layout.json',
      getFile: async () => ({text: async () => TEXT}),
      createWritable: async () => ({
        write: async () => {}, close: async () => {}
      })
    };
    window.showOpenFilePicker = async () => [handle];
    window.__click = label => Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.trim() === label).click();
    window.__section = name => {
      document.querySelector('[title="Choose a section"]').click();
      Array.from(document.querySelectorAll('button')).find(b =>
        b.parentElement.style.position === 'absolute' &&
        b.textContent.trim() === name).click();
    };
    window.__centre = element => {
      const r = element.getBoundingClientRect();
      return {x: r.left + r.width / 2, y: r.top + r.height / 2};
    };
    window.__box = label => window.__centre(
      Array.from(document.querySelectorAll('span'))
        .find(s => s.textContent.trim() === label).parentElement);
    window.__probe = () => {
      const name = document.querySelector('input[placeholder="Element:Name"]');
      return {
        selected: document.body.textContent.indexOf(
          'Select a box to edit it.') === -1,
        name: name === null ? null : name.value,
        boxes: document.querySelectorAll('[data-keeps-selection]').length
      };
    };
  })()`;

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',
    {width: 1500, height: 950, deviceScaleFactor: 1, mobile: false});
  await send('Page.addScriptToEvaluateOnNewDocument', {source: stub});
  await send('Page.navigate', {url: 'http://localhost:8080/'});
  await pause(1800);
  await evaluate(`window.__click('Open')`);
  await pause(900);
  await evaluate(`window.__section('Header')`);
  await pause(700);

  const apply = await evaluate(`window.__box('<Metadata>')`);
  const select = async () => {
    await press(apply);
    const probe = await evaluate(`window.__probe()`);
    if(!probe.selected) {
      throw new Error('could not select the box to begin with');
    }
    return probe;
  };

  const first = await select();
  check('pressing a box selects it', first.selected, true);
  console.log(`     selected "${first.name}", ` +
    `${first.boxes} elements keep the selection`);

  const grey = await evaluate(`(() => {
    const surface = document.querySelector('[style*="crosshair"]')
      .closest('[style*="rgb(245, 245, 245)"]');
    const r = surface.getBoundingClientRect();
    return {x: r.left + r.width / 2, y: r.bottom - 40};
  })()`);
  await press(grey);
  check('pressing the grey surface clears it',
    (await evaluate(`window.__probe()`)).selected, false);

  await select();
  const toolbar = await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.trim() === 'Save');
    const r = button.getBoundingClientRect();
    return {x: r.right + 480, y: r.top + r.height / 2};
  })()`);
  await press(toolbar);
  check('pressing the toolbar clears it',
    (await evaluate(`window.__probe()`)).selected, false);

  await select();
  const heading = await evaluate(`window.__centre(
    Array.from(document.querySelectorAll('div'))
      .find(d => d.textContent.trim() === 'Box'))`);
  await press(heading);
  check('pressing the properties panel keeps it',
    (await evaluate(`window.__probe()`)).selected, true);

  await select();
  const width = await evaluate(`window.__centre(
    document.querySelectorAll('input[type="number"]')[0])`);
  await press(width);
  check('pressing a panel field keeps it',
    (await evaluate(`window.__probe()`)).selected, true);

  const area = await evaluate(
    `window.__centre(document.querySelectorAll('textarea')[0])`);
  await press(area);
  check('pressing a scenario\'s properties clears it',
    (await evaluate(`window.__probe()`)).selected, false);

  await select();
  const empty = await evaluate(`(() => {
    const canvas = document.querySelector('[style*="crosshair"]');
    const r = canvas.getBoundingClientRect();
    return {x: r.left + r.width / 2, y: r.bottom - 30};
  })()`);
  await press(empty);
  check('pressing empty canvas still clears it',
    (await evaluate(`window.__probe()`)).selected, false);

  await select();
  await escape();
  check('Escape at rest clears it',
    (await evaluate(`window.__probe()`)).selected, false);

  await select();
  const download = await evaluate(`window.__box('<Context>')`);
  await press(download);
  const swapped = await evaluate(`window.__probe()`);
  check('pressing another box selects that one instead',
    swapped.selected, true);
  check('and it is a different box', swapped.name !== first.name, true);

  await select();
  const remove = await evaluate(`window.__centre(
    Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.trim() === 'Delete'))`);
  await press(remove);
  const deleted = await evaluate(`window.__probe()`);
  check('the panel Delete button still removes the box',
    deleted.boxes, first.boxes - 1);
  check('and nothing is left selected', deleted.selected, false);

  await press(area);
  await press(await evaluate(`window.__box('<Context>')`));
  const before = await evaluate(`window.__probe()`);
  check('a box picked after typing is selected', before.selected, true);
  for(const type of ['keyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', {type, key: 'Delete',
      code: 'Delete', windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46});
  }
  await pause(300);
  check('the Delete key still reaches a box picked after typing',
    (await evaluate(`window.__probe()`)).boxes, before.boxes - 1);

  console.log(failures === 0 ? '\ndeselection works' :
    `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(error => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
