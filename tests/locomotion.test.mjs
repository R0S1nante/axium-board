import test from 'node:test';
import assert from 'node:assert/strict';
import {NODES,route,makePath,samplePath,walkable,distance,advanceSpeed,OfficeMotion} from '../assets/office/locomotion.mjs';
import {deformVertex} from '../assets/office/avatar-rig.mjs';
test('all routes and passing lanes stay on the unobstructed floor',()=>{
  for(const a of Object.keys(NODES))for(const b of Object.keys(NODES))if(a!==b)for(const lane of [-.65,.65]){
    const path=makePath(route(a,b),lane);for(let d=0;d<path.length;d+=.3)assert.ok(walkable(samplePath(path,d)),a+' → '+b);
    assert.deepEqual(samplePath(path,path.length),{x:NODES[b][0],y:NODES[b][1]});
  }
});
test('walks accelerate gradually and slow down before arrival',()=>{
  const dt=1/60;let speed=0;for(let i=0;i<60;i++){const next=advanceSpeed(speed,20,4.3,dt);assert.ok(next-speed<=3.2*dt+.0001);speed=next;}
  assert.ok(speed<4.3);assert.ok(advanceSpeed(4,.03,4.3,.05)<4);
});
test('six-minute simulation finishes visits, stays finite and never teleports',()=>{
  let seed=42;const random=()=>((seed=seed*16807%2147483647)-1)/2147483646;
  const members=['dima','darya','ellina','maxim','robot'].map(id=>({id,x:NODES[id][0],y:NODES[id][1],robot:id==='robot'}));
  const previous=new Map();let activities=0;const engine=new OfficeMotion(members,a=>{
    assert.ok(Number.isFinite(a.x)&&Number.isFinite(a.y)&&Number.isFinite(a.yaw));assert.ok(walkable(a));
    if(previous.has(a.id))assert.ok(distance(a,previous.get(a.id))<.16,'discontinuous movement: '+a.id);
    previous.set(a.id,{x:a.x,y:a.y});
  },()=>activities++,random);
  engine.setRunning(true);for(let frame=0;frame<60*360;frame++)engine.frame(1/60);assert.ok(activities>40);
  engine.setRunning(false);const paused=engine.agents.map(a=>[a.x,a.y]);engine.frame(60);assert.deepEqual(engine.agents.map(a=>[a.x,a.y]),paused);
  previous.clear();engine.setRunning(true);engine.frame(60); // hidden-tab time is clamped, not replayed
  engine.agents.forEach((a,i)=>assert.ok(distance(a,{x:paused[i][0],y:paused[i][1]})<1.3));
});
test('limb deformation is continuous and reverses phase for alternate steps',()=>{
  const left={x:.435,y:.89},agent={phase:0,stride:1,yaw:Math.PI/2};const a=deformVertex(left,agent,0),b=deformVertex(left,{...agent,phase:Math.PI},0);
  assert.ok(Math.abs(a.x-b.x)>.02);
  const next=deformVertex(left,{...agent,phase:.001},0);assert.ok(Math.hypot(next.x-a.x,next.y-a.y)<.001);
  assert.ok(Number.isFinite(deformVertex({x:.5,y:.2},{...agent,stride:0},0).y));
});
