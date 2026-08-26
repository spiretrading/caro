// While a box is being dragged, the layout shows what dropping it would do,
// and what it shows is what you get.
const http = require('http');
const fs = require('fs');
const PORT = 9222;
function get(t){return new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:PORT,path:t},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>res(JSON.parse(b)));}).on('error',rej);});}
let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if(!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if(!ok) { console.log('        got  ' + JSON.stringify(actual));
            console.log('        want ' + JSON.stringify(expected)); }
}
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
  const name=async t=>{await evaluate(`(() => { const f=document.querySelector('input[placeholder="Element:Name"]');
    const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    s.call(f, ${JSON.stringify(t)}); f.dispatchEvent(new Event('input',{bubbles:true})); })()`); await pause(300);};
  const LAY = `(() => {
    const canvas = document.querySelector('[data-canvas]');
    const found = [];
    const walk = e => { for(const c of e.children) {
      if(c.style.boxShadow.indexOf('inset') !== -1) found.push(c);
      else if(c.children.length) walk(c); } };
    walk(canvas);
    const marker = Array.from(canvas.children).find(c =>
      c.style.backgroundColor === 'rgb(104, 75, 199)');
    return {boxes: found.map(b => { const s = b.querySelector('span');
        const r = b.getBoundingClientRect();
        return {name: s === null ? '' : s.textContent.trim(),
          top: Math.round(r.top), left: Math.round(r.left)}; }),
      marker: marker === undefined ? null : 'shown'};
  })()`;
  const draw = async (from, to) => {
    await move(from.x,from.y,'mousePressed');
    for(let i=1;i<=8;i++){await move(from.x+(to.x-from.x)*i/8, from.y+(to.y-from.y)*i/8,'mouseMoved');await pause(25);}
    await move(to.x,to.y,'mouseReleased'); await pause(400);
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:8080/'});
  await pause(1800);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='New').click()`);
  await pause(400);
  const c = await evaluate(`(() => { const r=document.querySelector('[data-canvas]').getBoundingClientRect(); return {left:r.left, top:r.top}; })()`);
  for(const [i,l] of ['A','B','C'].entries()) {
    const top = c.top + 10 + i*60;
    await draw({x:c.left+20,y:top},{x:c.left+220,y:top+50});
    await name(l);
  }
  const before = await evaluate(LAY);
  console.log('  before: ' + before.boxes.map(b => b.name + '@' + b.top).join(' '));
  const boxAt = async label => evaluate(`(() => {
    const span = Array.from(document.querySelectorAll('span')).find(s=>s.textContent.trim()===${JSON.stringify('<')}+${JSON.stringify(label)}+${JSON.stringify('>')});
    const r = span.parentElement.getBoundingClientRect();
    return {x:r.left+r.width/2, y:r.top+r.height/2}; })()`);
  // drag A down past C without releasing
  const from = await boxAt('A');
  const target = await boxAt('C');
  await move(from.x, from.y, 'mousePressed');
  for(let i=1;i<=10;i++){await move(from.x, from.y + (target.y + 20 - from.y)*i/10,'mouseMoved');await pause(30);}
  const order = boxes => boxes.slice().sort((a, b) => a.top - b.top)
    .map(b => b.name);
  const during = await evaluate(LAY);
  console.log('  during: ' + during.boxes.map(b => b.name + '@' + b.top).join(' '));
  check('the layout reflows to show the drop',
    order(during.boxes).join() !== order(before.boxes).join(), true);
  check('and shows the box already in its new place',
    order(during.boxes), ['<B>','<C>','<A>']);
  const held = await evaluate(LAY);
  check('holding still changes nothing further',
    held.boxes.map(b => b.name + '@' + b.top),
    during.boxes.map(b => b.name + '@' + b.top));
  await move(from.x, target.y + 20, 'mouseReleased');
  await pause(500);
  const after = await evaluate(LAY);
  console.log('  after:  ' + after.boxes.map(b => b.name + '@' + b.top).join(' '));
  check('releasing keeps exactly what was shown', order(after.boxes),
    order(during.boxes));
  check('and the marker is gone', after.marker, null);
  console.log(failures === 0 ? '\nthe drop is previewed' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
