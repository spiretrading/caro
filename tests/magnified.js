// The resize band stays on the edge however far the canvas is magnified,
// and the cursor is still there when a gesture ends under a still mouse.
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
  await drag(at(40, 40), at(60, 55));
  console.log('   drawn: ' + await evaluate(
    `(() => { const b = document.querySelector('[data-canvas]').children[0];
      return b.style.left + ',' + b.style.top + ' ' + b.style.width + 'x' +
        b.style.height; })()`));
  const zoomIn = async steps => {
    for(let i = 0; i < steps; i++) {
      await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.title==='Zoom in').click()`);
      await pause(150);
    }
    await pause(300);
  };
  const edge = async () => {
    await evaluate(`document.querySelector('[data-canvas]').children[0]
      .scrollIntoView({block: 'center', inline: 'center'})`);
    await pause(300);
    return await evaluate(`(() => {
      const r = document.querySelector('[data-canvas]').children[0]
        .getBoundingClientRect();
      return {x: r.right, y: (r.top + r.bottom) / 2};
    })()`);
  };
  const onEdge = async label => {
    const place = await edge();
    await move(place.x - 60, place.y, 'mouseMoved', 0);
    await pause(60);
    await move(place.x, place.y, 'mouseMoved', 0);
    await pause(200);
    check(label, await cursor(), 'ew-resize');
    return place;
  };
  await onEdge('the edge resizes at 100%');
  await zoomIn(3);
  await onEdge('and at 300%');
  await zoomIn(3);
  await onEdge('and at 800%');
  await zoomIn(1);
  const place = await onEdge('and at 1000%');
  await move(place.x, place.y, 'mousePressed');
  for(let i = 1; i <= 6; i++) {
    await move(place.x + 40 * i / 6, place.y, 'mouseMoved');
    await pause(28);
  }
  await move(place.x + 40, place.y, 'mouseReleased');
  await pause(400);
  console.log('   resized: ' + await evaluate(
    `(() => { const b = document.querySelector('[data-canvas]').children[0];
      return b.style.width + 'x' + b.style.height; })()`));
  check('the cursor is still there when the resize ends', await cursor(),
    'ew-resize');
  const banner = failures === 0 ?
    'the band holds the edge at every magnification' : failures + ' FAILURES';
  console.log('');
  console.log(banner);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
