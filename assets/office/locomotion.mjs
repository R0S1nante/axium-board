// World coordinates are percentages of the room. Distances account for its aspect ratio.
export const ASPECT = 1678 / 936;
export const NODES = {
  dima:[38.5,51], darya:[65,51.5], ellina:[29.5,65], maxim:[79.8,84], robot:[53,76],
  nw:[38.5,60], ne:[65,60], west:[35,68], center:[53,65], east:[76,65],
  sw:[35,78], south:[62,80], coffee:[84,62], gear:[25,79], ideas:[52,72]
};
const EDGES = [['dima','nw'],['darya','ne'],['ellina','west'],['maxim','south'],['robot','ideas'],['nw','west'],['nw','center'],['ne','center'],['ne','east'],['west','center'],['west','sw'],['center','east'],['center','ideas'],['sw','gear'],['sw','ideas'],['ideas','south'],['south','east'],['east','coffee']];
export const distance = (a,b) => Math.hypot((a.x-b.x)*ASPECT,a.y-b.y);
const point = a => ({x:a[0],y:a[1]});
const lerp = (a,b,t) => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
export function route(from,to) {
  const costs=Object.fromEntries(Object.keys(NODES).map(k=>[k,Infinity])),previous={},pending=new Set(Object.keys(NODES));costs[from]=0;
  while(pending.size){const current=[...pending].sort((a,b)=>costs[a]-costs[b])[0];pending.delete(current);if(current===to)break;
    for(const [a,b]of EDGES){const next=a===current?b:b===current?a:null;if(!next||!pending.has(next))continue;const score=costs[current]+distance(point(NODES[current]),point(NODES[next]));if(score<costs[next]){costs[next]=score;previous[next]=current;}}
  }
  if(!Number.isFinite(costs[to]))throw Error('Unknown or disconnected destination');
  const result=[to];while(result[0]!==from)result.unshift(previous[result[0]]);return result;
}
export function makePath(nodes,lane=0) {
  const points=nodes.map((n,i)=>{const p=typeof n==='string'?point(NODES[n]):n;return {...p,y:p.y+(i>0&&i<nodes.length-1?lane:0)};});
  const samples=[{...points[0],d:0}];
  const add=p=>{const prev=samples.at(-1),d=distance(prev,p);if(d>.00001)samples.push({...p,d:prev.d+d});};
  for(let i=1;i<points.length;i++){
    const corner=points[i],next=points[i+1];
    if(!next){add(corner);continue;}
    const before=lerp(points[i-1],corner,.83),after=lerp(corner,next,.17);add(before);
    for(let j=1;j<=12;j++){const t=j/12;add(lerp(lerp(before,corner,t),lerp(corner,after,t),t));}
  }
  return {samples,length:samples.at(-1).d};
}
export function samplePath(path,travel) {
  const a=path.samples,d=Math.max(0,Math.min(path.length,travel));let lo=0,hi=a.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(a[mid].d<d)lo=mid;else hi=mid;}
  const t=(d-a[lo].d)/(a[hi].d-a[lo].d||1);return lerp(a[lo],a[hi],t);
}
export const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
export function advanceSpeed(current,remaining,cruise,dt,brake=1) {
  const target=Math.min(cruise,Math.sqrt(Math.max(0,2*5*remaining)))*brake;
  const acceleration=target>current?3.2:6;
  return current+Math.max(-acceleration*dt,Math.min(acceleration*dt,target-current));
}
export function walkable(p) {
  const polygon=[[34,48],[71,48],[71,55],[86,57],[86,65],[81,69],[81,89],[23,89],[23,73],[28,68],[28,63],[33,60]];
  let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [xi,yi]=polygon[i],[xj,yj]=polygon[j];if((yi>p.y)!==(yj>p.y)&&p.x<(xj-xi)*(p.y-yi)/(yj-yi)+xi)inside=!inside;
  }return inside;
}

export class OfficeMotion {
  constructor(members,onFrame,onActivity,random=Math.random){
    this.random=random;this.onFrame=onFrame;this.onActivity=onActivity;this.clock=0;this.running=false;
    this.agents=members.map((m,i)=>({...m,index:i,node:m.id,target:m.id,x:m.x,y:m.y,path:null,travel:0,speed:0,phase:i*1.7,stride:0,yaw:0,idleYaw:0,offset:{x:0,y:0},wait:.15+i*.85,cruise:m.robot?4.8:3.9+i*.25}));
  }
  setRunning(value){this.running=value;}
  frame(dt){
    // Discard background-tab time: resuming never jumps to a later point on the route.
    if(!this.running)return;dt=Math.max(0,Math.min(dt,.25));
    const steps=Math.max(1,Math.ceil(dt/.025)),step=dt/steps;
    for(let i=0;i<steps;i++){
      this.clock+=step;
      for(const a of this.agents){
        if(!a.path){a.wait-=step;if(a.wait<=0)this.depart(a);}
        if(a.path)this.move(a,step);
        else {a.stride+=(0-a.stride)*Math.min(1,step*7);a.yaw+=wrapAngle(a.idleYaw-a.yaw)*Math.min(1,step*2.5);}
      }
    }
    for(const a of this.agents)this.onFrame(a,this.clock);
  }
  depart(a){
    if(this.agents.filter(x=>x.path&&!x.robot).length>=2&&!a.robot){a.wait=2;return;}
    const destinations=a.node===a.id?['coffee','gear','ideas']:this.random()<.83?[a.id]:['coffee','gear',a.id];
    const available=destinations.filter(n=>n!==a.node&&!this.agents.some(b=>b!==a&&b.target===n));
    if(!available.length){a.wait=2;return;}
    const target=available[Math.floor(this.random()*available.length)];
    const nodes=route(a.node,target);a.path=makePath(nodes,a.index%2?.65:-.65);a.target=target;a.travel=0;a.speed=0;
    this.onActivity(a,target===a.id?'Возвращается к работе':target==='coffee'?'Идёт за кофе':target==='gear'?'Идёт к оборудованию':'Идёт обсудить идеи');
  }
  move(a,dt){
    const ahead=samplePath(a.path,Math.min(a.path.length,a.travel+1)),current=samplePath(a.path,a.travel);
    let brake=1,avoid={x:0,y:0};
    for(const b of this.agents){if(a===b)continue;const d=distance(a,b);if(d>7)continue;
      const tx=(ahead.x-current.x)*ASPECT,ty=ahead.y-current.y,rx=(b.x-a.x)*ASPECT,ry=b.y-a.y;
      const facing=(tx*rx+ty*ry)/(Math.hypot(tx,ty)*Math.hypot(rx,ry)||1);
      if(facing>.4&&d<5.4)brake=Math.min(brake,b.path&&a.index<b.index?.65:.18);
      if(d<5.5){const strength=(5.5-d)/5.5;avoid.x-=(b.x-a.x)/(d||1)*strength*1.8;avoid.y-=(b.y-a.y)/(d||1)*strength*1.8;}
    }
    const remaining=a.path.length-a.travel;
    a.speed=advanceSpeed(a.speed,remaining,a.cruise,dt,brake);
    const delta=Math.min(remaining,a.speed*dt);a.travel+=delta;
    const p=samplePath(a.path,a.travel),settle=Math.min(1,remaining/3);a.offset.x+=(avoid.x*settle-a.offset.x)*Math.min(1,dt*2.5);a.offset.y+=(avoid.y*settle-a.offset.y)*Math.min(1,dt*2.5);
    const nudged={x:p.x+a.offset.x*settle,y:p.y+a.offset.y*settle};const next=walkable(nudged)?nudged:p;
    a.x=next.x;a.y=next.y;
    const tangent=samplePath(a.path,Math.min(a.path.length,a.travel+.5));const heading=Math.atan2((tangent.x-p.x)*ASPECT,tangent.y-p.y);
    if(remaining>.2)a.yaw+=wrapAngle(heading-a.yaw)*Math.min(1,dt*5);
    a.phase+=delta*(a.robot?3.5:1.65);a.stride+=(Math.min(1,a.speed/2.5)-a.stride)*Math.min(1,dt*8);
    if(remaining<.025){
      a.x=NODES[a.target][0];a.y=NODES[a.target][1];a.node=a.target;a.path=null;a.speed=0;a.offset={x:0,y:0};
      a.wait=a.node===a.id?8+this.random()*18:6+this.random()*8;
      a.idleYaw=a.node==='coffee'?Math.PI/2:a.node==='gear'?-Math.PI/2:a.node===a.id?-.1+a.index*.055:0;
      this.onActivity(a,a.node===a.id?(a.robot?'Готов помочь':'За рабочим местом'):a.node==='coffee'?'Пауза на кофе':a.node==='gear'?'У оборудования':'Обсуждает идеи');
    }
  }
}
