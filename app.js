/* GistKnit AI - Step 3: one chat. Asks your documents or the web, shows sources. */
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
  prefs:store.get('prefs',{style:'Short'}),
  thread:[],cur:null,src:'auto',deep:false,busy:false,signup:false,upMsg:'',loaded:false
};
S.cid=store.get('cid',null);
if(!S.cid){S.cid=(self.crypto&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2)).replace(/-/g,'');store.set('cid',S.cid)}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const safeUrl=u=>/^https?:\/\//i.test(u||'');

async function api(path,opts={}){
  opts.headers=Object.assign({'X-Client-Id':S.cid},opts.headers||{});
  let r;
  try{r=await fetch(API+path,opts)}catch(e){throw new Error('Cannot reach the server. If it was idle, wait 1 minute and try again.')}
  let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error((j&&j.detail)||'Server error '+r.status);
  return j;
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

const ICON={
  chat:'<path d="M4 5h16v11H9l-5 4z"/>',
  lib:'<path d="M5 4h4v16H5zM11 4h4v16h-4zM17 6l3 .8-3.6 13.2-3-.8z"/>',
  hist:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  set:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'
};
const TABS=[['chat','Chat','chat'],['library','Library','lib'],['history','History','hist'],['settings','Settings','set']];

function demoAnswer(q){
  return {text:'This is a demo answer to "'+q.slice(0,80)+'". The server is not connected, so this only shows how answers look [1][2].',
    src:[{t:'Sample source',s:'Demo'},{t:'Sample article',s:'Demo'}],meta:{route:'chat'}};
}

function route(){const r=location.hash.replace('#','')||'chat';return r==='home'?'chat':r}
function go(r){location.hash=r}

function render(){
  const r=route();
  $('#who').textContent=S.user?(S.user.name||S.user.email.split('@')[0]):'Log in';
  $('#who').href=S.user?'#settings':'#login';
  $('#tabs').innerHTML=TABS.map(([id,l,ic])=>`<a href="#${id}" class="${r===id?'on':''}" ${r===id?'aria-current="page"':''}><svg width="22" height="22" viewBox="0 0 24 24">${ICON[ic]}</svg>${l}</a>`).join('');
  const v=({chat:vChat,library:vLibrary,history:vHistory,settings:vSettings,login:vLogin})[r]||vChat;
  $('#view').innerHTML=v();
  if(r==='chat'){paintMsgs();paintUp();window.scrollTo(0,document.body.scrollHeight)}
  else window.scrollTo(0,0);
  if(r==='library'&&API&&!S.loaded)loadDocs();
}

function vChat(){
  const chips=[['auto','Auto'],['docs','Documents'],['web','Web']].map(([k,l])=>`<button type="button" class="chip ${S.src===k?'on':''}" data-act="src" data-k="${k}" aria-pressed="${S.src===k}">${l}</button>`).join('');
  return `${API?'':'<div class="note">Demo mode: add your server link in config.js for real answers.</div>'}
  <div id="msgs" aria-live="polite"></div>
  <div class="composer">
    <div class="ctl" role="group" aria-label="Where to look">${chips}<span class="sep"></span>
      <button type="button" class="chip ${S.deep?'on':''}" data-act="deep" aria-pressed="${S.deep}">Deep research</button></div>
    <div class="upstat" id="upstat"></div>
    <form class="compose" id="askform">
      <label class="attach" title="Add a PDF or text file" aria-label="Add a document">+<input type="file" id="attach" multiple accept=".pdf,.txt"></label>
      <textarea id="ask" rows="1" placeholder="Ask anything" aria-label="Message"></textarea>
      <button class="btn" id="send" type="submit" ${S.busy?'disabled':''}>Send</button>
    </form>
  </div>`;
}
function paintUp(){const e=$('#upstat');if(e)e.textContent=S.upMsg||''}

const inl=s=>s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
function md(t){
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
const META={web:q=>`Searched the web for: ${q}`,docs:()=>'Searched your documents'};

function paintMsgs(){
  const box=$('#msgs');if(!box)return;
  if(!S.thread.length){
    box.innerHTML=`<div class="hero"><h1>What do you want to find out?</h1>
    <p class="lead">Ask anything. GistKnit looks at the web and your documents, and shows the sources.</p>
    <div class="chips">${['Latest news on solar battery storage','Summarise my uploaded PDF','Explain RAG in simple words'].map(t=>`<button data-act="chip" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`;
    return;
  }
  box.innerHTML=S.thread.map((m,i)=>{
    if(m.role==='u')return `<div class="msg u">${esc(m.text)}</div>`;
    const steps=m.steps?`<ul class="steps">${m.steps.map(s=>`<li class="${s.done?'':'wait'}">${esc(s.t)}</li>`).join('')}</ul>`:'';
    const meta=m.done&&m.meta&&META[m.meta.route]?`<p class="meta">${esc(META[m.meta.route](m.meta.query))}</p>`:'';
    let t=esc(m.text).replace(/\[(\d(?:\s*,\s*\d)+)\]/g,(a,g)=>g.split(/\s*,\s*/).map(n=>`[${n}]`).join(''));
    let body=md(t);
    body=body.replace(/\[(\d)\]/g,(a,n)=>m.done&&!m.err&&m.src&&m.src.length?`<button class="knot" data-act="knot" data-i="${i}" data-n="${n}" aria-label="Source ${n}">${n}</button>`:'');
    const srcs=m.done&&!m.err&&m.src&&m.src.length?`<ol class="srcs" id="srcs${i}">${m.src.map((s,k)=>`<li data-n="${k+1}"><b>${k+1}. ${safeUrl(s.url)?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.t)}</a>`:esc(s.t)}</b><span>${esc(s.s)}</span>${s.q?`<em class="snip">${esc(s.q)}</em>`:''}</li>`).join('')}</ol>`:'';
    const acts=m.done&&!m.err?`<div class="actions"><button data-act="copy" data-i="${i}">Copy answer</button><button data-act="new">New chat</button></div>`:'';
    return `<div class="msg a ${m.err?'err':''}">${steps}${meta}<div>${body}</div>${srcs}${acts}</div>`;
  }).join('');
  window.scrollTo(0,document.body.scrollHeight);
}
function setBusy(b){S.busy=b;const s=$('#send');if(s)s.disabled=b}

async function ask(q){
  q=q.trim();
  if(S.busy||!q)return;
  setBusy(true);
  const hist=S.thread.filter(m=>m.done&&!m.err||m.role==='u').slice(-6).map(m=>({role:m.role==='u'?'user':'assistant',content:m.text}));
  const m={role:'a',text:'',src:[],done:false,steps:null,meta:null};
  S.thread.push({role:'u',text:q},m);
  let ans,stop=false;
  m.steps=['Understanding your question','Searching','Reading sources','Writing the answer'].map(t=>({t,done:false}));
  paintMsgs();
  (async()=>{for(let i=0;i<m.steps.length-1&&!stop;i++){await sleep(2500);if(stop)break;m.steps[i].done=true;paintMsgs()}})();
  try{
    if(API){
      ans=await api('/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,mode:S.deep?'research':'chat',style:S.prefs.style,source:S.src,history:hist})});
    }else{await sleep(800);ans=demoAnswer(q)}
  }catch(e){
    stop=true;m.steps=null;m.text=e.message;m.err=true;m.done=true;setBusy(false);paintMsgs();return;
  }
  stop=true;m.steps=null;
  m.src=ans.src||[];m.meta=ans.meta||null;
  const words=ans.text.split(' ');
  for(let i=0;i<words.length;i+=5){
    m.text=words.slice(0,i+5).join(' ');paintMsgs();await sleep(30);
  }
  m.text=ans.text;m.done=true;setBusy(false);paintMsgs();
  saveConv();
}
function saveConv(){
  const msgs=S.thread.filter(x=>x.done&&!x.err||x.role==='u').map(x=>x.role==='u'?{role:'u',text:x.text}:{role:'a',text:x.text,src:x.src,meta:x.meta,done:true});
  if(!S.cur){S.cur={id:Date.now(),title:msgs[0].text.slice(0,80)}}
  const c={id:S.cur.id,title:S.cur.title,t:new Date().toISOString(),msgs};
  S.convs=[c,...S.convs.filter(x=>x.id!==c.id)].slice(0,30);
  store.set('history',S.convs);
}

function vLibrary(){
  const list=S.docs.length?`<ul class="list">${S.docs.map((d,i)=>`<li><div class="main"><b>${esc(d.name)}</b><small>${(d.size/1024).toFixed(0)} KB${d.pages?', '+d.pages+' page'+(d.pages>1?'s':''):''}, added ${new Date(d.t).toLocaleDateString()}</small></div><button class="x" data-act="deldoc" data-i="${i}" aria-label="Remove ${esc(d.name)}">Remove</button></li>`).join('')}</ul>`
    :'<div class="empty">Your library is empty. Add a PDF or text file to ask questions about it.</div>';
  const note=API?'<div class="note">Files stay on the server while it is running. After a long idle the server restarts and you may need to add files again.</div>':'<div class="note">Demo mode: files are listed but not read.</div>';
  return `<h2>Knowledge library</h2>
  <p class="lead">Documents you add here become sources for your answers.</p>${note}
  ${S.upMsg?`<div class="note" role="alert">${esc(S.upMsg)}</div>`:''}
  <label class="drop">${S.busy?'Working...':'Add documents (PDF or TXT, up to 10 MB)'}<input type="file" id="file" multiple accept=".pdf,.txt"></label>${list}`;
}
function vHistory(){
  const list=S.convs.length?`<ul class="list">${S.convs.map((h,i)=>`<li><button class="main" data-act="openh" data-i="${i}"><b>${esc(h.title)}</b><small>${new Date(h.t).toLocaleString()}</small></button><button class="x" data-act="delh" data-i="${i}" aria-label="Delete">Delete</button></li>`).join('')}</ul>`
    :'<div class="empty">No chats yet. Your questions will show up here.</div>';
  return `<div class="row"><h2 style="margin:0">History</h2>${S.convs.length?'<button class="btn ghost" data-act="clearh">Clear all</button>':''}</div>${list}`;
}
function vSettings(){
  const u=S.user;
  return `<h2>Settings</h2>
  <div class="card"><h3>Account</h3>${u?`<p>Signed in as ${esc(u.email)}</p><button class="btn ghost" data-act="logout">Log out</button>`:`<p>You are not signed in.</p><a class="btn" href="#login">Log in or sign up</a>`}</div>
  <div class="card"><h3>Answer style</h3><select id="style" aria-label="Answer style">${['Short','Detailed'].map(o=>`<option ${S.prefs.style===o?'selected':''}>${o}</option>`).join('')}</select></div>
  <div class="card"><h3>Data on this phone</h3><p>Chats and settings are stored only in this browser.</p><button class="btn ghost" data-act="wipe">Delete all data</button></div>
  <p class="lead">GistKnit AI, version 0.3</p>`;
}
function vLogin(){
  const s=S.signup;
  return `<h2>${s?'Create your account':'Welcome back'}</h2>
  <p class="lead">${s?'Sign up to keep your research on every device.':'Log in to see your research and library.'}</p>
  <div class="note">Demo mode: no real account is created yet.</div>
  <form id="loginform">
    ${s?'<label class="f" for="nm">Name</label><input type="text" id="nm" autocomplete="name">':''}
    <label class="f" for="em">Email</label><input type="email" id="em" required autocomplete="email">
    <label class="f" for="pw">Password</label><input type="password" id="pw" required minlength="6" autocomplete="${s?'new-password':'current-password'}">
    <p style="margin-top:16px"><button class="btn block" type="submit">${s?'Create account':'Log in'}</button></p>
  </form>
  <p><button class="btn ghost block" data-act="toggle">${s?'I already have an account':'I am new, create account'}</button></p>`;
}

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;
  const a=b.dataset.act,i=+b.dataset.i;
  if(a==='src'){S.src=b.dataset.k;document.querySelectorAll('[data-act=src]').forEach(x=>{const on=x.dataset.k===S.src;x.classList.toggle('on',on);x.setAttribute('aria-pressed',on)});return}
  if(a==='deep'){S.deep=!S.deep;b.classList.toggle('on',S.deep);b.setAttribute('aria-pressed',S.deep);return}
  if(a==='chip'){ask(b.dataset.t);return}
  if(a==='knot'){const ol=$('#srcs'+b.dataset.i);if(ol)ol.querySelectorAll('li').forEach(li=>li.classList.toggle('hl',li.dataset.n===b.dataset.n));return}
  if(a==='copy'){const t=S.thread[i].text;(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>{b.textContent='Copied'}).catch(()=>{b.textContent='Copy failed'});return}
  if(a==='new'){if(S.busy)return;S.thread=[];S.cur=null;render();return}
  if(a==='deldoc'){const d=S.docs[i];if(API&&d.id){api('/docs/'+d.id,{method:'DELETE'}).then(()=>loadDocs()).catch(e=>{S.upMsg=e.message;render()})}else{S.docs.splice(i,1);store.set('docs',S.docs);render()}return}
  if(a==='openh'){if(S.busy)return;const h=S.convs[i];S.thread=h.msgs.map(x=>Object.assign({},x));S.cur={id:h.id,title:h.title};go('chat');render();return}
  if(a==='delh'){S.convs.splice(i,1);store.set('history',S.convs);render();return}
  if(a==='clearh'){if(confirm('Delete all chats?')){S.convs=[];store.set('history',[]);render()}return}
  if(a==='logout'){S.user=null;store.set('user',null);render();return}
  if(a==='wipe'){if(confirm('Delete chats, library and settings from this phone?')){S.convs=[];S.docs=[];S.user=null;S.thread=[];S.cur=null;S.prefs={style:'Short'};['history','docs','user','prefs'].forEach(k=>{try{localStorage.removeItem('gk_'+k)}catch(e){}});render()}return}
  if(a==='toggle'){S.signup=!S.signup;render();return}
});
document.addEventListener('submit',e=>{
  e.preventDefault();
  if(e.target.id==='askform'){const el=$('#ask');const q=el.value;if(!q.trim())return;el.value='';el.style.height='';ask(q);return}
  if(e.target.id==='loginform'){
    S.user={email:$('#em').value.trim(),name:S.signup&&$('#nm')?$('#nm').value.trim():''};
    store.set('user',S.user);go('chat');render();
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='ask'){e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,130)+'px'}
});
document.addEventListener('keydown',e=>{
  if(e.target.id==='ask'&&e.key==='Enter'&&!e.shiftKey&&!('ontouchstart' in window)){e.preventDefault();$('#askform').requestSubmit()}
});
document.addEventListener('change',e=>{
  if(e.target.id==='file'||e.target.id==='attach'){
    const files=[...e.target.files];e.target.value='';
    if(!files.length)return;
    const inLib=e.target.id==='file';
    (async()=>{if(inLib){setBusy(true);render()}await uploadFiles(files);if(inLib){setBusy(false);render()}})();
  }
  if(e.target.id==='style'){S.prefs.style=e.target.value;store.set('prefs',S.prefs)}
});
window.addEventListener('hashchange',render);
render();
