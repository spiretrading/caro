// The outline lists a whole specification and reaches what the canvas
// cannot: a box too small to hit, or one in a section not on screen.
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
    for(let i=1;i<=8;i++){await move(f.x+(t.x-f.x)*i/8,f.y+(t.y-f.y)*i/8,'mouseMoved');await pause(28);}
    await move(t.x,t.y,'mouseReleased');await pause(320);};
  const tap=async p=>{await move(p.x,p.y,'mousePressed');await move(p.x,p.y,'mouseReleased');await pause(280);};
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:8080/'});
  await pause(1800);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='New').click()`);
  await pause(400);
  // Every row of the tree, indented by its depth.
  const rows = () => evaluate(`(() => {
    const panel = document.querySelector('[data-outline]');
    return Array.from(panel.querySelectorAll('div > button:nth-child(2)'))
      .map(b => {
        const pad = parseInt(b.parentElement.style.paddingLeft) / 12;
        return '..'.repeat(pad) + b.textContent.trim();
      });
  })()`);
  const clickRow = label => evaluate(`(() => {
    const panel = document.querySelector('[data-outline]');
    const row = Array.from(panel.querySelectorAll('div > button:nth-child(2)'))
      .find(b => b.textContent.trim() === ${JSON.stringify(label)});
    if(row === undefined) { return false; }
    row.click();
    return true;
  })()`);
  const clickNoted = note => evaluate(`(() => {
    const panel = document.querySelector('[data-outline]');
    const marks = Array.from(panel.querySelectorAll('div > span'));
    const mark = marks.find(
      s => s.textContent === ${JSON.stringify(note)});
    if(mark === undefined) { return false; }
    mark.parentElement.querySelector('button:nth-child(2)').click();
    return true;
  })()`);
  const twist = label => evaluate(`(() => {
    const panel = document.querySelector('[data-outline]');
    const row = Array.from(panel.querySelectorAll('div > button:nth-child(2)'))
      .find(b => b.textContent.trim() === ${JSON.stringify(label)});
    row.parentElement.firstChild.click();
    return true;
  })()`);
  const selected = () => evaluate(`(() => {
    const canvas = document.querySelector('[data-canvas]');
    return Array.from(canvas.children)
      .filter(c => c.style.boxShadow.indexOf('inset') !== -1)
      .filter(c => c.style.outline !== '')
      .map(c => parseInt(c.style.width) + 'x' + parseInt(c.style.height));
  })()`);
  const c = await evaluate(`(() => { const r=document.querySelector('[data-canvas]').getBoundingClientRect(); return {left:r.left, top:r.top}; })()`);
  const at = (x, y) => ({x: c.left + 1 + x, y: c.top + 1 + y});

  check('a new specification is one section', await rows(),
    ['Main', '..default']);
  check('the blank waiting to be drawn into is not a scenario to list',
    (await rows()).indexOf('..no condition'), -1);

  // Two boxes, the second drawn above the first.
  await drag(at(40, 120), at(240, 200));
  await tap(at(300, 300));
  await drag(at(40, 20), at(240, 100));
  await tap(at(300, 300));
  check('the boxes are listed in the order they are read, not drawn',
    await rows(),
    ['Main', '..default', '....space', '....space']);
  const places = await evaluate(`(() => {
    const panel = document.querySelector('[data-outline]');
    return Array.from(panel.querySelectorAll('div > button:nth-child(2)'))
      .map(b => b.title).filter(t => t.indexOf(' at ') !== -1);
  })()`);
  console.log('   titles: ' + JSON.stringify(places));
  check('the topmost box is listed first',
    places[0].indexOf('at 40, 20') !== -1, true);

  // A box too small to hit is still reachable from the tree.
  await tap(at(300, 300));
  await drag(at(300, 20), at(310, 30));
  await tap(at(400, 300));
  check('nothing is selected after pressing empty canvas',
    await selected(), []);
  check('the small box is in the tree',
    (await evaluate(`Array.from(document.querySelectorAll(
      '[data-outline] span')).map(s => s.textContent)`)).indexOf('10x10') !== -1,
    true);
  check('the small box can be clicked', await clickNoted('10x10'), true);
  await pause(300);
  check('and clicking it selects it', await selected(), ['10x10']);

  // The size carries the colours of the policies that decide it.
  const shades = await evaluate(`(() => {
    const panel = document.querySelector('[data-outline]');
    const mark = Array.from(panel.querySelectorAll('div > span'))
      .find(s => s.textContent === '200x80');
    return Array.from(mark.querySelectorAll('span'))
      .map(s => getComputedStyle(s).color);
  })()`);
  check('a box names its size in the colours of its policies', shades,
    ['rgb(178, 129, 0)', 'rgb(178, 129, 0)']);

  // A label opens or shuts everything under it, layers included.
  await evaluate(`Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.trim() === 'Add a layer').click()`);
  await pause(500);
  await clickRow('Main');
  await pause(400);
  check('clicking an open section shuts all of it', await rows(), ['Main']);
  await clickRow('Main');
  await pause(400);
  check('and clicking it again opens all of it, layers included',
    await rows(),
    ['Main', '..default', '....space', '....space', '....space',
      '....Layer 1']);
  await clickRow('Main');
  await pause(400);
  check('and again shuts it', await rows(), ['Main']);
  await clickRow('Main');
  await pause(400);

  // Sections, and reaching a box in one that is not on screen.
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.title==='Add a section').click()`);
  await pause(500);
  const named = () => evaluate(
    `document.querySelector('input[placeholder="Section:Name"]').value`);
  check('a second section is added and edited', await named(), 'Section1');
  check('both sections are listed',
    (await rows()).filter(row => row.indexOf('..') === -1),
    ['Main', 'Section1']);
  await clickRow('Main');
  await pause(500);
  check('clicking a section switches to it', await named(), 'Main');
  await twist('Main');
  await pause(200);
  check('and its twisty folds it away',
    (await rows()).filter(row => row.indexOf('..') === -1),
    ['Main', 'Section1']);
  check('with nothing left under it', await rows(),
    ['Main', 'Section1', '..default']);

  const banner = failures === 0 ? 'the outline reaches what the canvas cannot'
    : `${failures} FAILURES`;
  console.log('');
  console.log(banner);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
