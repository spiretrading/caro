// Checks that every scenario but the trailing blank shows its properties,
// that the text matches the file, and that edits survive a save.
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
const EDIT = 'display: flex\nContent:\n  overflow-y: auto';

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

function rowsFor(properties) {
  return Math.min(Math.max(properties.split('\n').length, 2), 12);
}

async function main() {
  const text = fs.readFileSync(SPEC, 'utf8');
  const board = JSON.parse(text);
  const sectionOf = name => board.components.find(c => c.name === name);

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

  const stub = `(() => {
    const TEXT = ${JSON.stringify(text)};
    window.__written = '';
    const handle = {
      name: 'layout.json',
      getFile: async () => ({text: async () => TEXT}),
      createWritable: async () => ({
        write: async t => { window.__written = t; },
        close: async () => {}
      })
    };
    window.showOpenFilePicker = async () => [handle];
    window.showSaveFilePicker = async () => handle;
    window.__type = (area, value) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(area, value);
      area.dispatchEvent(new Event('input', {bubbles: true}));
    };
    window.__click = label => Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.trim() === label).click();
    window.__section = name => {
      document.querySelector('[title="Choose a section"]').click();
      const item = Array.from(document.querySelectorAll('button')).find(b =>
        b.parentElement.style.position === 'absolute' &&
        b.textContent.trim() === name);
      item.click();
    };
  })()`;

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {source: stub});
  await send('Page.navigate', {url: 'http://localhost:8080/'});
  await new Promise(r => setTimeout(r, 1800));

  const survey = `(() => {
    const cards = Array.from(document.querySelectorAll('[style*="crosshair"]'))
      .map(canvas => canvas.parentElement);
    return {
      scenarios: cards.length,
      areas: cards.map(card => {
        const area = card.querySelector('textarea');
        if(area === null) return null;
        return {value: area.value, rows: area.rows,
          label: card.textContent.indexOf('Properties') !== -1,
          below: card.textContent.indexOf('Properties') >
            card.textContent.indexOf('Drag to draw')};
      })
    };
  })()`;

  console.log('  a brand new specification');
  let report = await evaluate(survey);
  check('two scenarios, the default and a blank', report.scenarios, 2);
  check('only the default carries a properties field',
    report.areas.map(a => a === null), [false, true]);
  check('it starts empty', report.areas[0].value, '');
  check('it is labelled', report.areas[0].label, true);
  check('it sits below the canvas', report.areas[0].below, true);
  check('it starts two rows tall', report.areas[0].rows, 2);

  console.log('');
  console.log('  ' + SPEC);
  await evaluate(`window.__click('Open')`);
  await new Promise(r => setTimeout(r, 900));

  const visit = async name => {
    await evaluate(`window.__section(${JSON.stringify(name)})`);
    await new Promise(r => setTimeout(r, 500));
    const report = await evaluate(survey);
    const layouts = sectionOf(name).layouts;
    console.log('');
    console.log(`  section ${name}, ${layouts.length} scenarios in the file`);
    check(`${name}: a scenario per layout, plus a blank`,
      report.scenarios, layouts.length + 1);
    check(`${name}: the blank scenario has no properties field`,
      report.areas[report.areas.length - 1], null);
    check(`${name}: every other scenario shows its properties`,
      report.areas.slice(0, -1).map(a => a.value),
      layouts.map(l => l.properties));
    check(`${name}: each block is drawn at its own height`,
      report.areas.slice(0, -1).map(a => a.rows),
      layouts.map(l => rowsFor(l.properties)));
    return report;
  };

  await visit('FeesDetailPage');
  await visit('SaveBar');
  await visit('Metadata');

  console.log('');
  console.log('  editing Metadata');
  await evaluate(`window.__type(
    document.querySelectorAll('textarea')[0], ${JSON.stringify(EDIT)})`);
  await new Promise(r => setTimeout(r, 300));
  report = await evaluate(survey);
  check('the edit is kept', report.areas[0].value, EDIT);
  check('the field grows to fit it', report.areas[0].rows, 3);
  check('the scenario count is undisturbed', report.scenarios,
    sectionOf('Metadata').layouts.length + 1);
  check('the other scenarios are untouched',
    report.areas.slice(1, -1).map(a => a.value),
    sectionOf('Metadata').layouts.slice(1).map(l => l.properties));

  await evaluate(`window.__click('Save')`);
  await new Promise(r => setTimeout(r, 900));
  const written = await evaluate(`window.__written`);
  check('the save wrote something', written.length > 0, true);
  const saved = JSON.parse(written);
  check('every section survived the save',
    saved.components.length, board.components.length);
  const section = saved.components.find(c => c.name === 'Metadata');
  check('the edit reached the file', section.layouts[0].properties, EDIT);
  check('no blank scenario was saved',
    section.layouts.length, sectionOf('Metadata').layouts.length);
  check('every other block round tripped verbatim',
    saved.components.filter(c => c.name !== 'Metadata')
      .map(c => c.layouts.map(l => l.properties)),
    board.components.filter(c => c.name !== 'Metadata')
      .map(c => c.layouts.map(l => l.properties)));

  console.log(failures === 0 ? '\nproperties editor works' :
    `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(error => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
