// A box holds its place until the box being dragged has covered it past its
// middle, so that boxes can be brought up against each other and lined up.
const http = require('http');
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
  const drag=async(f,t)=>{await move(f.x,f.y,'mousePressed');
    for(let i=1;i<=10;i++){await move(f.x+(t.x-f.x)*i/10, f.y+(t.y-f.y)*i/10,'mouseMoved');await pause(28);}
    await move(t.x,t.y,'mouseReleased'); await pause(400);};
  const name=async t=>{await evaluate(`(() => { const f=document.querySelector('input[placeholder="Element:Name"]');
    const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    s.call(f, ${JSON.stringify(t)}); f.dispatchEvent(new Event('input',{bubbles:true})); })()`); await pause(300);};
  const BOXES = `(() => {
    const canvas = document.querySelector('[data-canvas]');
    return Array.from(canvas.children)
      .filter(c => c.style.boxShadow.indexOf('inset') !== -1)
      .map(b => { const s = b.querySelector('span');
        return {name: s === null ? '' : s.textContent.trim(),
          x: parseInt(b.style.left), y: parseInt(b.style.top)}; });
  })()`;
  const where = async label => (await evaluate(BOXES)).find(b => b.name === '<' + label + '>');
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:8080/'});
  await pause(1800);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='New').click()`);
  await pause(400);
  const c = await evaluate(`(() => { const r=document.querySelector('[data-canvas]').getBoundingClientRect(); return {left:r.left, top:r.top}; })()`);
  const at = (x, y) => ({x: c.left + 1 + x, y: c.top + 1 + y});
  // A on top spanning y 20..70 (its middle is y=45), B below it
  await drag(at(20, 20), at(220, 70));
  await name('A');
  await drag(at(20, 100), at(220, 150));
  await name('B');
  check('they start apart', [(await where('A')).y, (await where('B')).y], [20, 100]);

  // nudge B up so it covers A by 20, short of A's middle
  await drag(at(120, 125), at(120, 75));
  check('A holds its place while B is short of its middle',
    (await where('A')).y, 20);
  check('and B sits where it was put', (await where('B')).y, 50);

  // carry B further, past A's middle
  await drag(at(120, 75), at(120, 55));
  const a = await where('A');
  const b = await where('B');
  console.log('   past the middle: A@' + a.y + '  B@' + b.y);
  check('A gives way once B is past its middle', a.y !== 20, true);
  check('and nothing overlaps', Math.abs(a.y - b.y) >= 50, true);
  console.log(failures === 0 ? '\nboxes give way at the halfway point' :
    `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
