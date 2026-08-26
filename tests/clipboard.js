// Copying and pasting boxes and whole scenarios.
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
  const move=(x,y,type,buttons)=>send('Input.dispatchMouseEvent',{type,x:Math.round(x),y:Math.round(y),button:'left',buttons:buttons===undefined?1:buttons,clickCount:1});
  const drag=async(f,t)=>{await move(f.x,f.y,'mousePressed');
    for(let i=1;i<=8;i++){await move(f.x+(t.x-f.x)*i/8, f.y+(t.y-f.y)*i/8,'mouseMoved');await pause(28);}
    await move(t.x,t.y,'mouseReleased'); await pause(350);};
  const tap=async(p,shift)=>{
    const modifiers = shift ? 8 : 0;
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:Math.round(p.x),y:Math.round(p.y),button:'left',buttons:1,clickCount:1,modifiers});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:Math.round(p.x),y:Math.round(p.y),button:'left',buttons:0,clickCount:1,modifiers});
    await pause(280);};
  const stroke = async (key, code, virtual) => {
    for(const type of ['keyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', {type, key, code,
        windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual,
        modifiers: 2});
    }
    await pause(320);
  };
  const copy = () => stroke('c', 'KeyC', 67);
  const paste = () => stroke('v', 'KeyV', 86);
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:8080/'});
  await pause(1800);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='New').click()`);
  await pause(400);
  const CANVAS = index => `document.querySelectorAll('[data-canvas]')[${index}]`;
  const lay = async index => await evaluate(`(() => {
    const canvas = ${CANVAS(index)};
    if(canvas === undefined) { return ['(no canvas)']; }
    return Array.from(canvas.children)
      .filter(c => c.style.boxShadow.indexOf('inset') !== -1)
      .map(b => parseInt(b.style.left) + ',' + parseInt(b.style.top) + ' ' +
        parseInt(b.style.width) + 'x' + parseInt(b.style.height) +
        (b.style.outline === '' ? '' : ' SEL'));
  })()`);
  const show = async (index, label) => {
    const now = (await lay(index)).join(' | ');
    console.log('   ' + label.padEnd(26) + now);
    return now;
  };
  const c = await evaluate(`(() => { const r=${CANVAS(0)}.getBoundingClientRect(); return {left:r.left, top:r.top}; })()`);
  const at = (x, y) => ({x: c.left + 1 + x, y: c.top + 1 + y});

  // A single box, copied and pasted twice.
  await drag(at(40, 40), at(240, 140));
  await copy();
  await paste();
  check('a pasted box lands clear of the one it came from',
    await show(0, 'pasted once'),
    '40,40 200x100 | 60,140 200x100 SEL');
  await paste();
  check('and pasting again leaves both of them alone',
    await show(0, 'pasted twice'),
    '40,40 200x100 | 60,140 200x100 | 80,240 200x100 SEL');

  // The copy is taken when Ctrl+C is pressed, not when Ctrl+V is.
  await tap(at(140, 90));
  await copy();
  await drag(at(140, 90), at(140, 70));
  await paste();
  const held = (await lay(0)).find(box => box.indexOf('SEL') !== -1);
  check('what is pasted is what was copied, not what it became',
    held.split(' ')[1], '200x100');

  // Several at once, keeping the space between them.
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='New').click()`);
  await pause(400);
  await drag(at(40, 40), at(140, 90));
  await tap(at(300, 300));
  await drag(at(200, 40), at(300, 90));
  await tap(at(90, 65));
  await tap(at(250, 65), true);
  await copy();
  await paste();
  const pair = (await lay(0)).filter(box => box.indexOf('SEL') !== -1);
  check('both boxes come through', pair.length, 2);
  const across = pair.map(box => parseInt(box.split(',')[0]));
  check('keeping the space between them', across[1] - across[0], 160);
  await show(0, 'a pair pasted');

  // A whole scenario, cloned by the control on its card.
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='New').click()`);
  await pause(400);
  await drag(at(40, 40), at(240, 140));
  const cards = () => evaluate(
    `document.querySelectorAll('[data-canvas]').length`);
  check('a new specification shows the default and a blank', await cards(),
    2);
  await evaluate(`Array.from(document.querySelectorAll('button'))
    .find(b => b.title === 'Copy scenario').click()`);
  await pause(300);
  await paste();
  check('pasting a scenario puts another card on the board',
    await cards(), 3);
  check('holding what the default held', await show(1, 'the clone'),
    '40,40 200x100');
  check('and the default is untouched', await show(0, 'the default'),
    '40,40 200x100');
  const conditions = await evaluate(`Array.from(
    document.querySelectorAll('input[placeholder="condition"]'))
      .map(i => i.value)`);
  check('the clone carries the condition it was copied from, to be edited',
    conditions, ['', '']);

  // Boxes pasted into a scenario that has none.
  await tap(at(140, 90));
  await copy();
  const blank = await evaluate(`(() => {
    const r = document.querySelectorAll('[data-canvas]')[2]
      .getBoundingClientRect();
    return {x: r.left + 60, y: r.top + 60};
  })()`);
  await tap(blank);
  await paste();
  check('pressing a canvas is enough to say where a paste goes',
    await show(2, 'into the blank'), '60,60 200x100 SEL');

  const banner = failures === 0 ? 'copy and paste work' :
    `${failures} FAILURES`;
  console.log('');
  console.log(banner);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
