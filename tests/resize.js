// Checks the app opens ready to draw, labels boxes as <Name>, and resizes
// a box by dragging its border.
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

class Session {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      const entry = this.pending.get(message.id);
      if(entry !== undefined) {
        this.pending.delete(message.id);
        if(message.error) {
          entry.reject(new Error(JSON.stringify(message.error)));
        } else {
          entry.resolve(message.result);
        }
      }
    });
  }

  send(method, params) {
    this.id += 1;
    const id = this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, {resolve, reject});
      this.socket.send(JSON.stringify({id, method, params: params || {}}));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate',
      {expression, returnByValue: true, awaitPromise: true});
    if(result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception.description ||
        JSON.stringify(result.exceptionDetails));
    }
    return result.result.value;
  }

  async mouse(type, x, y, buttons) {
    await this.send('Input.dispatchMouseEvent', {
      type, x: Math.round(x), y: Math.round(y), button: 'left',
      clickCount: 1, buttons: buttons || 0
    });
    await new Promise(resolve => setTimeout(resolve, 12));
  }
}

async function connect() {
  const targets = await get('/json/list');
  const page = targets.find(t => t.type === 'page');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve);
    socket.addEventListener('error', reject);
  });
  return new Session(socket);
}

const IS_BOX = "child.style.boxShadow.indexOf('inset') !== -1";

const READ_RECTS = `(() => {
  const surface = document.querySelector('[data-canvas]');
  const out = [];
  const walk = element => {
    for(const child of element.children) {
      if(${IS_BOX}) {
        const label = child.querySelector('span');
        const r = child.getBoundingClientRect();
        out.push({name: label ? label.textContent : '',
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
          left: Math.round(r.left), right: Math.round(r.right),
          top: Math.round(r.top), bottom: Math.round(r.bottom),
          w: Math.round(r.width), h: Math.round(r.height),
          cursor: child.style.cursor});
      } else if(child.children.length) {
        walk(child);
      }
    }
  };
  walk(surface);
  return out;
})()`;

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

async function drawBox(session, x1, y1, x2, y2, name) {
  await session.mouse('mousePressed', x1, y1);
  await session.mouse('mouseMoved', (x1 + x2) / 2, (y1 + y2) / 2, 1);
  await session.mouse('mouseMoved', x2, y2, 1);
  await session.mouse('mouseReleased', x2, y2);
  if(name === undefined) {
    return;
  }
  await session.evaluate(`(() => {
    const input = document.querySelector('input[placeholder="Element:Name"]');
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(name)});
    input.dispatchEvent(new Event('input', {bubbles: true}));
  })()`);
}

async function main() {
  const session = await connect();
  await session.send('Page.enable');
  await session.send('Runtime.enable');
  await session.send('Page.navigate', {url: 'http://localhost:8080/'});
  await new Promise(resolve => setTimeout(resolve, 1600));

  const canvas = await session.evaluate(`(() => {
    const surface = document.querySelector('[data-canvas]');
    if(!surface) return null;
    const r = surface.getBoundingClientRect();
    return {left: Math.round(r.left), top: Math.round(r.top),
      right: Math.round(r.right), bottom: Math.round(r.bottom)};
  })()`);
  check('the canvas is ready without pressing New', canvas !== null, true);
  if(canvas === null) {
    process.exit(1);
  }

  await drawBox(session, canvas.left + 40, canvas.top + 40,
    canvas.left + 340, canvas.top + 140, 'Header');
  await drawBox(session, canvas.left + 40, canvas.top + 180,
    canvas.left + 340, canvas.top + 260);
  let rects = await session.evaluate(READ_RECTS);
  check('a named box reads as <Name>', rects[0].name, '<Header>');
  check('an unnamed box shows no text', rects[1].name, '');

  // Resize the last box, whose bottom edge is the outer edge of the stack.
  // Boundaries between boxes are covered by splitter.js.
  const cursorAt = async (x, y) => {
    await session.mouse('mouseMoved', x, y, 0);
    const probe = '(() => { const e = document.elementFromPoint(' +
      Math.round(x) + ', ' + Math.round(y) + ');' +
      " return e ? (e.style.cursor || getComputedStyle(e).cursor)" +
      " : 'none'; })()";
    return await session.evaluate(probe);
  };
  const last = () => rects[rects.length - 1];
  console.log(`      last box starts ${last().w} x ${last().h}`);

  const start = last();
  check('hovering the outer bottom edge offers a vertical resize',
    await cursorAt(start.x, start.bottom - 2), 'ns-resize');
  await session.mouse('mousePressed', start.x, start.bottom - 2);
  for(let i = 1; i <= 10; ++i) {
    await session.mouse('mouseMoved', start.x, start.bottom - 2 + i * 5, 1);
  }
  await session.mouse('mouseReleased', start.x, start.bottom + 48);
  await new Promise(resolve => setTimeout(resolve, 150));
  rects = await session.evaluate(READ_RECTS);
  console.log(`      last box now ${last().w} x ${last().h}`);
  check('dragging it grew the height by 50', last().h, start.h + 50);
  check('the width was left alone', last().w, start.w);

  const grown = last();
  check('hovering the right edge offers a horizontal resize',
    await cursorAt(grown.right - 2, grown.y), 'ew-resize');
  await session.mouse('mousePressed', grown.right - 2, grown.y);
  for(let i = 1; i <= 10; ++i) {
    await session.mouse('mouseMoved', grown.right - 2 - i * 10, grown.y, 1);
  }
  await session.mouse('mouseReleased', grown.right - 102, grown.y);
  await new Promise(resolve => setTimeout(resolve, 150));
  rects = await session.evaluate(READ_RECTS);
  console.log(`      last box now ${last().w} x ${last().h}`);
  check('dragging it shrank the width by 100', last().w, grown.w - 100);
  check('the height was left alone', last().h, grown.h);

  const corner = last();
  check('the outer bottom-right corner offers a diagonal',
    await cursorAt(corner.right - 3, corner.bottom - 3), 'nwse-resize');
  await session.mouse('mousePressed', corner.right - 3, corner.bottom - 3);
  for(let i = 1; i <= 10; ++i) {
    await session.mouse('mouseMoved', corner.right - 3 + i * 6,
      corner.bottom - 3 + i * 4, 1);
  }
  await session.mouse('mouseReleased', corner.right + 57, corner.bottom + 37);
  await new Promise(resolve => setTimeout(resolve, 150));
  rects = await session.evaluate(READ_RECTS);
  console.log(`      last box now ${last().w} x ${last().h}`);
  check('the corner grew the width by 60', last().w, corner.w + 60);
  check('the corner grew the height by 40', last().h, corner.h + 40);

  check('the middle of a box is not a resize handle',
    await cursorAt(last().x, last().y), 'move');
  check('the left edge resizes too',
    await cursorAt(last().left + 2, last().y), 'ew-resize');

  const summary = (() => {
    if(failures === 0) { return 'resizing works'; }
    return failures + ' FAILURES';
  })();
  console.log('');
  console.log(summary);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(error => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
