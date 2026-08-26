// A box is selected by the press that starts a drag, so it can be resized
// straight after being moved, and the resize cursor shows over the box too.
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
  const drag=async(f,t,shift)=>{await move(f.x,f.y,'mousePressed');
    for(let i=1;i<=10;i++){await move(f.x+(t.x-f.x)*i/10, f.y+(t.y-f.y)*i/10,'mouseMoved');await pause(28);}
    await move(t.x,t.y,'mouseReleased'); await pause(400);};
  const tap=async(p,shift)=>{
    const modifiers = shift ? 8 : 0;
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:Math.round(p.x),y:Math.round(p.y),button:'left',buttons:1,clickCount:1,modifiers});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:Math.round(p.x),y:Math.round(p.y),button:'left',buttons:0,clickCount:1,modifiers});
    await pause(300);};
  const LAY = `(() => {
    const canvas = document.querySelector('[data-canvas]');
    return Array.from(canvas.children)
      .filter(c => c.style.boxShadow.indexOf('inset') !== -1)
      .map(b => parseInt(b.style.left) + ',' + parseInt(b.style.top) + ' ' +
        parseInt(b.style.width) + 'x' + parseInt(b.style.height) +
        (b.style.outline === '' ? '' : ' SEL'));
  })()`;
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:8080/'});
  await pause(1800);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='New').click()`);
  await pause(400);
  const c = await evaluate(`(() => { const r=document.querySelector('[data-canvas]').getBoundingClientRect(); return {left:r.left, top:r.top}; })()`);
  const at = (x, y) => ({x: c.left + 1 + x, y: c.top + 1 + y});
  const cursor = () => evaluate(
    `getComputedStyle(document.querySelector('[data-canvas]')).cursor`);
  const over = point => evaluate(
    `getComputedStyle(document.elementFromPoint(${Math.round(point.x)},
      ${Math.round(point.y)})).cursor`);
  const hover = async point => {
    await move(point.x - 30, point.y - 30, 'mouseMoved', 0);
    await pause(60);
    await move(point.x, point.y, 'mouseMoved', 0);
    await pause(200);
  };
  const layout = async label => {
    const now = (await evaluate(LAY)).join(' | ');
    console.log('   ' + label.padEnd(26) + now);
    return now;
  };
  await drag(at(40, 40), at(240, 140));
  await drag(at(300, 40), at(500, 140));
  await tap(at(40, 250));
  check('nothing is selected to begin with', await layout('drawn'),
    '40,40 200x100 | 300,40 200x100');
  await drag(at(140, 90), at(170, 90));
  check('dragging an unselected box selects it', await layout('moved'),
    '70,40 200x100 SEL | 300,40 200x100');
  await hover(at(270, 90));
  check('so its edge offers a resize cursor at once', await cursor(),
    'ew-resize');
  await hover(at(266, 90));
  check('which shows over the box as well as beside it',
    await over(at(266, 90)), 'ew-resize');
  await drag(at(270, 90), at(300, 90));
  check('and the edge resizes', await layout('resized'),
    '70,40 230x100 SEL | 300,40 200x100');
  await tap(at(400, 90), true);
  check('shift adds a box to the selection', await layout('extended'),
    '70,40 230x100 SEL | 300,40 200x100 SEL');
  await hover(at(495, 90));
  check('the pair resizes from the far edge of both', await cursor(),
    'ew-resize');
  await drag(at(150, 90), at(150, 130));
  check('dragging one of them carries both',
    await layout('moved together'),
    '70,80 230x100 SEL | 300,80 200x100 SEL');
  await tap(at(150, 120));
  check('and a press without a drag picks out just one',
    await layout('narrowed'),
    '70,80 230x100 SEL | 300,80 200x100');
  const banner = failures === 0 ?
    'moving a box leaves it ready to resize' : failures + ' FAILURES';
  console.log('');
  console.log(banner);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
