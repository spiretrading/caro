// Every change can be taken back and put back again, a gesture counting as
// the one change it is rather than as every step it passed through.
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
  const tap=async p=>{await move(p.x,p.y,'mousePressed');await move(p.x,p.y,'mouseReleased');await pause(280);};
  const CODES = {z: 90, y: 89, Delete: 46};
  const stroke = async (key, modifiers) => {
    for(const type of ['keyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', {type, key, code: `Key${key}`,
        modifiers, windowsVirtualKeyCode: CODES[key] || 0,
        nativeVirtualKeyCode: CODES[key] || 0});
    }
    await pause(320);
  };
  const undo = () => stroke('z', 2);
  const redo = () => stroke('y', 2);
  const again = () => stroke('z', 10);
  const press = async title => {
    await evaluate(`document.querySelector(
      'button[title=${JSON.stringify(title)}]').click()`);
    await pause(320);
  };
  const shut = title => evaluate(`document.querySelector(
    'button[title=${JSON.stringify(title)}]').disabled`);
  // Every box on the board, named and placed.
  const drawn = () => evaluate(`(() => {
    const canvas = document.querySelector('[data-canvas]');
    return Array.from(canvas.children)
      .filter(c => c.style.boxShadow.indexOf('inset') !== -1)
      .map(c => {
        const label = c.querySelector('span');
        const name = label === null ? '?' : label.textContent.trim();
        return name + '@' + parseInt(c.style.left) + ',' +
          parseInt(c.style.top);
      });
  })()`);
  const name = async t => {
    await evaluate(`(() => { const f = document.querySelector(
      'input[placeholder="Element:Name"]');
      const s = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value').set;
      s.call(f, ${JSON.stringify(t)});
      f.dispatchEvent(new Event('input', {bubbles: true})); })()`);
    await pause(160);
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:8080/'});
  await pause(1800);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='New').click()`);
  await pause(400);
  const c = await evaluate(`(() => { const r=document.querySelector('[data-canvas]').getBoundingClientRect(); return {left:r.left, top:r.top}; })()`);
  const at = (x, y) => ({x: c.left + 1 + x, y: c.top + 1 + y});

  check('a specification just started has nothing to take back',
    await shut('Undo'), true);
  check('nor anything to put back', await shut('Redo'), true);

  await drag(at(20, 20), at(220, 70));
  await name('A');
  await tap(at(400, 300));
  await drag(at(20, 100), at(220, 150));
  await name('B');
  await tap(at(400, 300));
  check('two boxes drawn and named', await drawn(),
    ['<A>@20,20', '<B>@20,100']);
  check('and there is now something to take back', await shut('Undo'), false);

  await undo();
  check('taking back a name leaves the box it named', await drawn(),
    ['<A>@20,20', '?@20,100']);
  await undo();
  check('and taking back the drawing takes the box with it', await drawn(),
    ['<A>@20,20']);
  await redo();
  check('putting it back draws it again', await drawn(),
    ['<A>@20,20', '?@20,100']);
  await again();
  check('and shift with it puts back the name too', await drawn(),
    ['<A>@20,20', '<B>@20,100']);
  check('with nothing further to put back', await shut('Redo'), true);

  // A name typed a letter at a time is one change, not four.
  await tap(at(120, 45));
  await name('Ab');
  await name('Abc');
  await name('Abcd');
  await tap(at(400, 300));
  check('a name typed is taken', await drawn(),
    ['<Abcd>@20,20', '<B>@20,100']);
  await undo();
  check('and taken back a name at a time, not a letter at a time',
    await drawn(), ['<A>@20,20', '<B>@20,100']);

  // A drag is one change however many steps it passed through.
  await drag(at(120, 45), at(320, 245));
  check('a box carried across the canvas', await drawn(),
    ['<A>@220,220', '<B>@20,100']);
  await undo();
  check('is taken back where it came from in one step', await drawn(),
    ['<A>@20,20', '<B>@20,100']);

  // What was selected comes back with what it was selected from.
  await tap(at(120, 45));
  await evaluate(`Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.trim() === 'Delete').click()`);
  await pause(320);
  check('a box deleted leaves the rest', await drawn(), ['<B>@20,100']);
  await undo();
  check('and comes back where it was', await drawn(),
    ['<A>@20,20', '<B>@20,100']);
  check('selected as it was when it went', await evaluate(`(() => {
    const canvas = document.querySelector('[data-canvas]');
    return Array.from(canvas.children)
      .filter(c => c.style.outline !== '' &&
        c.style.boxShadow.indexOf('inset') !== -1)
      .map(c => {
        const label = c.querySelector('span');
        return label === null ? '?' : label.textContent.trim();
      });
  })()`), ['<A>']);

  // Taking back everything empties the specification, and there is then
  // nothing left to take back.
  for(let step = 0; step < 12; step += 1) {
    if(await shut('Undo')) {
      break;
    }
    await press('Undo');
  }
  check('taking back everything leaves nothing drawn', await drawn(), []);
  check('and nothing more to take back', await shut('Undo'), true);
  check('though everything to put back', await shut('Redo'), false);

  const banner = failures === 0 ? 'a change can be taken back and put back'
    : `${failures} FAILURES`;
  console.log('');
  console.log(banner);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
