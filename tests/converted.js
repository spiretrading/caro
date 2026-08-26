// Loads the converted specifications into caro through a stand-in for the
// directory picker, and reports what the editor makes of them.
const path = require('path');

// The converted specifications, which live beside the repository. Suites
// needing them report themselves skipped when they are not there.
const SPECS = process.env.CARO_SPECS ||
  path.resolve(__dirname, '..', '..', 'caro_specs');
if(!require('fs').existsSync(SPECS)) {
  console.log(`skipped: no specifications at ${SPECS}`);
  process.exit(failures === 0 ? 0 : 1);
}

const http = require('http');
const fs = require('fs');

const PORT = 9222;
const ROOT = SPECS;

function get(target) {
  return new Promise((resolve, reject) => {
    http.get({host: '127.0.0.1', port: PORT, path: target}, response => {
      let body = '';
      response.on('data', chunk => body += chunk);
      response.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

function collect(directory) {
  const entries = fs.readdirSync(directory, {withFileTypes: true});
  const files = {};
  for(const entry of entries) {
    const full = path.join(directory, entry.name);
    if(entry.isDirectory()) {
      files[entry.name] = {kind: 'directory', children: collect(full)};
    } else if(entry.name === 'layout.json') {
      files[entry.name] = {kind: 'file', text: fs.readFileSync(full, 'utf8')};
    }
  }
  return files;
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

  const files = {};
  const walk = (directory, prefix) => {
    for(const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const full = path.join(directory, entry.name);
      if(entry.isDirectory()) {
        walk(full, prefix + entry.name + '/');
      } else if(entry.name === 'layout.json') {
        files[prefix + entry.name] = fs.readFileSync(full, 'utf8');
      }
    }
  };
  walk(ROOT, '');
  const stub = `(() => {
  const FILES = ${JSON.stringify(files)};
  window.__pick = '';
  window.showOpenFilePicker = async () => {
    const which = window.__pick;
    return [{
      name: which.split('/').pop(),
      getFile: async () => ({text: async () => FILES[which]}),
      createWritable: async () => ({
        write: async () => {}, close: async () => {}
      })
    }];
  };
})()`;

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {source: stub});
  await send('Page.navigate', {url: 'http://localhost:8080/'});
  await new Promise(r => setTimeout(r, 1600));

  const paths = Object.keys(files).sort();
  console.log('   converted:');
  for(const found of paths) {
    console.log('     ' + found);
  }
  check('no dropdown remains', await evaluate(
    `document.querySelectorAll('select').length`), 0);

  const open = async which => {
    await evaluate(`window.__pick = ${JSON.stringify(which)}`);
    await evaluate(`Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.trim() === 'Open').click()`);
    await new Promise(r => setTimeout(r, 700));
  };
  const survey = `(() => {
    const canvases = document.querySelectorAll('[style*="crosshair"]');
    let boxes = 0, named = 0, containers = 0;
    canvases.forEach(canvas => {
      const walk = e => { for(const c of e.children) {
        if(c.style.boxShadow.indexOf('inset') !== -1) {
          boxes++;
          if(c.querySelector('span')) named++;
        } else if(c.children.length) { containers++; walk(c); } } };
      walk(canvas);
    });
    const conditions = Array.from(document.querySelectorAll(
      'input[placeholder="condition"]')).map(i => i.value).filter(v => v);
    document.querySelector('[title="Choose a section"]').click();
    const items = Array.from(document.querySelectorAll('button'))
      .filter(b => b.parentElement.style.position === 'absolute');
    const sections = items.length;
    const section = document.querySelector(
      'input[placeholder="Section:Name"]').value;
    document.querySelector('[title="Choose a section"]').click();
    return {scenarios: canvases.length, boxes, named, containers,
      sections, section, conditions: conditions.join(' ; ')};
  })()`;

  for(const which of paths) {
    await open(which);
    const report = await evaluate(survey);
    console.log('');
    console.log('   ' + which);
    console.log(`     ${report.sections} sections, showing "${report.section}"`);
    console.log(`     ${report.scenarios} scenarios, ${report.boxes} boxes ` +
      `(${report.named} named), ${report.containers} nested containers`);
    if(report.conditions !== '') {
      console.log(`     conditions: ${report.conditions}`);
    }
    check(`${which} rendered boxes`, report.boxes > 0, true);
    check(`${which} opens on its outermost section`,
      report.section.indexOf(':') === -1, true);
    check(`${which} kept a blank scenario at the end`,
      report.scenarios >= 2, true);
  }

  console.log(failures === 0 ? '\nconverted specifications open' :
    `\n${failures} FAILURES`);
  process.exit(0);
}

main().catch(error => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
