/* GistKnit AI v1.0 - professional chat. Founded by Ved Prakash. */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const store={
  get(k,d){try{const v=localStorage.getItem('gk_'+k);return v?JSON.parse(v):d}catch(e){return d}},
  set(k,v){try{localStorage.setItem('gk_'+k,JSON.stringify(v))}catch(e){}}
};
const API=(window.GK_API||'').replace(/\/$/,'');
const S={
  user:store.get('user',null),
  convs:store.get('history',[]).map(h=>h.msgs?h:{id:h.id,title:h.q,t:h.t,msgs:[{role:'u',text:h.q},{role:'a',text:h.a,src:h.src||[],done:true}]}),
  docs:store.get('docs',[]),
  prefs:Object.assign({style:'Short',theme:'system',model:'auto'},store.get('prefs',{})),
  thread:[],cur:null,tool:'',busy:false,signup:false,upMsg:'',loaded:false,pend:[],menu:false
};
S.cid=store.get('cid',null);
if(!S.cid){S.cid=(self.crypto&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2)).replace(/-/g,'');store.set('cid',S.cid)}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const safeUrl=u=>/^https?:\/\//i.test(u||'');

/* icons */
const P={
 plus:'<path d="M12 5v14M5 12h14"/>',send:'<path d="M12 19V5M5 12l7-7 7 7"/>',menu:'<path d="M4 7h16M4 12h16M4 17h10"/>',
 compose:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
 layers:'<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
 file:'<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',code:'<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
 clip:'<path d="M20 11l-8 8a5 5 0 01-7-7l8-8a3.5 3.5 0 015 5l-8 8a2 2 0 01-3-3l7-7"/>',
 check:'<path d="M5 12l5 5 9-10"/>',trash:'<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
 lib:'<path d="M5 4h4v16H5zM11 4h4v16h-4zM17 6l3 .8-3.6 13.2-3-.8z"/>',
 gear:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
 close:'<path d="M6 6l12 12M18 6L6 18"/>',copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
 learn:'<path d="M12 3a6 6 0 00-3.5 10.9V17h7v-3.1A6 6 0 0012 3z"/><path d="M9.5 20.5h5"/>'
};
const ic=(n,s=20)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;
const logo=s=>`<svg width="${s}" height="${s}" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#2F6B5B"/><path d="M8 9l8 14 8-14M8 23l8-14 8 14" stroke="#F0C94A" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;

const TOOLS={
 web:{label:'Web search',icon:'globe',desc:'Find fresh info with sources',ph:'Search the web'},
 deep:{label:'Deep research',icon:'layers',desc:'Reads more pages for a fuller answer',ph:'What should I research?'},
 docs:{label:'My documents',icon:'file',desc:'Ask questions about your PDFs',ph:'Ask about your documents'},
 code:{label:'Coding',icon:'code',desc:'Write, explain and fix code',ph:'Describe what to build or fix'}
};

/* theme */
function applyTheme(){
  const p=S.prefs.theme||'system';
  const dark=p==='dark'||(p==='system'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme=dark?'dark':'light';
  const mt=document.querySelector('meta[name=theme-color]');if(mt)mt.content=dark?'#0F1412':'#F7F7F5';
}
if(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').addEventListener)matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);

/* network */
async function api(path,opts={}){
  opts.headers=Object.assign({'X-Client-Id':S.cid},opts.headers||{});
  let r;
  try{r=await fetch(API+path,opts)}catch(e){throw new Error('Cannot reach the server. If it was idle, wait 1 minute and try again.')}
  let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error((j&&j.detail)||'Server error '+r.status);
  return j;
}
async function streamAsk(payload,onEvent){
  let r;
  try{r=await fetch(API+'/ask',{method:'POST',headers:{'Content-Type':'application/json','X-Client-Id':S.cid},body:JSON.stringify(payload)})}
  catch(e){throw new Error('Cannot reach the server. If it was idle, wait 1 minute and try again.')}
  if(!r.ok){let j=null;try{j=await r.json()}catch(e){}throw new Error((j&&j.detail)||'Server error '+r.status)}
  const feed=line=>{line=line.trim();if(!line)return;let o=null;try{o=JSON.parse(line)}catch(e){}if(o)onEvent(o)};
  if(!r.body||!r.body.getReader){(await r.text()).split('\n').forEach(feed);return}
  const reader=r.body.getReader(),dec=new TextDecoder();let buf='';
  for(;;){
    const {done,value}=await reader.read();if(done)break;
    buf+=dec.decode(value,{stream:true});
    let i;while((i=buf.indexOf('\n'))>=0){feed(buf.slice(0,i));buf=buf.slice(i+1)}
  }
  feed(buf);
}
function readImage(file){
  return new Promise((res,rej)=>{
    const bad=()=>rej(new Error('Could not read this photo.'));
    const fr=new FileReader();fr.onerror=bad;
    fr.onload=()=>{const im=new Image();im.onerror=bad;im.onload=()=>{
      const k=Math.min(1,1024/Math.max(im.width,im.height)),w=Math.round(im.width*k),h=Math.round(im.height*k);
      const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(im,0,0,w,h);
      res(c.toDataURL('image/jpeg',0.82))};im.src=fr.result};
    fr.readAsDataURL(file);
  });
}
async function loadDocs(){
  if(!API)return;
  try{S.docs=await api('/docs-list');S.loaded=true}catch(e){S.upMsg=e.message}
  if(route()==='library')render();
}
async function uploadFiles(files){
  if(!API){files.forEach(f=>S.docs.unshift({name:f.name,size:f.size,t:new Date().toISOString()}));store.set('docs',S.docs);S.upMsg='Added (demo mode, not read).';return}
  S.upMsg='Uploading...';paintUp();
  const done=[];
  for(const f of files){
    const fd=new FormData();fd.append('file',f);
    try{await api('/upload',{method:'POST',body:fd});done.push(f.name)}catch(err){S.upMsg=f.name+': '+err.message;paintUp();await sleep(50)}
  }
  await loadDocs();
  if(done.length)S.upMsg='Added: '+done.join(', ')+'. You can ask about it now.';
  paintUp();
}

/* routing + shell */
function route(){const r=location.hash.replace('#','')||'chat';return r==='home'||r==='history'?'chat':r}
function go(r){location.hash=r}
function openSide(o){const s=$('#side'),c=$('#scrim');if(s)s.classList.toggle('open',o);if(c)c.classList.toggle('on',o)}
function initials(){const n=S.user?(S.user.name||S.user.email):'Guest';return n.trim().charAt(0).toUpperCase()||'G'}

function paintShell(){
  const r=route();
  $('#closeBtn').innerHTML=ic('close');$('#menuBtn').innerHTML=ic('menu',22);$('#composeBtn').innerHTML=ic('compose',22);
  $('#newBtn').innerHTML=ic('plus',18)+'<span>New chat</span>';
  $('#sideNav').innerHTML=`<a href="#library" class="${r==='library'?'on':''}">${ic('lib')}Library</a><a href="#upgrade" class="${r==='upgrade'?'on':''}">${ic('learn')}Upgrade plan <span class="nav-free">FREE</span></a><a href="#settings" class="${r==='settings'?'on':''}">${ic('gear')}Settings</a>`;
  const nm=S.user?(S.user.name||S.user.email.split('@')[0]):'Guest';
  $('#acct').innerHTML=`<span class="av">${esc(initials())}</span><span><b>${esc(nm)}</b><small>${S.user?'Signed in':'Log in or sign up'}</small></span>`;
  $('#acct').href=S.user?'#settings':'#login';
  paintSide();
}
function paintSide(){
  const el=$('#sideList');if(!el)return;
  el.innerHTML=S.convs.length?`<h4>Recent</h4>${S.convs.map((c,i)=>`<div class="conv ${S.cur&&S.cur.id===c.id?'on':''}"><button class="t" data-act="openh" data-i="${i}" title="${esc(c.title)}">${esc(c.title)}</button><button class="d" data-act="delh" data-i="${i}" aria-label="Delete chat">${ic('trash',16)}</button></div>`).join('')}`
    :'<h4>Recent</h4><p class="none">No chats yet. Start a conversation.</p>';
}
function render(){
  const r=route();
  paintShell();
  const v=({chat:vChat,library:vLibrary,settings:vSettings,login:vLogin,upgrade:vUpgrade})[r]||vChat;
  $('#view').innerHTML=v();
  if(r==='chat'){paintMsgs();paintUp();paintPend();paintTool();window.scrollTo(0,document.body.scrollHeight)}
  else window.scrollTo(0,0);
  if(r==='library'&&API&&!S.loaded)loadDocs();
}

/* chat view */
function vChat(){
  return `<div id="msgs" aria-live="polite"></div>
  <div class="dock">
    <div id="toolchip"></div>
    <div class="upstat" id="upstat"></div>
    <div class="pend" id="pend"></div>
    <div style="position:relative">
      <div class="menu" id="menu" hidden></div>
      <form class="composer" id="askform">
        <button type="button" class="round plus" id="plusBtn" data-act="menu" aria-haspopup="true" aria-expanded="false" aria-label="Tools and attachments">${ic('plus',22)}</button>
        <textarea id="ask" rows="1" placeholder="Message GistKnit AI" aria-label="Message"></textarea>
        <button class="round send" id="send" type="submit" aria-label="Send" ${S.busy?'disabled':''}>${ic('send',20)}</button>
      </form>
    </div>
    <input type="file" id="attach" class="attach-in" multiple accept=".pdf,.txt,image/*">
    <p class="fine">GistKnit AI can make mistakes. Check important info.</p>
  </div>`;
}
function menuHtml(){
  const item=(k)=>{const t=TOOLS[k];return `<button type="button" class="mi" role="menuitemcheckbox" aria-checked="${S.tool===k}" data-act="tool" data-k="${k}"><span class="ico">${ic(t.icon)}</span><span class="t">${t.label}<small>${t.desc}</small></span>${S.tool===k?`<span class="ck">${ic('check',18)}</span>`:''}</button>`};
  return `<button type="button" class="mi" role="menuitem" data-act="attach"><span class="ico">${ic('clip')}</span><span class="t">Add photos or files<small>Photo, PDF or text file</small></span></button><hr>${['web','deep','docs','code'].map(item).join('')}`;
}
function toggleMenu(open){
  S.menu=open===undefined?!S.menu:open;
  const m=$('#menu'),b=$('#plusBtn');if(!m)return;
  m.hidden=!S.menu;if(S.menu)m.innerHTML=menuHtml();
  if(b)b.setAttribute('aria-expanded',String(S.menu));
}
function paintTool(){
  const c=$('#toolchip'),a=$('#ask');
  if(c)c.innerHTML=S.tool?`<button type="button" class="toolchip" data-act="cleartool" aria-label="Remove ${TOOLS[S.tool].label}">${ic(TOOLS[S.tool].icon,16)}${TOOLS[S.tool].label}${ic('close',14)}</button>`:'';
  if(a)a.placeholder=S.tool?TOOLS[S.tool].ph:'Message GistKnit AI';
}
function paintUp(){const e=$('#upstat');if(e)e.textContent=S.upMsg||''}
function paintPend(){
  const e=$('#pend');if(!e)return;
  e.innerHTML=S.pend.map((u,i)=>`<div><img src="${u}" alt="Photo ${i+1}"><button type="button" data-act="rmpend" data-i="${i}" aria-label="Remove photo">&times;</button></div>`).join('');
}

/* markdown */
const inl=s=>s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>').replace(/`([^`]+)`/g,'<code>$1</code>');
function mdText(t){
  let html='',list=null;const close=()=>{if(list){html+='</'+list+'>';list=null}};
  for(const raw of t.split('\n')){
    const l=raw.trimEnd();let m;
    if(m=l.match(/^\s*[-*\u2022]\s+(.*)/)){if(list!=='ul'){close();html+='<ul>';list='ul'}html+='<li>'+inl(m[1])+'</li>'}
    else if(m=l.match(/^\s*\d+[.)]\s+(.*)/)){if(list!=='ol'){close();html+='<ol>';list='ol'}html+='<li>'+inl(m[1])+'</li>'}
    else if(m=l.match(/^#{1,4}\s+(.*)/)){close();html+='<h3>'+inl(m[1])+'</h3>'}
    else if(!l.trim()){close()}
    else{close();html+='<p>'+inl(l)+'</p>'}
  }
  close();return html;
}
function md(t,knot){
  const parts=t.split(/```/);let out='';
  parts.forEach((p,i)=>{
    if(i%2===0){let h=mdText(p);if(knot)h=h.replace(/\[(\d)\]/g,(a,n)=>knot(n));out+=h}
    else{const nl=p.indexOf('\n');const lang=nl>=0?p.slice(0,nl).trim().replace(/[^\w+#.-]/g,''):'';const code=nl>=0?p.slice(nl+1):p;
      out+=`<div class="code"><div class="codebar"><span>${lang||'code'}</span><button type="button" data-act="copycode">Copy</button></div><pre><code>${code.replace(/\n$/,'')}</code></pre></div>`}
  });
  return out;
}
const META={web:q=>`Searched the web for: ${q}`,docs:()=>'Searched your documents'};

/* messages */
let paintQ=false;
function schedulePaint(){if(paintQ)return;paintQ=true;requestAnimationFrame(()=>{paintQ=false;paintMsgs()})}
const CARDS=[
 ['globe','Latest news on solar battery storage','web'],
 ['code','Write a Python script to rename files','code'],
 ['learn','Explain RAG like I am 10',''],
 ['file','Summarise my uploaded PDF','docs']
];
function paintMsgs(){
  const box=$('#msgs');if(!box)return;
  const near=innerHeight+scrollY>=document.body.scrollHeight-180;
  if(!S.thread.length){
    const nm=S.user&&S.user.name?', '+esc(S.user.name):'';
    box.innerHTML=`<div class="hero"><span class="mark">${logo(52)}</span><h1>Hello${nm}, how can I help?</h1>
    <p class="lead">Ask anything, research with sources, write code, or chat in Hindi, Hinglish or English.</p>
    <div class="cards">${CARDS.map(([i,t,k])=>`<button class="card-btn" data-act="card" data-t="${esc(t)}" data-k="${k}"><span class="ico">${ic(i,18)}</span><b>${esc(t)}</b></button>`).join('')}</div>
    <p class="by">GistKnit AI &middot; Founded by Ved Prakash</p></div>`;
    return;
  }
  box.innerHTML=S.thread.map((m,i)=>{
    if(m.role==='u')return `<div class="msg u">${m.imgs&&m.imgs.length?`<div class="imgs">${m.imgs.map(u=>`<img src="${u}" alt="Your photo">`).join('')}</div>`:''}${esc(m.text)}</div>`;
    const live=!m.done;
    const status=live&&m.status?`<p class="status">${esc(m.status)}</p>`:'';
    const hasSrc=m.done&&!m.err&&m.src&&m.src.length;
    const meta=hasSrc&&m.meta&&META[m.meta.route]?`<p class="meta">${esc(META[m.meta.route](m.meta.query))}</p>`:'';
    const knot=n=>hasSrc?`<button class="knot" data-act="knot" data-i="${i}" data-n="${n}" aria-label="Source ${n}">${n}</button>`:'';
    let t=esc(m.text).replace(/\[(\d(?:\s*,\s*\d)+)\]/g,(a,g)=>g.split(/\s*,\s*/).map(n=>`[${n}]`).join(''));
    let body=m.text?md(t,knot):'';
    if(live)body=m.text?body+'<span class="caret"></span>':'<span class="dots" aria-label="GistKnit is typing"><i></i><i></i><i></i></span>';
    const srcs=hasSrc?`<details class="srcbox" id="srcs${i}"><summary>${m.src.slice(0,3).map((s,k)=>`<span class="pill">${k+1} ${esc((s.s||s.t).slice(0,22))}</span>`).join('')}<span>${m.src.length} source${m.src.length>1?'s':''}</span></summary><ol class="srcs">${m.src.map((s,k)=>`<li data-n="${k+1}"><b>${k+1}. ${safeUrl(s.url)?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.t)}</a>`:esc(s.t)}</b><span>${esc(s.s)}</span>${s.q?`<em class="snip">${esc(s.q)}</em>`:''}</li>`).join('')}</ol></details>`:'';
    const acts=m.done&&!m.err?`<div class="actions"><button data-act="copy" data-i="${i}">${ic('copy',15)}Copy</button></div>`:'';
    return `<div class="msg a ${m.err?'err':''}"><span class="av">${logo(28)}</span><div class="ai-body">${status}${meta}<div>${body}</div>${srcs}${acts}</div></div>`;
  }).join('')+nudgeHtml();
  if(near)window.scrollTo(0,document.body.scrollHeight);
}
function nudgeHtml(){
  if(S.user||S.nudgeOff||S.busy)return '';
  if(S.thread.filter(m=>m.role==='u').length<3)return '';
  return `<div class="nudge"><div><b>Save your chats and keep going</b><p>Create a free account to keep your history and get more from GistKnit AI.</p></div><div class="nudge-act"><a class="btn" href="#login">Sign up or log in</a><button type="button" class="btn ghost" data-act="nudgeoff">Not now</button></div></div>`;
}
function setBusy(b){S.busy=b;const s=$('#send');if(s)s.disabled=b}

async function ask(q,toolOverride){
  q=q.trim();
  const imgs=S.pend.slice();
  if(toolOverride!==undefined){S.tool=toolOverride;paintTool()}
  if(S.busy||(!q&&!imgs.length))return;
  if(S.tool==='docs'&&!S.docs.length&&!imgs.length){S.upMsg='Add a document first: tap + and choose Add photos or files.';paintUp();return}
  if(!q)q='What is in this photo?';
  setBusy(true);S.pend=[];paintPend();S.upMsg='';paintUp();
  const hist=S.thread.filter(m=>m.role==='u'||(m.done&&!m.err)).slice(-6).map(m=>({role:m.role==='u'?'user':'assistant',content:m.text}));
  const m={role:'a',text:'',src:[],done:false,status:'Thinking',meta:null};
  S.thread.push({role:'u',text:q,imgs},m);
  paintMsgs();window.scrollTo(0,document.body.scrollHeight);
  const fail=msg=>{m.text=msg;m.err=true;m.src=[];m.done=true;setBusy(false);paintMsgs()};
  const t=S.tool;
  try{
    if(API){
      let errText=null;
      await streamAsk({question:q,mode:t==='deep'?'research':'chat',style:S.prefs.style,source:(t==='web'||t==='deep')?'web':(t==='docs'?'docs':'auto'),code:t==='code',model:S.prefs.model||'auto',history:hist,images:imgs},ev=>{
        if(ev.type==='status')m.status=ev.text;
        else if(ev.type==='meta'){m.src=ev.src||[];m.meta={route:ev.route,query:ev.query}}
        else if(ev.type==='delta'){m.text+=ev.text}
        else if(ev.type==='error')errText=ev.text;
        schedulePaint();
      });
      if(errText&&!m.text){fail(errText);return}
      if(errText)m.text+='\n\n(The answer stopped early: '+errText+')';
      if(!m.text){fail('No answer came back. Please try again.');return}
    }else{
      await sleep(700);
      const words='Namaste! This is a demo reply because the server is not connected yet. Once it is, I will answer like this, one word at a time.'.split(' ');
      for(let i=0;i<words.length;i++){m.text+=(i?' ':'')+words[i];schedulePaint();await sleep(60)}
    }
  }catch(e){fail(e.message);return}
  m.done=true;m.status=null;setBusy(false);paintMsgs();
  saveConv();
}
function saveConv(){
  const msgs=S.thread.filter(x=>x.done&&!x.err||x.role==='u').map(x=>x.role==='u'?{role:'u',text:x.text+(x.imgs&&x.imgs.length?' [photo]':'')}:{role:'a',text:x.text,src:x.src,meta:x.meta,done:true});
  if(!S.cur){S.cur={id:Date.now(),title:msgs[0].text.slice(0,60)}}
  const c={id:S.cur.id,title:S.cur.title,t:new Date().toISOString(),msgs};
  S.convs=[c,...S.convs.filter(x=>x.id!==c.id)].slice(0,30);
  store.set('history',S.convs);paintSide();
}
function newChat(){if(S.busy)return;S.thread=[];S.cur=null;S.tool='';openSide(false);if(route()==='chat')render();else go('chat')}

/* pages */
function vLibrary(){
  const list=S.docs.length?`<ul class="list">${S.docs.map((d,i)=>`<li><div class="main"><b>${esc(d.name)}</b><small>${(d.size/1024).toFixed(0)} KB${d.pages?', '+d.pages+' page'+(d.pages>1?'s':''):''}, added ${new Date(d.t).toLocaleDateString()}</small></div><button class="x" data-act="deldoc" data-i="${i}" aria-label="Remove ${esc(d.name)}">Remove</button></li>`).join('')}</ul>`
    :'<div class="empty">Your library is empty. Add a PDF or text file to ask questions about it.</div>';
  const note=API?'<div class="note">Files stay on the server while it is running. After a long idle the server restarts and you may need to add files again.</div>':'<div class="note">Demo mode: files are listed but not read.</div>';
  return `<div class="page"><h2>Library</h2><p class="lead">Documents you add here become sources for your answers.</p>${note}
  ${S.upMsg?`<div class="note" role="alert">${esc(S.upMsg)}</div>`:''}
  <label class="drop">${S.busy?'Working...':'Add documents (PDF or TXT, up to 10 MB)'}<input type="file" id="file" multiple accept=".pdf,.txt"></label>${list}</div>`;
}
function vUpgrade(){
  return `<div class="upgrade-page">
    <div class="upgrade-eyebrow"><span class="spark">✦</span> GISTKNIT MEMBERSHIP</div>
    <h1>Make room for <span>more ideas.</span></h1>
    <p class="upgrade-lead">Choose the experience that fits how you think, learn and create.</p>
    <div class="plan-grid">
      <section class="plan-card current-plan">
        <div class="plan-top"><span class="plan-label">CURRENT PLAN</span><span class="plan-status">Active</span></div>
        <h2>Free</h2><p class="plan-price">₹0 <small>/ forever</small></p>
        <p class="plan-desc">A simple place to start exploring with GistKnit AI.</p>
        <ul><li>Everyday AI chat</li><li>Chat history on this device</li><li>Core assistant features</li></ul>
        <button class="plan-button secondary" disabled>Your current plan</button>
      </section>
      <section class="plan-card premium-plan">
        <div class="plan-top"><span class="plan-label">FOR POWER USERS</span><span class="coming">COMING SOON</span></div>
        <h2>GistKnit Plus</h2><p class="plan-price">More <small>possibilities</small></p>
        <p class="plan-desc">A more capable workspace for deeper work and longer sessions.</p>
        <ul><li>Higher usage limits</li><li>Priority access when available</li><li>Advanced research tools</li><li>More space for your workflow</li></ul>
        <button class="plan-button primary" disabled>Premium is coming soon</button>
      </section>
    </div>
    <p class="upgrade-note">No payment is collected on this page. Upgrade plans will appear here when subscriptions are ready.</p>
  </div>`;
}

function vSettings(){
  const u=S.user,th=S.prefs.theme;
  return `<div class="page"><h2>Settings</h2><p class="lead">Make GistKnit AI yours.</p>
  <div class="panel"><h3>Account</h3>${u?`<div class="profile"><span class="av">${esc(initials())}</span><div><b>${esc(u.name||u.email.split('@')[0])}</b><br><small>${esc(u.email)}</small></div></div><button class="btn ghost" data-act="logout">Log out</button>`:`<p>You are not signed in.</p><a class="btn" href="#login">Log in or sign up</a>`}</div>
  <div class="panel"><h3>Appearance</h3><div class="seg" role="group" aria-label="Theme">${[['system','System'],['light','Light'],['dark','Dark']].map(([k,l])=>`<button data-act="theme" data-v="${k}" class="${th===k?'on':''}" aria-pressed="${th===k}">${l}</button>`).join('')}</div></div>
  <div class="panel"><h3>Answers</h3><label class="f" for="style" style="margin-top:0">Answer length</label><select id="style">${['Short','Detailed'].map(o=>`<option ${S.prefs.style===o?'selected':''}>${o}</option>`).join('')}</select><label class="f" for="model">AI model</label><select id="model">${[['auto','Auto (best available)'],['gemini','Gemini'],['groq','Llama on Groq'],['openrouter','OpenRouter free']].map(([k,l])=>`<option value="${k}" ${(S.prefs.model||'auto')===k?'selected':''}>${l}</option>`).join('')}</select></div>
  <div class="panel"><h3>Your data</h3><p>Chats and settings are stored only in this browser.</p><button class="btn ghost" data-act="clearh">Delete all chats</button> <button class="btn ghost" data-act="wipe">Delete everything</button></div>
  <div class="panel about"><span>${logo(44)}</span><div><h3 style="margin:0">GistKnit AI</h3><p style="margin:.2rem 0">Version 1.0 (Beta)</p><p style="margin:0">An AI research assistant that finds, reads and cites its sources.</p><p style="margin:.5rem 0 0"><b>Founded by Ved Prakash</b></p></div></div></div>`;
}
function vLogin(){
  const s=S.signup;
  return `<div class="authcard page"><span class="mark">${logo(48)}</span><h2>${s?'Create your account':'Welcome back'}</h2>
  <p class="lead">${s?'Sign up to keep your research together.':'Log in to continue.'}</p>
  <div class="note">Accounts are coming soon. For now this only saves your name on this phone.</div>
  <form id="loginform">
    ${s?'<label class="f" for="nm">Name</label><input type="text" id="nm" autocomplete="name">':''}
    <label class="f" for="em">Email</label><input type="email" id="em" required autocomplete="email">
    <label class="f" for="pw">Password</label><input type="password" id="pw" required minlength="6" autocomplete="${s?'new-password':'current-password'}">
    <p style="margin-top:16px"><button class="btn block" type="submit">${s?'Create account':'Log in'}</button></p>
  </form>
  <p><button class="btn ghost block" data-act="toggle">${s?'I already have an account':'I am new, create account'}</button></p></div>`;
}

/* events */
document.addEventListener('click',e=>{
  if(S.menu&&!e.target.closest('#menu')&&!e.target.closest('#plusBtn'))toggleMenu(false);
  const b=e.target.closest('[data-act]');if(!b)return;
  const a=b.dataset.act,i=+b.dataset.i;
  if(a==='openside'){openSide(true);return}
  if(a==='closeside'){openSide(false);return}
  if(a==='new'){newChat();return}
  if(a==='menu'){toggleMenu();return}
  if(a==='attach'){toggleMenu(false);const f=$('#attach');if(f)f.click();return}
  if(a==='tool'){S.tool=S.tool===b.dataset.k?'':b.dataset.k;toggleMenu(false);paintTool();const t=$('#ask');if(t)t.focus();return}
  if(a==='cleartool'){S.tool='';paintTool();return}
  if(a==='card'){ask(b.dataset.t,b.dataset.k);return}
  if(a==='rmpend'){S.pend.splice(i,1);paintPend();return}
  if(a==='copycode'){const c=b.closest('.code').querySelector('code').textContent;(navigator.clipboard?navigator.clipboard.writeText(c):Promise.reject()).then(()=>{b.textContent='Copied'}).catch(()=>{b.textContent='Failed'});return}
  if(a==='knot'){const d=$('#srcs'+b.dataset.i);if(d){d.open=true;d.querySelectorAll('li').forEach(li=>li.classList.toggle('hl',li.dataset.n===b.dataset.n))}return}
  if(a==='copy'){const t=S.thread[i].text;(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>{b.textContent='Copied'}).catch(()=>{b.textContent='Copy failed'});return}
  if(a==='deldoc'){const d=S.docs[i];if(API&&d.id){api('/docs/'+d.id,{method:'DELETE'}).then(()=>loadDocs()).catch(e=>{S.upMsg=e.message;render()})}else{S.docs.splice(i,1);store.set('docs',S.docs);render()}return}
  if(a==='openh'){if(S.busy)return;const h=S.convs[i];S.thread=h.msgs.map(x=>Object.assign({},x));S.cur={id:h.id,title:h.title};S.tool='';openSide(false);if(route()==='chat')render();else go('chat');return}
  if(a==='delh'){const h=S.convs[i];S.convs.splice(i,1);store.set('history',S.convs);if(S.cur&&h&&S.cur.id===h.id){S.thread=[];S.cur=null}render();return}
  if(a==='clearh'){if(confirm('Delete all chats?')){S.convs=[];S.thread=[];S.cur=null;store.set('history',[]);render()}return}
  if(a==='theme'){S.prefs.theme=b.dataset.v;store.set('prefs',S.prefs);applyTheme();render();return}
  if(a==='logout'){S.user=null;store.set('user',null);render();return}
  if(a==='wipe'){if(confirm('Delete chats, library and settings from this phone?')){S.convs=[];S.docs=[];S.user=null;S.thread=[];S.cur=null;S.prefs={style:'Short',theme:'system'};['history','docs','user','prefs'].forEach(k=>{try{localStorage.removeItem('gk_'+k)}catch(e){}});applyTheme();render()}return}
  if(a==='nudgeoff'){S.nudgeOff=true;paintMsgs();return}
  if(a==='toggle'){S.signup=!S.signup;render();return}
});
document.addEventListener('submit',e=>{
  e.preventDefault();
  if(e.target.id==='askform'){const el=$('#ask');const q=el.value;if(!q.trim()&&!S.pend.length)return;el.value='';el.style.height='';ask(q);return}
  if(e.target.id==='loginform'){
    S.user={email:$('#em').value.trim(),name:S.signup&&$('#nm')?$('#nm').value.trim():''};
    store.set('user',S.user);go('chat');render();
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='ask'){e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,130)+'px'}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){toggleMenu(false);openSide(false)}
  if(e.target.id==='ask'&&e.key==='Enter'&&!e.shiftKey&&!('ontouchstart' in window)){e.preventDefault();$('#askform').requestSubmit()}
});
document.addEventListener('change',e=>{
  if(e.target.id==='file'||e.target.id==='attach'){
    const files=[...e.target.files];e.target.value='';
    if(!files.length)return;
    const inLib=e.target.id==='file';
    const imgs=files.filter(f=>f.type.startsWith('image/')),docs=files.filter(f=>!f.type.startsWith('image/'));
    (async()=>{
      for(const f of imgs){
        if(S.pend.length>=3){S.upMsg='You can add up to 3 photos per message.';paintUp();break}
        try{S.pend.push(await readImage(f));S.upMsg='';paintPend();paintUp()}catch(err){S.upMsg=err.message;paintUp()}
      }
      if(docs.length){if(inLib){setBusy(true);render()}await uploadFiles(docs);if(inLib){setBusy(false);render()}}
    })();
  }
  if(e.target.id==='style'){S.prefs.style=e.target.value;store.set('prefs',S.prefs)}
  if(e.target.id==='model'){S.prefs.model=e.target.value;store.set('prefs',S.prefs)}
});
window.addEventListener('hashchange',()=>{openSide(false);render()});
applyTheme();
render();
