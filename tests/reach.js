// Any box's edge resizes it, not just the edges of the one selected.
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
    for(let i=1;i<=10;i++){await move(f.x+(t.x-f.x)*i/10, f.y+(t.y-f.y)*i/10,'mouseMoved');await pause(25);}
    await move(t.x,t.y,'mouseReleased'); await pause(350);};
  const tap=async p=>{await move(p.x,p.y,'mousePressed');await move(p.x,p.y,'mouseReleased');await pause(300);};
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
  const hover = async point => {
    await move(point.x - 40, point.y, 'mouseMoved', 0);
    await pause(50);
    await move(point.x, point.y, 'mouseMoved', 0);
    await pause(200);
    return await cursor();
  };
  const layout = async label => {
    const now = (await evaluate(LAY)).join(' | ');
    console.log('   ' + label.padEnd(24) + now);
    return now;
  };
  await drag(at(40, 40), at(140, 140));
  await tap(at(40, 260));
  await drag(at(200, 40), at(300, 140));
  await tap(at(40, 260));
  await drag(at(360, 40), at(460, 140));
  await tap(at(40, 260));
  check('three boxes, none selected', await layout('drawn'),
    '40,40 100x100 | 200,40 100x100 | 360,40 100x100');
  check('the first box offers its right edge', await hover(at(140, 90)),
    'ew-resize');
  check('so does the one in the middle', await hover(at(300, 90)),
    'ew-resize');
  check('and its left edge too', await hover(at(200, 90)), 'ew-resize');
  check('and the last, which is the rightmost', await hover(at(460, 90)),
    'ew-resize');
  check('a corner of an unselected box is diagonal',
    await hover(at(300, 140)), 'nwse-resize');
  check('the middle of a box still offers none', await hover(at(250, 90)),
    'crosshair');
  check('the cursor reaches just past an unselected edge',
    await hover(at(306, 90)), 'ew-resize');
  check('and just before it', await hover(at(294, 90)), 'ew-resize');
  await drag(at(300, 90), at(340, 90));
  check('an unselected edge resizes, and takes the selection',
    await layout('resized'),
    '40,40 100x100 | 200,40 140x100 SEL | 360,40 100x100');
  await tap(at(40, 260));
  await drag(at(100, 90), at(120, 110));
  check('the middle of an unselected box still moves it',
    await layout('moved'),
    '60,60 100x100 SEL | 200,40 140x100 | 360,40 100x100');
  await tap(at(40, 260));
  await drag(at(200, 200), at(300, 280));
  check('and open canvas still draws',
    await layout('drawn below'),
    '60,60 100x100 | 200,40 140x100 | 360,40 100x100 | 200,200 100x80 SEL');
  const banner = failures === 0 ?
    'every box resizes from its own edges' : failures + ' FAILURES';
  console.log('');
  console.log(banner);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
