// Portable 2.5D sprite skinning. Canvas 2D works without a GPU/WebGL context.
const TAU=Math.PI*2;
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const rotate=(p,o,angle)=>{const c=Math.cos(angle),s=Math.sin(angle),x=p.x-o.x,y=p.y-o.y;return {x:o.x+c*x-s*y,y:o.y+s*x+c*y};};
export function deformVertex(source,agent,time,robot=false){
  const stride=agent.stride*(robot?.1:1),phase=agent.phase,yaw=agent.yaw;
  // During stance the foot cancels the root's travel; larger figures use a shorter UV step.
  const footAmplitude=(TAU/1.65)*.62/(2*(agent.size||15.5)*(1678/936));
  let p={...source};
  if(!robot&&source.y>.515){
    const leg=(side,phase)=>{
      const cycle=((phase/TAU)%1+1)%1,stance=clamp(cycle/.62),swing=clamp((cycle-.62)/.38);
      const forward=cycle<.62?1-2*stance:-1+2*smooth(0,1,swing),lift=Math.sin(swing*Math.PI)*.025;
      const hip={x:side<0?.455:.555,y:.54},ankle={x:side<0?.435:.57,y:.875};
      const target={x:ankle.x+Math.sin(yaw)*forward*footAmplitude*stride,y:ankle.y+(Math.cos(yaw)*forward*footAmplitude-lift)*stride};
      const knee={x:side<0?.448:.56,y:.725},mid={x:(hip.x+target.x)/2,y:(hip.y+target.y)/2},bend=Math.sin(swing*Math.PI)*.016*stride;
      const deltaKnee={x:(mid.x-knee.x)*.35*stride+side*bend,y:(mid.y-knee.y)*.35*stride-bend*.35};
      const upper=smooth(.535,.725,source.y),lower=smooth(.725,.878,source.y);
      return {x:source.x+deltaKnee.x*upper*(1-lower)+(target.x-ankle.x)*lower,y:source.y+deltaKnee.y*upper*(1-lower)+(target.y-ankle.y)*lower};
    };
    const left=leg(-1,phase),right=leg(1,phase+Math.PI),blend=smooth(.486,.516,source.x),weight=smooth(.515,.56,source.y);
    p.x+=(left.x+(right.x-left.x)*blend-source.x)*weight;p.y+=(left.y+(right.y-left.y)*blend-source.y)*weight;
  }
  const armHeight=smooth(.29,.35,source.y)*(1-smooth(.60,.65,source.y));
  const leftWeight=(1-smooth(.365,.426,source.x))*armHeight,rightWeight=smooth(.581,.64,source.x)*armHeight;
  const armSwing=(-leftWeight+rightWeight)*Math.sin(phase)*stride*smooth(.32,.61,source.y);
  p.x+=Math.sin(yaw)*armSwing*.018;
  p.y+=Math.cos(yaw)*armSwing*.016-Math.abs(armSwing)*.003;
  const body=1-smooth(.53,.89,source.y),rise=(.5+.5*Math.cos(phase*2))*.006*agent.stride,breath=Math.sin(time*1.65)*.0013*(1-agent.stride);
  p.y-=body*(rise+breath);p.x+=Math.sin(phase)*.0035*body*stride;
  p=rotate(p,{x:.5,y:.88},Math.sin(yaw)*.012*agent.stride);
  // Direction changes the stride, never the character's body width.
  p.x+=Math.sin(yaw)*.004*(1-smooth(.28,.50,source.y));return p;
}
export class AvatarRig{
  constructor(container,frontSrc,backSrc,robot=false){
    this.canvas=document.createElement('canvas');this.canvas.className='avatar-art';this.canvas.width=448;this.canvas.height=448;this.canvas.setAttribute('aria-hidden','true');container.append(this.canvas);
    this.ctx=this.canvas.getContext('2d',{alpha:true});this.robot=robot;this.lastTime=-1;container.dataset.renderer='canvas2d';
    const cols=12,rows=28;this.points=[];this.cells=[];
    for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++)this.points.push({x:.22+.56*x/cols,y:.05+.90*y/rows});
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x,b=a+cols+1;this.cells.push({indices:[a,b,a+1,a+1,b,b+1]});}
    this.gridCells=[...this.cells];
    this.front=new Image();this.front.onload=()=>{this.alignRear();this.findCoverage();this.draw({phase:0,stride:0,yaw:0},0,true);};this.front.src=frontSrc;
    if(backSrc){this.back=new Image();this.back.onload=()=>{this.alignRear();this.findCoverage();};this.back.src=backSrc;}
  }
  alignRear(){
    if(!this.front?.naturalWidth||!this.back?.naturalWidth)return;
    const bounds=image=>{const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const {data,width,height}=ctx.getImageData(0,0,c.width,c.height);let x0=width,y0=height,x1=0,y1=0;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>24){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return {x0,y0,x1,y1};};
    try{const f=bounds(this.front),b=bounds(this.back),c=document.createElement('canvas');c.width=this.front.naturalWidth;c.height=this.front.naturalHeight;
      c.getContext('2d').drawImage(this.back,b.x0,b.y0,b.x1-b.x0+1,b.y1-b.y0+1,f.x0,f.y0,f.x1-f.x0+1,f.y1-f.y0+1);this.rearTexture=c;
    }catch{this.rearTexture=this.back;}
  }
  findCoverage(){
    if(!this.front?.naturalWidth)return;
    const temp=document.createElement('canvas');temp.width=this.front.naturalWidth;temp.height=this.front.naturalHeight;const ctx=temp.getContext('2d');ctx.drawImage(this.front,0,0);if(this.rearTexture)ctx.drawImage(this.rearTexture,0,0);
    try{
      const {data,width,height}=ctx.getImageData(0,0,temp.width,temp.height);
      this.cells=this.gridCells.filter(cell=>{const a=this.points[cell.indices[0]],b=this.points[cell.indices[5]];
        const x0=Math.max(0,Math.floor(a.x*width)-2),x1=Math.min(width,Math.ceil(b.x*width)+2),y0=Math.max(0,Math.floor(a.y*height)-2),y1=Math.min(height,Math.ceil(b.y*height)+2);
        for(let y=y0;y<y1;y+=2)for(let x=x0;x<x1;x+=2)if(data[(y*width+x)*4+3]>2)return true;return false;});
    }catch{/* Drawing remains available when canvas pixel reads are restricted. */}
  }
  draw(agent,time,force=false){
    if(!this.front.complete||!this.front.naturalWidth)return;
    if(!force&&time-this.lastTime<(agent.stride>.1?1/60:1/24))return;this.lastTime=time;
    const ctx=this.ctx,w=this.canvas.width;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,w);
    const image=!this.robot&&Math.cos(agent.yaw)<-.1&&this.rearTexture?this.rearTexture:this.front;
    if(agent.stride<.025||this.robot){
      ctx.translate(w*.5,w*.88);ctx.rotate(Math.sin(agent.phase)*agent.stride*(this.robot?.018:.004));
      ctx.translate(-w*.5,-w*.88-Math.sin(time*1.65)*.0013*w-Math.abs(Math.sin(agent.phase))*agent.stride*.004*w);
      ctx.drawImage(image,0,0,w,w);return;
    }
    const posed=this.points.map(p=>{const v=deformVertex(p,agent,time,this.robot);return {x:v.x*w,y:v.y*w};});
    const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
    for(const cell of this.cells)for(let k=0;k<6;k+=3){
      const ids=cell.indices.slice(k,k+3),s=ids.map(i=>({x:this.points[i].x*iw,y:this.points[i].y*ih})),d=ids.map(i=>posed[i]);this.triangle(ctx,image,s,d);
    }
  }
  triangle(ctx,image,s,d){
    const x1=s[1].x-s[0].x,y1=s[1].y-s[0].y,x2=s[2].x-s[0].x,y2=s[2].y-s[0].y,det=x1*y2-x2*y1;
    if(Math.abs(det)<.00001)return;
    const a=((d[1].x-d[0].x)*y2-(d[2].x-d[0].x)*y1)/det,b=((d[1].y-d[0].y)*y2-(d[2].y-d[0].y)*y1)/det;
    const c=((d[2].x-d[0].x)*x1-(d[1].x-d[0].x)*x2)/det,e=((d[2].y-d[0].y)*x1-(d[1].y-d[0].y)*x2)/det;
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.beginPath();
    const center={x:(d[0].x+d[1].x+d[2].x)/3,y:(d[0].y+d[1].y+d[2].y)/3};
    d.forEach((p,i)=>{const dx=p.x-center.x,dy=p.y-center.y,len=Math.hypot(dx,dy)||1;ctx[i?'lineTo':'moveTo'](p.x+dx/len*.45,p.y+dy/len*.45);});ctx.closePath();ctx.clip();
    ctx.setTransform(a,b,c,e,d[0].x-a*s[0].x-c*s[0].y,d[0].y-b*s[0].x-e*s[0].y);ctx.drawImage(image,0,0);ctx.restore();
  }
}

