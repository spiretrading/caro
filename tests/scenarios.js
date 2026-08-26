// Checks scenarios appear side by side, and can be added, named, reordered
// and deleted, with the default fixed first.
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
    if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const mouse = async (type, x, y, buttons) => {
    await send('Input.dispatchMouseEvent', {type, x: Math.round(x),
      y: Math.round(y), button: 'left', clickCount: 1, buttons: buttons || 0});
    await new Promise(r => setTimeout(r, 14));
  };

  // Each scenario is a canvas; report its heading and its boxes.
  const CARDS = `(() => {
    return Array.from(document.querySelectorAll('[data-canvas]'))
      .map(canvas => {
        const card = canvas.parentElement;
        const heading = card.firstChild;
        const input = heading.querySelector('input');
        const marker = heading.querySelector('span');
        const label = (() => {
          if(input !== null) { return input.value; }
          if(marker !== null) { return marker.textContent.trim(); }
          return heading.textContent.trim();
        })();
        const boxes = [];
        const walk = e => { for(const c of e.children) {
          if(c.style.boxShadow.indexOf('inset') !== -1) {
            const s = c.querySelector('span');
            boxes.push(s ? s.textContent : '.');
          } else if(c.children.length) walk(c); } };
        walk(canvas);
        const r = canvas.getBoundingClientRect();
        return {label, boxes: boxes.join(' '),
          left: Math.round(r.left), width: Math.round(r.width),
          height: Math.round(r.height)};
      });
  })()`;

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', {url: 'http://localhost:8080/'});
  await new Promise(r => setTimeout(r, 1600));

  let cards = await evaluate(CARDS);
  check('the default and a blank to begin with', cards.length, 2);
  check('the first is the default', cards[0].label, 'default');
  check('the second is blank', cards[1].boxes + cards[1].label, '');
  check('no add button', await evaluate(
    `document.querySelectorAll('[title="Add a scenario"]').length`), 0);
  check('a section is selected from the start', await evaluate(
    `document.querySelector('input[placeholder="Section:Name"]').value`),
    'Main');
  console.log(`   blank card is ${cards[0].width}x${cards[0].height}`);
  check('a blank scenario has a floor to draw into',
    cards[0].width >= 400 && cards[0].height >= 300, true);
  check('no dropdowns remain at all', await evaluate(
    `document.querySelectorAll('select').length`), 0);

  const draw = async (canvasLeft, canvasTop, name) => {
    await mouse('mousePressed', canvasLeft + 30, canvasTop + 30);
    await mouse('mouseMoved', canvasLeft + 120, canvasTop + 70, 1);
    await mouse('mouseMoved', canvasLeft + 210, canvasTop + 110, 1);
    await mouse('mouseReleased', canvasLeft + 210, canvasTop + 110);
    await evaluate(`(() => {
      const i = document.querySelector('input[placeholder="Element:Name"]');
      const s = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value').set;
      s.call(i, ${JSON.stringify(name)});
      i.dispatchEvent(new Event('input', {bubbles: true}));
    })()`);
  };
  const canvasAt = async index => {
    const found = await evaluate(`(() => {
      const c = document.querySelectorAll(
        '[data-canvas]')[${index}];
      const r = c.getBoundingClientRect();
      return {left: Math.round(r.left), top: Math.round(r.top)};
    })()`);
    return found;
  };

  let spot = await canvasAt(0);
  await draw(spot.left, spot.top, 'Header');
  cards = await evaluate(CARDS);
  check('populating the default did not open a second blank',
    cards.length, 2);
  check('the blank is still blank', cards[1].boxes, '');
  check('and sits to its right', cards[0].left < cards[1].left, true);

  // Name their conditions.
  const setCondition = async (index, text) => {
    await evaluate(`(() => {
      const inputs = Array.from(document.querySelectorAll(
        'input[placeholder="condition"]'));
      const input = inputs[${index}];
      const s = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value').set;
      s.call(input, ${JSON.stringify(text)});
      input.dispatchEvent(new Event('input', {bubbles: true}));
    })()`);
    await new Promise(r => setTimeout(r, 160));
  };
  await setCondition(0, 'any < status is READY');
  cards = await evaluate(CARDS);
  check('naming the blank scenario opens another', cards.length, 3);
  check('the conditions stuck',
    cards.map(c => c.label).join(' | '),
    'default | any < status is READY | ');

  // Draw into the second scenario; the first must be untouched.
  spot = await canvasAt(1);
  await draw(spot.left, spot.top, 'Spinner');
  await setCondition(1, '@media (768px <= width)');
  cards = await evaluate(CARDS);
  check('the second scenario has its own box', cards[1].boxes, '<Spinner>');
  check('the default is unaffected', cards[0].boxes, '<Header>');
  check('a blank one still waits at the end',
    cards[cards.length - 1].boxes, '');

  // Neither the default nor the trailing blank can be moved or deleted.
  cards = await evaluate(CARDS);
  console.log('   cards: ' + cards.map(c =>
    `[${c.label || 'blank'}: ${c.boxes || 'empty'}]`).join(' '));
  check('only the populated middle scenarios have controls',
    await evaluate(
      `document.querySelectorAll('[title="Delete scenario"]').length`),
    cards.length - 2);
  check('the leftmost movable scenario cannot pass the default',
    await evaluate(`document.querySelectorAll(
      '[title="Move left"]')[0].disabled`), true);
  check('nor can the rightmost pass the blank one',
    await evaluate(`(() => {
      const b = document.querySelectorAll('[title="Move right"]');
      return b[b.length - 1].disabled;
    })()`), true);

  // Delete a populated scenario.
  await evaluate(`(() => {
    document.querySelectorAll('[title="Delete scenario"]')[0].click();
  })()`);
  await new Promise(r => setTimeout(r, 180));
  cards = await evaluate(CARDS);
  check('deleting removed just that scenario',
    cards.map(c => c.label).join(' | '),
    'default | @media (768px <= width) | ');
  check('its box went with it, and a blank still waits',
    cards.map(c => c.boxes).join('|'), '<Header>||');

  console.log(failures === 0 ? '\nscenarios work' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
