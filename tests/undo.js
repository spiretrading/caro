// What a drag shows is what dropping would do, and nothing more: carry a box
// over another and away again, and the layout is as it was.
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
  const LAY = `(() => {
    const canvas = document.querySelector('[data-canvas]');
    return Array.from(canvas.children)
      .filter(c => c.style.boxShadow.indexOf('inset') !== -1)
      .map(b => { const s = b.querySelector('span');
        return (s === null ? '?' : s.textContent.trim()) + '@' +
          parseInt(b.style.left) + ',' + parseInt(b.style.top); }).sort();
  })()`;
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:8080/'});
  await pause(1800);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='New').click()`);
  await pause(400);
  const c = await evaluate(`(() => { const r=document.querySelector('[data-canvas]').getBoundingClientRect(); return {left:r.left, top:r.top}; })()`);
  const at = (x, y) => ({x: c.left + 1 + x, y: c.top + 1 + y});
  await drag(at(20, 20), at(220, 70));  await name('A');
  await drag(at(20, 90), at(220, 140)); await name('B');
  await drag(at(20, 160), at(220, 210)); await name('C');
  const before = await evaluate(LAY);
  console.log('   before: ' + before.join('  '));

  // carry C right up over A and B, then all the way back where it started
  const start = at(120, 185);
  await move(start.x, start.y, 'mousePressed');
  for(const y of [150, 110, 70, 40, 25]) {
    await move(start.x, c.top + 1 + y, 'mouseMoved');
    await pause(60);
  }
  const during = await evaluate(LAY);
  console.log('   over A: ' + during.join('  '));
  check('carrying it over the others moves them', during.join() !== before.join(), true);
  for(const y of [70, 110, 150, 185]) {
    await move(start.x, c.top + 1 + y, 'mouseMoved');
    await pause(80);
    console.log('   at y=' + y + ': ' + (await evaluate(LAY)).join('  '));
  }
  const back = await evaluate(LAY);
  console.log('   back:   ' + back.join('  '));
  check('carrying it back puts them all where they were', back, before);
  await move(start.x, start.y, 'mouseReleased');
  await pause(400);
  check('and dropping it there leaves the layout alone',
    await evaluate(LAY), before);
  console.log(failures === 0 ? '\nthe push is only a preview' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
