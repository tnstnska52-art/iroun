const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {observe}=require('./manifest-observer.cjs');
test('only allowlisted metadata; no URL, token, cookie, user agent or body',()=>{
  const rows=[],res=new EventEmitter();
  res.statusCode=502;res.getHeader=()=> 'text/html';res.writableFinished=true;
  observe({url:'/?secret=DO_NOT_LOG',headers:{'expo-platform':'ios',accept:'application/json',authorization:'DO_NOT_LOG',cookie:'DO_NOT_LOG','user-agent':'DO_NOT_LOG'}},res,x=>rows.push(x));
  res.emit('finish');res.emit('close');
  assert.equal(rows.length,2);assert.equal(rows[1].type,'html');assert.equal(rows[1].status,502);
  assert.ok(!JSON.stringify(rows).includes('DO_NOT_LOG'));
});
test('asset response classification and logger failure are nonfatal',()=>{
  const res=new EventEmitter();res.getHeader=()=> 'application/json';
  const rows=[];
  observe({url:'/entry.bundle?secret=DO_NOT_LOG',headers:{}},res,x=>rows.push(x));
  res.emit('finish');
  assert.equal(rows[0].routeClass,'asset');assert.ok(!JSON.stringify(rows).includes('DO_NOT_LOG'));
  observe({url:'/',headers:{}},res,()=>{throw Error('disk full');});
  assert.doesNotThrow(()=>res.emit('finish'));
});
test('unknown paths are categorized without storing their content',()=>{
  const rows=[],res=new EventEmitter();res.statusCode=404;res.getHeader=()=> 'text/html';
  observe({url:'/DO_NOT_LOG?cookie=DO_NOT_LOG',headers:{}},res,x=>rows.push(x));res.emit('close');
  assert.equal(rows[0].routeClass,'other');assert.equal(rows[1].event,'closed');
  assert.equal(rows[0].request,rows[1].request);
  assert.ok(!JSON.stringify(rows).includes('DO_NOT_LOG'));
});
