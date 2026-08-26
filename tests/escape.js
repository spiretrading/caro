// Escape backs out of a drag, putting every box back where it stood.
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
  const escape=async()=>{
    for(const type of ['keyDown','keyUp']) {
      await send('Input.dispatchKeyEvent', {type, key: 'Escape',
        code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27});
    }
    await pause(300);
  };
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
  const drag = async (f, t) => {
    await move(f.x, f.y, 'mousePressed');
    for(let i = 1; i <= 8; i++) {
      await move(f.x + (t.x - f.x) * i / 8, f.y + (t.y - f.y) * i / 8,
        'mouseMoved');
      await pause(30);
    }
  };
  const tap = async p => {
    await move(p.x, p.y, 'mousePressed');
    await move(p.x, p.y, 'mouseReleased');
    await pause(250);
  };
  await drag(at(20, 20), at(220, 90));
  await move(at(220, 90).x, at(220, 90).y, 'mouseReleased');
  await pause(300);
  await tap(at(300, 300));
  await drag(at(20, 110), at(220, 180));
  await move(at(220, 180).x, at(220, 180).y, 'mouseReleased');
  await pause(300);
  await tap(at(300, 300));
  await drag(at(20, 200), at(220, 270));
  await move(at(220, 270).x, at(220, 270).y, 'mouseReleased');
  await pause(300);
  await tap(at(300, 300));
  const before = await evaluate(LAY);
  console.log('   before: ' + before.join(' | '));
  check('three boxes to begin with', before.length, 3);

  // Carry the top box down over the other two, so the layout reflows to
  // show the drop, then back out without letting go.
  await drag(at(120, 55), at(120, 235));
  const during = await evaluate(LAY);
  console.log('   during: ' + during.join(' | '));
  check('carrying it over the others moves them',
    during.join() !== before.join(), true);
  await escape();
  const backed = await evaluate(LAY);
  console.log('   escaped:' + backed.join(' | '));
  check('Escape puts every box back', backed, before);
  await move(at(120, 235).x, at(120, 235).y, 'mouseReleased');
  await pause(300);
  check('and letting go afterwards changes nothing',
    await evaluate(LAY), before);

  const banner = failures === 0 ? 'Escape backs out of a drag' :
    `${failures} FAILURES`;
  console.log('');
  console.log(banner);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
