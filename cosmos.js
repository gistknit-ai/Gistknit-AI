/* GistKnit AI - universe: warp starfield + rotating 4D tesseract */
(()=>{
const c=document.createElement('canvas');c.id='cosmos';document.body.prepend(c);
const x=c.getContext('2d'),reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
let W,H,stars=[],mx=0,my=0,sx=0,sy=0,ha=1,seen=false;
try{seen=!!sessionStorage.getItem('gk_intro');sessionStorage.setItem('gk_intro','1')}catch(e){}
const skip=reduce||seen,t0=performance.now()-(skip?4000:0);
if(!skip){const d=document.createElement('div');d.className='intro';d.innerHTML='<b>GISTKNIT</b><span>Founded by Ved Prakash</span>';document.body.appendChild(d);setTimeout(()=>d.style.opacity=0,1700);setTimeout(()=>d.remove(),2700)}
function size(){const D=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;c.width=W*D;c.height=H*D;x.setTransform(D,0,0,D,0,0);
 stars=Array.from({length:Math.round(Math.min(260,W*H/5200))},()=>({x:Math.random()*2-1,y:Math.random()*2-1,z:Math.random()*.98+.02,k:Math.random()<.2}))}
addEventListener('resize',size);size();
addEventListener('pointermove',e=>{mx=e.clientX/W-.5;my=e.clientY/H-.5},{passive:true});
const V=[];for(let i=0;i<16;i++)V.push([i&1?1:-1,i&2?1:-1,i&4?1:-1,i&8?1:-1]);
const E=[];for(let i=0;i<16;i++)for(let b=0;b<4;b++){const j=i^(1<<b);if(j>i)E.push([i,j])}
function rot(p,a,b,t){const s=Math.sin(t),q=Math.cos(t),u=p[a],v=p[b];p[a]=u*q-v*s;p[b]=u*s+v*q}
const ease=t=>1-Math.pow(1-Math.max(0,Math.min(1,t)),3);
function frame(now){
 if(document.hidden){requestAnimationFrame(frame);return}
 const e=now-t0,warp=reduce?0:(e<1400?1:Math.max(0,1-(e-1400)/1300)),k=reduce?1:ease((e-1200)/1700);
 sx+=(mx-sx)*.05;sy+=(my-sy)*.05;
 ha+=((document.querySelector('.hero')?1:.16)-ha)*.06;
 x.clearRect(0,0,W,H);x.globalCompositeOperation='lighter';
 const sp=reduce?0:.0007+warp*.035,cx=W/2-sx*40,cy=H/2-sy*40;
 for(const s of stars){
  const pz=s.z+sp*3;s.z-=sp;if(s.z<=.02){s.z=1;s.x=Math.random()*2-1;s.y=Math.random()*2-1}
  const X=cx+s.x/s.z*W*.35,Y=cy+s.y/s.z*W*.35,al=(1-s.z)*(s.k?1:.7);
  x.strokeStyle=s.k?`rgba(143,233,242,${al})`:`rgba(190,180,255,${al})`;x.lineWidth=s.k?1.6:1;
  x.beginPath();x.moveTo(warp>.05?cx+s.x/pz*W*.35:X,warp>.05?cy+s.y/pz*W*.35:Y);x.lineTo(X+.01,Y);x.stroke()}
 if(k>0){
  const t=now/1000,R=Math.min(W,H)*(W<700?.2:.17)*k,ox=W/2-sx*22,oy=H*(W<700?.27:.3)-sy*22,P=V.map(v=>{
   const p=v.slice();rot(p,0,3,t*.55);rot(p,1,3,t*.37);rot(p,2,3,t*.29);rot(p,0,1,t*.21);
   const f=1/(2.6-p[3]),q=[p[0]*f,p[1]*f,p[2]*f],g=1/(3-q[2]*1.2);return[ox+q[0]*g*R*2.2,oy+q[1]*g*R*2.2,p[3]]});
  const gr=x.createRadialGradient(ox,oy,0,ox,oy,R*2.6);gr.addColorStop(0,`rgba(108,92,255,${.28*ha})`);gr.addColorStop(1,'rgba(108,92,255,0)');
  x.fillStyle=gr;x.fillRect(ox-R*3,oy-R*3,R*6,R*6);
  for(const [a,b] of E){const h=(P[a][2]+P[b][2])/2,col=h>0?'143,233,242':'168,140,255';
   x.strokeStyle=`rgba(${col},${.16*ha})`;x.lineWidth=5;x.beginPath();x.moveTo(P[a][0],P[a][1]);x.lineTo(P[b][0],P[b][1]);x.stroke();
   x.strokeStyle=`rgba(${col},${(.55+.3*h)*ha})`;x.lineWidth=1.2;x.stroke()}
  for(const p of P){x.fillStyle=`rgba(255,255,255,${.85*ha})`;x.beginPath();x.arc(p[0],p[1],2,0,6.3);x.fill()}
 }
 x.globalCompositeOperation='source-over';requestAnimationFrame(frame)}
requestAnimationFrame(frame);
})();
