// A repeating box says which way it repeats, which is the one thing its
// shape cannot say and the drawings themselves left out.
const http = require('http');
let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if(!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if(!ok) { console.log('        got  ' + JSON.stringify(actual));
            console.log('        want ' + JSON.stringify(expected)); }
}
const PORT = 9222;
function get(t){return new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:PORT,path:t},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>res(JSON.parse(b)));}).on('error',rej);});}
async function main(){
  const page = (await get('/json/list')).find(t=>t.type==='page');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r=>socket.addEventListener('open',r));
  let id=0; const pending=new Map();
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}});
  const send=(m,p)=>new Promise(res=>{id++;pending.set(id,res);socket.send(JSON.stringify({id,method:m,params:p||{}}));});
  const evaluate=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails).slice(0,300));return r.result.value;};
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const move=(x,y,type)=>send('Input.dispatchMouseEvent',{type,x:Math.round(x),y:Math.round(y),button:'left',buttons:1,clickCount:1});
  const drag=async(f,t)=>{await move(f.x,f.y,'mousePressed');
    for(let i=1;i<=8;i++){await move(f.x+(t.x-f.x)*i/8,f.y+(t.y-f.y)*i/8,'mouseMoved');await pause(28);}
    await move(t.x,t.y,'mouseReleased');await pause(320);};
  const name=async t=>{await evaluate(`(() => { const f=document.querySelector('input[placeholder="Element:Name"]');
    const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    s.call(f, ${JSON.stringify(t)}); f.dispatchEvent(new Event('input',{bubbles:true})); })()`); await pause(300);};

  // The buttons of the properties panel, which are the ones outside the
  // board and the outline.
  const CONTROLS = `Array.from(document.querySelectorAll('button')).filter(
    b => b.closest('[data-canvas]') === null &&
      b.closest('[data-outline]') === null)`;
  const policies = () => evaluate(`${CONTROLS}
    .map(b => b.textContent.trim())
    .filter(t => ['Fixed', 'Fill', 'Fit', 'Repeat'].indexOf(t) !== -1)`);
  const setPolicy = async (axis, label) => {
    await evaluate(`${CONTROLS}
      .filter(b => b.textContent.trim() === ${JSON.stringify(label)})
      [${axis}].click()`);
    await pause(300);
  };
  const chosen = () => evaluate(`${CONTROLS}
    .filter(b => ['Fixed', 'Fill', 'Fit', 'Repeat'].indexOf(
      b.textContent.trim()) !== -1)
    .filter(b => getComputedStyle(b).fontWeight === '700')
    .map(b => b.textContent.trim())`);
  const arrows = () => evaluate(`(() => {
    const row = document.querySelector('[data-repeat]');
    if(row === null) { return null; }
    return Array.from(row.querySelectorAll('button')).map(b => b.title);
  })()`);
  const setDirection = async direction => {
    await evaluate(`document.querySelector(
      '[data-repeat] button[title=${JSON.stringify(direction)}]').click()`);
    await pause(300);
  };
  const marked = () => evaluate(`(() => {
    const mark = document.querySelector('[data-canvas] [title^="Repeats"]');
    if(mark === null) { return null; }
    return {title: mark.title, glyph: mark.textContent.trim()};
  })()`);
  const struck = () => evaluate(`(() => {
    const box = Array.from(
      document.querySelector('[data-canvas]').children).find(
        c => c.style.boxShadow.indexOf('inset') !== -1);
    return getComputedStyle(box).boxShadow.split(/,(?![^(]*\\))/)
      .map(s => s.trim())
      .filter(s => s.indexOf('rgb(116, 75, 255)') !== -1)
      .map(s => s.replace('rgb(116, 75, 255) ', '').replace(' inset', ''));
  })()`);
  const noted = () => evaluate(`(() => {
    const notes = Array.from(
      document.querySelectorAll('[data-outline] div > span'));
    return notes.map(s => s.textContent).filter(t => /^\\d+x\\d+/.test(t));
  })()`);

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:8080/'});
  await pause(1800);
  await evaluate(`(() => {
    window.__written = '';
    window.showSaveFilePicker = async () => ({name: 'layout.json',
      createWritable: async () => ({
        write: async t => { window.__written = t; }, close: async () => {}
      })});
  })()`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='New').click()`);
  await pause(400);
  const c = await evaluate(`(() => { const r=document.querySelector('[data-canvas]').getBoundingClientRect(); return {left:r.left, top:r.top}; })()`);
  const at = (x, y) => ({x: c.left + 1 + x, y: c.top + 1 + y});
  await drag(at(20, 20), at(220, 120));
  await name('List');

  check('every axis offers repeat alongside the other three',
    await policies(), ['Fixed', 'Fill', 'Fit', 'Repeat',
      'Fixed', 'Fill', 'Fit', 'Repeat']);
  check('a box that does not repeat is asked nothing about it',
    await arrows(), null);

  await setPolicy(0, 'Repeat');
  check('repeating one axis repeats the box as a whole', await chosen(),
    ['Repeat', 'Repeat']);
  check('which may run any of the four ways', await arrows(),
    ['left', 'right', 'up', 'down']);
  check('though none is chosen for it', await marked(), null);

  await setDirection('right');
  check('the canvas marks which way it repeats', await marked(),
    {title: 'Repeats right', glyph: '\u2192'});
  check('and the outline says so beside its size', await noted(),
    ['200x100\u2192']);
  check('marking the edge it runs from, which is the one behind it',
    await struck(), ['3px 0px 0px 0px']);

  await setPolicy(1, 'Fill');
  check('sizing one axis otherwise stops the box repeating', await chosen(),
    ['Fill', 'Fill']);
  check('so nothing is asked about which way it runs', await arrows(), null);
  check('and the direction it ran goes with it', await marked(), null);

  await setPolicy(1, 'Repeat');
  check('repeating it again asks afresh', await marked(), null);
  await setDirection('down');
  check('and it takes the direction it is given', await marked(),
    {title: 'Repeats down', glyph: '\u2193'});
  check('marking the top edge for a box that repeats downwards',
    await struck(), ['0px 3px 0px 0px']);
  await setDirection('down');
  check('while pressing that again says nothing of which way it runs',
    await marked(), null);

  await setDirection('up');
  await evaluate(`${CONTROLS}.find(b => b.textContent.trim() === 'Save').click()`);
  await pause(700);
  const saved = JSON.parse(await evaluate(`window.__written`));
  const box = saved.components[0].layouts[0].boxes[0];
  check('the file carries the policy', box.heightPolicy, 'repeat');
  check('and the direction with it', box.repeatDirection, 'up');

  const banner = failures === 0 ? 'a repeat says which way it runs'
    : `${failures} FAILURES`;
  console.log('');
  console.log(banner);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
