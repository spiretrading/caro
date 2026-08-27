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
  const LOOK = `(() => {
    const out = [];
    const walk = e => { for(const c of e.children) {
      if(c.style.boxShadow.indexOf('inset') !== -1) {
        const s = c.querySelector('span');
        const style = getComputedStyle(c);
        out.push({name: s ? s.textContent : '',
          background: style.backgroundColor,
          edges: style.boxShadow,
          ink: s ? getComputedStyle(s).color : ''});
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
  const draw = async (y1, y2, name) => {
    await mouse('mousePressed', b.left + 40, b.top + y1);
    await mouse('mouseMoved', b.left + 300, b.top + (y1 + y2) / 2, 1);
    await mouse('mouseMoved', b.left + 560, b.top + y2, 1);
    await mouse('mouseReleased', b.left + 560, b.top + y2);
    await evaluate(`(() => {
      const i = document.querySelector('input[placeholder="Element:Name"]');
      const s = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value').set;
      s.call(i, ${JSON.stringify(name)});
      i.dispatchEvent(new Event('input', {bubbles: true}));
    })()`);
  };
  const setPolicy = async (axis, choice) => {
    const done = await evaluate(`(() => {
      const caption = Array.from(document.querySelectorAll('span'))
        .find(x => x.textContent === '${axis}');
      if(!caption) return 'no ' + '${axis}' + ' field';
      const button = Array.from(caption.parentElement
        .querySelectorAll('button'))
        .find(x => x.textContent.trim() === '${choice}');
      if(!button) return 'no ' + '${choice}' + ' button';
      button.click();
      return 'ok';
    })()`);
    if(done !== 'ok') throw new Error(done);
    await new Promise(r => setTimeout(r, 140));
  };
  const locate = async name => {
    const found = await evaluate(`(() => {
      const out = [];
      const walk = e => { for(const c of e.children) {
        if(c.style.boxShadow.indexOf('inset') !== -1) {
          const s = c.querySelector('span');
          const r = c.getBoundingClientRect();
          out.push({name: s ? s.textContent : '',
            x: Math.round(r.left + r.width / 2),
            y: Math.round(r.top + r.height / 2)});
        } else if(c.children.length) walk(c); } };
      walk(document.querySelector('[data-canvas]'));
      return out;
    })()`);
    return found.find(r => r.name === name);
  };
  const select = async name => {
    const box = await locate(name);
    if(box === undefined) throw new Error('cannot find ' + name);
    await mouse('mousePressed', box.x, box.y);
    await mouse('mouseReleased', box.x, box.y);
    await new Promise(r => setTimeout(r, 140));
  };
  const deselect = async () => {
    await mouse('mousePressed', b.left + 60, b.top + 280);
    await mouse('mouseReleased', b.left + 60, b.top + 280);
    await new Promise(r => setTimeout(r, 140));
  };

  await draw(30, 110, 'Mixed');
  await draw(140, 220, 'Solid');

  // The first box: fixed width, expanding height -> mixed borders.
  const rects = await evaluate(`(() => {
    const out = [];
    const walk = e => { for(const c of e.children) {
      if(c.style.boxShadow.indexOf('inset') !== -1) {
        const s = c.querySelector('span');
        const r = c.getBoundingClientRect();
        out.push({name: s ? s.textContent : '',
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2)});
      } else if(c.children.length) walk(c); } };
    walk(document.querySelector('[data-canvas]'));
    return out;
  })()`);
  await select('<Mixed>');
  await setPolicy('Width', 'Fixed');
  await setPolicy('Height', 'Fill');
  await deselect();
  let look = await evaluate(LOOK);
  const one = look.find(r => r.name === '<Mixed>');
  console.log('   mixed:', JSON.stringify(one));
  check('a mixed box keeps its neutral fill', one.background,
    'rgb(250, 250, 250)');
  check('its width edges are yellow',
    one.edges.indexOf('rgb(255, 187, 0)') !== -1, true);
  check('its height edges are blue',
    one.edges.indexOf('rgb(0, 102, 255)') !== -1, true);

  // The second box: both axes expanding -> a solid blue block.
  await select('<Solid>');
  await setPolicy('Width', 'Fill');
  await setPolicy('Height', 'Fill');
  await deselect();
  look = await evaluate(LOOK);
  const two = look.find(r => r.name === '<Solid>');
  console.log('   solid:', JSON.stringify(two));
  check('a box with one policy is filled with it', two.background,
    'rgb(0, 102, 255)');
  check('its edges are a darker shade so neighbours stay apart',
    two.edges.indexOf('rgb(0, 71, 178)') !== -1, true);
  check('the edges differ from the fill',
    two.edges.indexOf(two.background) === -1, true);
  check('its label turns white for contrast', two.ink,
    'rgb(255, 255, 255)');

  // Both fixed -> a solid yellow block with dark text.
  await select('<Solid>');
  await setPolicy('Height', 'Fixed');
  await setPolicy('Width', 'Fixed');
  await deselect();
  look = await evaluate(LOOK);
  const three = look.find(r => r.name === '<Solid>');
  console.log('   both fixed:', JSON.stringify(three));
  check('both fixed fills yellow', three.background, 'rgb(255, 187, 0)');
  check('with a darker yellow edge',
    three.edges.indexOf('rgb(178, 131, 0)') !== -1, true);
  check('its label stays dark', three.ink, 'rgb(0, 0, 0)');

  // The component policy: green fill, dark label, darker green edge.
  await select('<Solid>');
  await setPolicy('Width', 'Fit');
  await setPolicy('Height', 'Fit');
  await deselect();
  look = await evaluate(LOOK);
  const four = look.find(r => r.name === '<Solid>');
  console.log('   component:', JSON.stringify(four));
  check('component fills green', four.background, 'rgb(0, 191, 45)');
  check('with a darker green edge',
    four.edges.indexOf('rgb(0, 134, 32)') !== -1, true);
  check('its label stays dark', four.ink, 'rgb(0, 0, 0)');

  // Component on one axis only leaves the borders mixed.
  await select('<Solid>');
  await setPolicy('Width', 'Fixed');
  await deselect();
  look = await evaluate(LOOK);
  const five = look.find(r => r.name === '<Solid>');
  console.log('   half component:', JSON.stringify(five));
  check('a mixed component box is neutral again', five.background,
    'rgb(250, 250, 250)');
  check('its width edges are yellow',
    five.edges.indexOf('rgb(255, 187, 0)') !== -1, true);
  check('its height edges are green',
    five.edges.indexOf('rgb(0, 191, 45)') !== -1, true);

  // The size is kept, so the policy only recolours the box.
  const sized = await locate('<Solid>');
  check('switching to component did not move the box',
    sized !== undefined, true);

  console.log(failures === 0 ? '\nsolid fills work' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
