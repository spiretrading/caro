// Boxes sit where they are put and keep any gaps between them.
const path = require('path');

// A converted specification kept with the tests, since the folder the
// drawings are staged in is emptied once they have been converted.
const SPEC = path.resolve(__dirname, 'fees_detail_page.json');

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
  const evaluate=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails).slice(0,400));return r.result.value;};
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const move=(x,y,type,mod)=>send('Input.dispatchMouseEvent',{type,x:Math.round(x),y:Math.round(y),button:'left',buttons:1,clickCount:1,modifiers:mod||0});
  const drag=async(f,t)=>{await move(f.x,f.y,'mousePressed');
    for(let i=1;i<=10;i++){await move(f.x+(t.x-f.x)*i/10, f.y+(t.y-f.y)*i/10,'mouseMoved');await pause(28);}
    await move(t.x,t.y,'mouseReleased'); await pause(400);};
  const tap=async(p,mod)=>{await move(p.x,p.y,'mousePressed',mod);await move(p.x,p.y,'mouseReleased',mod);await pause(300);};
  const name=async t=>{await evaluate(`(() => { const f=document.querySelector('input[placeholder="Element:Name"]');
    const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    s.call(f, ${JSON.stringify(t)}); f.dispatchEvent(new Event('input',{bubbles:true})); })()`); await pause(300);};
  const BOXES = `(() => {
    const canvas = document.querySelector('[data-canvas]');
    return Array.from(canvas.children)
      .filter(c => c.style.boxShadow.indexOf('inset') !== -1)
      .map(b => { const s = b.querySelector('span');
        return {name: s === null ? '' : s.textContent.trim(),
          x: parseInt(b.style.left), y: parseInt(b.style.top),
          width: parseInt(b.style.width), height: parseInt(b.style.height)}; });
  })()`;
  const boxes = () => evaluate(BOXES);
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:8080/'});
  await pause(1800);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='New').click()`);
  await pause(400);
  const c = await evaluate(`(() => { const r=document.querySelector('[data-canvas]').getBoundingClientRect(); return {left:r.left, top:r.top}; })()`);
  const at = (x, y) => ({x: c.left + 1 + x, y: c.top + 1 + y});

  await drag(at(20, 10), at(220, 60));
  await name('A');
  check('a drawn box sits where it was drawn',
    await boxes(), [{name:'<A>', x:20, y:10, width:200, height:50}]);

  await drag(at(250, 120), at(400, 200));
  await name('B');
  let drawn = await boxes();
  check('a second box keeps the gap between them',
    drawn.map(b => b.name + '@' + b.x + ',' + b.y),
    ['<A>@20,10', '<B>@250,120']);

  // carry A onto B: nothing gets out of its way
  await drag(at(120, 35), at(300, 150));
  drawn = await boxes();
  console.log('   after the drop: ' + drawn.map(b =>
    b.name + ' ' + b.width + 'x' + b.height + '@' + b.x + ',' + b.y).join('  '));
  const a = drawn.find(b => b.name === '<A>');
  const b = drawn.find(b => b.name === '<B>');
  check('the carried box went where it was dropped',
    [a.x, a.y], [200, 125]);
  check('and the box it landed on stayed where it was',
    [b.x, b.y], [250, 120]);
  // a converted specification opens and draws where it was drawn
  const TEXT = fs.readFileSync(SPEC, 'utf8');
  await evaluate(`(() => {
    const TEXT = ${JSON.stringify(TEXT)};
    const handle = {name: 'layout.json',
      getFile: async () => ({text: async () => TEXT}),
      createWritable: async () => ({write: async () => {}, close: async () => {}})};
    window.showOpenFilePicker = async () => [handle];
  })()`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Open').click()`);
  await pause(900);
  drawn = await boxes();
  console.log('   opened section has ' + drawn.length + ' boxes');
  check('a converted specification opens', drawn.length > 0, true);
  const stacked = drawn.filter(box => box.x === 0 && box.y === 0).length;
  check('and its boxes are not all piled at the origin', stacked <= 1, true);
  console.log(failures === 0 ? '\nboxes move freely' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
