// Checks that the error panel reports boxes covering one another and space
// no box accounts for, and that pressing what it says selects a box showing
// where the trouble is.
const http = require('http');

const PORT = 9222;

const SPEC = JSON.stringify({
  name: 'Overlaps',
  components: [
    {
      name: 'Main',
      layouts: [
        {
          condition: '',
          properties: '',
          boxes: [
            {name: 'Body', x: 0, y: 0, width: 200, height: 120,
              widthPolicy: 'fill', heightPolicy: 'fit'},
            {name: 'Header', x: 50, y: 30, width: 100, height: 60,
              widthPolicy: 'fill', heightPolicy: 'fit'}
          ],
          overlays: []
        }
      ]
    },
    {
      name: 'Gapped',
      layouts: [
        {
          condition: '',
          properties: '',
          boxes: [
            {name: 'Left', x: 0, y: 0, width: 100, height: 100,
              widthPolicy: 'fill', heightPolicy: 'fit'},
            {name: 'Right', x: 140, y: 0, width: 100, height: 100,
              widthPolicy: 'fill', heightPolicy: 'fit'}
          ],
          overlays: []
        }
      ]
    },
    {
      name: 'Shadowed',
      layouts: [
        {
          condition: '',
          properties: '',
          boxes: [
            {name: 'First', x: 0, y: 0, width: 100, height: 100,
              widthPolicy: 'fill', heightPolicy: 'fit'}
          ],
          overlays: []
        },
        {
          condition: '',
          properties: '',
          boxes: [
            {name: 'Second', x: 0, y: 0, width: 100, height: 100,
              widthPolicy: 'fill', heightPolicy: 'fit'}
          ],
          overlays: []
        }
      ]
    },
    {
      name: 'Warned',
      layouts: [
        {
          condition: '',
          properties: '',
          boxes: [
            {name: 'Item', x: 0, y: 0, width: 150, height: 26,
              widthPolicy: 'fill', heightPolicy: 'fit'},
            {name: '', x: 0, y: 26, width: 150, height: 26,
              widthPolicy: 'repeat', heightPolicy: 'repeat'}
          ],
          overlays: []
        }
      ]
    },
    {
      name: 'Clean',
      layouts: [
        {
          condition: '',
          properties: '',
          boxes: [
            {name: 'Left', x: 0, y: 0, width: 100, height: 100,
              widthPolicy: 'fill', heightPolicy: 'fit'},
            {name: 'Right', x: 100, y: 0, width: 100, height: 100,
              widthPolicy: 'fill', heightPolicy: 'fit'}
          ],
          overlays: []
        }
      ]
    }
  ]
});

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
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const press = async point => {
    for(const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', {type, x: Math.round(point.x),
        y: Math.round(point.y), button: 'left', clickCount: 1});
    }
    await pause(300);
  };

  const stub = `(() => {
    const TEXT = ${JSON.stringify(SPEC)};
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
    window.__panel = () => {
      const panel = document.querySelector('[data-errors]');
      if(panel === null) {
        return null;
      }
      const rows = Array.from(panel.querySelectorAll('[data-problem]'));
      return {
        summary: panel.firstElementChild.textContent.trim(),
        tone: getComputedStyle(panel.firstElementChild).color,
        rows: rows.map(row => row.textContent.trim())
      };
    };
    window.__outline = () => {
      const panel = document.querySelector('[data-outline]');
      return Array.from(
        panel.querySelectorAll('div > button:nth-child(2)')).map(b => {
          const pad = parseInt(b.parentElement.style.paddingLeft) / 12;
          return {
            label: '..'.repeat(pad) + b.textContent.trim(),
            amiss: getComputedStyle(b).color === 'rgb(178, 34, 34)',
            warned: getComputedStyle(b).color === 'rgb(138, 109, 0)'
          };
        });
    };
    window.__working = () => Array.from(
      document.querySelectorAll('[data-canvas]')).findIndex(
        canvas => canvas.style.outline.indexOf('rgb(104, 75, 199)') !== -1);
    window.__row = index => {
      const row = document.querySelectorAll('[data-problem]')[index];
      const r = row.getBoundingClientRect();
      return {x: r.left + r.width / 2, y: r.top + r.height / 2};
    };
    window.__selected = () => {
      const name = document.querySelector('input[placeholder="Element:Name"]');
      return name === null ? null : name.value;
    };
    window.__where = () => {
      const panel = document.querySelector('[data-errors]');
      const column = panel.parentElement;
      const outline = column.previousElementSibling.getBoundingClientRect();
      const properties = column.nextElementSibling.getBoundingClientRect();
      const board = document.querySelector('[style*="crosshair"]')
        .closest('[style*="rgb(245, 245, 245)"]').getBoundingClientRect();
      const mine = panel.getBoundingClientRect();
      return {
        startsWhereTheOutlineEnds: Math.abs(mine.left - outline.right) < 2,
        endsWhereThePropertiesBegin:
          Math.abs(mine.right - properties.left) < 2,
        belowTheBoard: mine.top >= board.bottom - 1,
        atTheBottom: Math.abs(mine.bottom - window.innerHeight) < 2
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

  const fresh = await evaluate(`window.__panel()`);
  check('a new specification is valid', fresh.summary, 'Layout valid.');
  check('and says so in green', fresh.tone, 'rgb(0, 134, 32)');

  await evaluate(`window.__click('Open')`);
  await pause(900);

  const opened = await evaluate(`window.__panel()`);
  check('a box drawn over another is reported', opened.rows,
    ['default: <Body> is covered by <Header>']);
  check('and counted', opened.summary, '1 error');
  check('which is not said in green', opened.tone !== 'rgb(0, 134, 32)',
    true);

  const outline = await evaluate(`window.__outline()`);
  console.log('     ' + outline.map(row => row.label).join(' | '));
  check('the outline marks what is amiss, section included',
    outline.filter(row => row.amiss).map(row => row.label),
    ['Main', '..default', '....<Body>', 'Gapped', 'Shadowed']);
  check('a section with only a warning is marked apart from an error',
    outline.filter(row => row.warned).map(row => row.label),
    ['Warned']);
  check('and leaves the rest alone',
    outline.filter(row => !row.amiss).map(row => row.label).
      indexOf('Clean') !== -1, true);

  const where = await evaluate(`window.__where()`);
  console.log(`     ${JSON.stringify(where)}`);
  check('the panel sits between the outline and the properties',
    [where.startsWhereTheOutlineEnds, where.endsWhereThePropertiesBegin],
    [true, true]);
  check('along the bottom, below the board',
    [where.belowTheBoard, where.atTheBottom], [true, true]);

  check('nothing is selected to begin with',
    await evaluate(`window.__selected()`), null);
  await press(await evaluate(`window.__row(0)`));
  check('pressing what it says selects the box underneath',
    await evaluate(`window.__selected()`), 'Body');

  await evaluate(`window.__section('Gapped')`);
  await pause(700);
  const holed = await evaluate(`window.__panel()`);
  check('space no box accounts for is reported', holed.rows,
    ['default: a gap 40x100 at 100,0, beside <Left>']);
  check('and counted', holed.summary, '1 error');
  await press(await evaluate(`window.__row(0)`));
  check('pressing what it says selects a box along the gap',
    await evaluate(`window.__selected()`), 'Left');

  await evaluate(`window.__section('Shadowed')`);
  await pause(700);
  const shadowed = await evaluate(`window.__panel()`);
  check('a scenario matching everything is reported', shadowed.rows,
    ['no condition: matches everything, so no scenario before it can be ' +
      'reached']);
  check('nothing is being worked in yet',
    await evaluate(`window.__working()`), -1);
  await press(await evaluate(`window.__row(0)`));
  check('pressing it works in the scenario it names, there being no box ' +
    'to select', await evaluate(`window.__working()`), 1);
  check('and nothing is selected', await evaluate(`window.__selected()`),
    null);

  await evaluate(`window.__section('Warned')`);
  await pause(700);
  const warned = await evaluate(`window.__panel()`);
  check('a repeat saying no direction is a warning', warned.rows,
    ['default: space repeats without saying which way it runs']);
  check('and counted as one', warned.summary, '1 warning');

  await evaluate(`window.__section('Clean')`);
  await pause(700);
  const clean = await evaluate(`window.__panel()`);
  check('a section with nothing amiss says so in green',
    [clean.summary, clean.tone, clean.rows],
    ['Layout valid.', 'rgb(0, 134, 32)', []]);

  console.log(failures === 0 ? '\nthe error panel reports what is amiss' :
    `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(error => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
