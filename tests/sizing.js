// Every edge of the selection resizes, and shows the cursor that says so.
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
    for(let i=1;i<=10;i++){await move(f.x+(t.x-f.x)*i/10, f.y+(t.y-f.y)*i/10,'mouseMoved');await pause(28);}
    await move(t.x,t.y,'mouseReleased'); await pause(400);};
  const tap=async p=>{await move(p.x,p.y,'mousePressed');await move(p.x,p.y,'mouseReleased');await pause(300);};
  const LAY = `(() => {
    const canvas = document.querySelector('[data-canvas]');
    return Array.from(canvas.children)
      .filter(c => c.style.boxShadow.indexOf('inset') !== -1)
      .map(b => parseInt(b.style.left) + ',' + parseInt(b.style.top) + ' ' +
        parseInt(b.style.width) + 'x' + parseInt(b.style.height));
  })()`;
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:8080/'});
  await pause(1800);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='New').click()`);
  await pause(400);
  const c = await evaluate(`(() => { const r=document.querySelector('[data-canvas]').getBoundingClientRect(); return {left:r.left, top:r.top}; })()`);
  const at = (x, y) => ({x: c.left + 1 + x, y: c.top + 1 + y});
  await drag(at(40, 40), at(240, 140));
  console.log('drawn:      ' + (await evaluate(LAY)).join(' | '));
  console.log('selected?   ' + await evaluate(
    `document.body.innerText.indexOf('Select a box to edit it.') === -1`));
  // hover the right edge, then drag it out by 60
  await evaluate(`window.__cursor = ''`);
  await move(at(240, 90).x, at(240, 90).y, 'mouseMoved');
  await pause(200);
  const cursor = () => evaluate(
    `getComputedStyle(document.querySelector('[data-canvas]')).cursor`);
  check('the right edge offers a sideways cursor', await cursor(),
    'ew-resize');
  await move(at(140, 40).x, at(140, 40).y, 'mouseMoved');
  await pause(200);
  check('the top edge an upright one', await cursor(), 'ns-resize');
  await move(at(240, 140).x, at(240, 140).y, 'mouseMoved');
  await pause(200);
  check('and a corner a diagonal one', await cursor(), 'nwse-resize');
  await move(at(140, 90).x, at(140, 90).y, 'mouseMoved');
  await pause(200);
  check('the middle of a box offers none', await cursor(), 'crosshair');
  await move(at(240, 90).x, at(240, 90).y, 'mouseMoved');
  await pause(200);
  const show = async (label, expected) => {
    const now = (await evaluate(LAY)).join(' | ');
    console.log('   ' + label.padEnd(20) + now);
    check(label, now, expected);
  };
  await drag(at(240, 90), at(300, 90));
  await show('the right edge moves out', '40,40 260x100');
  await drag(at(140, 40), at(140, 20));
  await show('the top edge moves up', '40,20 260x120');
  await drag(at(40, 90), at(20, 90));
  await show('the left edge moves out', '20,20 280x120');
  await drag(at(150, 140), at(150, 170));
  await show('the bottom edge moves down', '20,20 280x150');
  const banner = failures === 0 ? 'every edge resizes' : failures + ' FAILURES';
  console.log('');
  console.log(banner);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
