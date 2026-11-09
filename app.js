/* GistKnit AI - Step 1: UI with demo answers. AI is not connected yet. */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const store={
  get(k,d){try{const v=localStorage.getItem('gk_'+k);return v?JSON.parse(v):d}catch(e){return d}},
  set(k,v){try{localStorage.setItem('gk_'+k,JSON.stringify(v))}catch(e){}}
};
const S={
  user:store.get('user',null),
  history:store.get('history',[]),
  docs:store.get('docs',[]),
  prefs:store.get('prefs',{style:'Short'}),
  thread:[],mode:'chat',busy:false,signup:false
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ICON={
  home:'<path d="M4 11l8-7 8 7v9H4z"/>',
  chat:'<path d="M4 5h16v11H9l-5 4z"/>',
  lib:'<path d="M5 4h4v16H5zM11 4h4v16h-4zM17 6l3 .8-3.6 13.2-3-.8z"/>',
  hist:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  set:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'
};
const TABS=[['home','Home','home'],['chat','Chat','chat'],['library','Library','lib'],['history','History','hist'],['settings','Settings','set']];

function demoAnswer(q){
  const d=S.docs;
  const src=d.length
    ? d.slice(0,2).map((x,i)=>({t:x.name,s:'Your library, page '+(3+i*4)}))
    : [{t:'Sample policy document.pdf',s:'Demo source, page 4'},{t:'Sample research article',s:'Demo source, section 2'}];
  if(src.length<2)src.push({t:'Sample research article',s:'Demo source, section 2'});
  const long=S.prefs.style==='Detailed';
  let text='This is a demo answer to "'+q.slice(0,80)+'". The real AI is not connected yet; this only shows how answers will look. A good answer states the claim and points to where it came from [1]. Each numbered knot opens the exact source, so you can check it yourself [2].';
  if(long)text+=' In detailed mode, you will get more context, key points and any gaps in the sources. When two sources disagree, the answer will say so instead of picking one quietly [1][2].';
  return {text,src};
}

function route(){return (location.hash.replace('#','')||'home')}
function go(r){location.hash=r}

function render(){
  const r=route();
  $('#who').textContent=S.user?(S.user.name||S.user.email.split('@')[0]):'Log in';
  $('#who').href=S.user?'#settings':'#login';
  $('#tabs').innerHTML=TABS.map(([id,l,ic])=>`<a href="#${id}" class="${r===id?'on':''}" ${r===id?'aria-current="page"':''}><svg width="22" height="22" viewBox="0 0 24 24">${ICON[ic]}</svg>${l}</a>`).join('');
  const v=({home:vHome,chat:vChat,library:vLibrary,history:vHistory,settings:vSettings,login:vLogin})[r]||vHome;
  $('#view').innerHTML=v();
  if(r==='chat')paintMsgs();
  window.scrollTo(0,0);
}

function vHome(){
  return `<h1>What do you want to find out?</h1>
  <p class="lead">Ask a question. You get an answer with sources you can check.</p>
  <textarea id="q" placeholder="Example: What is the notice period in our leave policy?" aria-label="Your question"></textarea>
  <div class="seg" role="group" aria-label="Answer mode">
    <button data-act="mode" data-m="chat" class="${S.mode==='chat'?'on':''}">Quick answer</button>
    <button data-act="mode" data-m="research" class="${S.mode==='research'?'on':''}">Deep research</button>
  </div>
  <button class="btn block" data-act="start">Ask GistKnit</button>
  <div class="chips">
    ${['Summarise my uploaded PDF','Compare two policies','Latest research on solar storage'].map(t=>`<button data-act="chip" data-t="${esc(t)}">${esc(t)}</button>`).join('')}
  </div>`;
}

function vChat(){
  return `<div class="note">Demo mode: answers are samples. The real AI comes in the next step.</div>
  <div id="msgs" aria-live="polite"></div>
  <form class="askbar" id="askform">
    <input type="text" id="ask" placeholder="Ask a follow-up" aria-label="Message" autocomplete="off">
    <button class="btn" type="submit" ${S.busy?'disabled':''}>Send</button>
  </form>`;
}

function paintMsgs(){
  const box=$('#msgs');if(!box)return;
  if(!S.thread.length){box.innerHTML='<div class="empty">No messages yet. Ask your first question from Home or type below.</div>';return}
  box.innerHTML=S.thread.map((m,i)=>{
    if(m.role==='u')return `<div class="msg u">${esc(m.text)}</div>`;
    const steps=m.steps?`<ul class="steps">${m.steps.map(s=>`<li class="${s.done?'':'wait'}">${esc(s.t)}</li>`).join('')}</ul>`:'';
    const body=esc(m.text).replace(/\[(\d)\]/g,(a,n)=>m.done?`<button class="knot" data-act="knot" data-i="${i}" data-n="${n}" aria-label="Source ${n}">${n}</button>`:'');
    const srcs=m.done?`<ol class="srcs" id="srcs${i}">${m.src.map((s,k)=>`<li data-n="${k+1}"><b>${k+1}. ${esc(s.t)}</b><span>${esc(s.s)}</span></li>`).join('')}</ol>
      <div class="actions"><button data-act="copy" data-i="${i}">Copy answer</button><button data-act="new">New conversation</button></div>`:'';
    return `<div class="msg a">${steps}<div>${body}</div>${srcs}</div>`;
  }).join('');
  window.scrollTo(0,document.body.scrollHeight);
}

async function ask(q){
  if(S.busy||!q.trim())return;
  S.busy=true;
  const ans=demoAnswer(q);
  const m={role:'a',text:'',src:ans.src,done:false,steps:null};
  S.thread.push({role:'u',text:q},m);
  if(S.mode==='research'){
    m.steps=['Searching sources','Reading the best matches','Checking claims against sources'].map(t=>({t,done:false}));
    paintMsgs();
    for(const s of m.steps){await sleep(650);s.done=true;paintMsgs()}
  }else paintMsgs();
  const words=ans.text.split(' ');
  for(let i=0;i<words.length;i++){
    m.text+=(i?' ':'')+words[i];
    if(i%3===0||i===words.length-1)paintMsgs();
    await sleep(30);
  }
  m.done=true;m.steps=m.steps;S.busy=false;
  S.history.unshift({id:Date.now(),q,a:ans.text,src:ans.src,mode:S.mode,t:new Date().toISOString()});
  S.history=S.history.slice(0,50);store.set('history',S.history);
  if(route()==='chat'){paintMsgs();const b=$('#askform button');if(b)b.disabled=false}
}

function vLibrary(){
  const list=S.docs.length?`<ul class="list">${S.docs.map((d,i)=>`<li><div class="main"><b>${esc(d.name)}</b><small>${(d.size/1024).toFixed(0)} KB, added ${new Date(d.t).toLocaleDateString()}</small></div><button class="x" data-act="deldoc" data-i="${i}" aria-label="Remove ${esc(d.name)}">Remove</button></li>`).join('')}</ul>`
    :'<div class="empty">Your library is empty. Add a PDF or document to ask questions about it.</div>';
  return `<h2>Knowledge library</h2>
  <p class="lead">Documents you add here become sources for your answers.</p>
  <div class="note">Demo mode: files are listed here but not read yet. Reading comes in the next step.</div>
  <label class="drop">Add documents (PDF, DOCX, TXT)<input type="file" id="file" multiple accept=".pdf,.doc,.docx,.txt"></label>
  ${list}`;
}

function vHistory(){
  const list=S.history.length?`<ul class="list">${S.history.map((h,i)=>`<li><button class="main" data-act="openh" data-i="${i}"><b>${esc(h.q)}</b><small>${h.mode==='research'?'Deep research':'Quick answer'}, ${new Date(h.t).toLocaleString()}</small></button><button class="x" data-act="delh" data-i="${i}" aria-label="Delete">Delete</button></li>`).join('')}</ul>`
    :'<div class="empty">No research yet. Your questions will show up here.</div>';
  return `<div class="row"><h2 style="margin:0">Research history</h2>${S.history.length?'<button class="btn ghost" data-act="clearh">Clear all</button>':''}</div>${list}`;
}

function vSettings(){
  const u=S.user;
  return `<h2>Settings</h2>
  <div class="card"><h3>Account</h3>
    ${u?`<p>Signed in as ${esc(u.email)}</p><button class="btn ghost" data-act="logout">Log out</button>`:`<p>You are not signed in.</p><a class="btn" href="#login">Log in or sign up</a>`}
  </div>
  <div class="card"><h3>Answer style</h3>
    <select id="style" aria-label="Answer style">${['Short','Detailed'].map(o=>`<option ${S.prefs.style===o?'selected':''}>${o}</option>`).join('')}</select>
  </div>
  <div class="card"><h3>Data on this phone</h3>
    <p>History and library list are stored only in this browser.</p>
    <button class="btn ghost" data-act="wipe">Delete all data</button>
  </div>
  <p class="lead">GistKnit AI, version 0.1 (demo UI)</p>`;
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
  if(a==='mode'){S.mode=b.dataset.m;render();return}
  if(a==='chip'){$('#q').value=b.dataset.t;return}
  if(a==='start'){const q=$('#q').value.trim();if(!q){$('#q').focus();return}S.thread=[];go('chat');render();ask(q);return}
  if(a==='knot'){const ol=$('#srcs'+b.dataset.i);ol.querySelectorAll('li').forEach(li=>li.classList.toggle('hl',li.dataset.n===b.dataset.n));return}
  if(a==='copy'){const t=S.thread[i].text;(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>{b.textContent='Copied'}).catch(()=>{b.textContent='Copy failed'});return}
  if(a==='new'){S.thread=[];go('home');return}
  if(a==='deldoc'){S.docs.splice(i,1);store.set('docs',S.docs);render();return}
  if(a==='openh'){const h=S.history[i];S.thread=[{role:'u',text:h.q},{role:'a',text:h.a,src:h.src,done:true}];go('chat');render();return}
  if(a==='delh'){S.history.splice(i,1);store.set('history',S.history);render();return}
  if(a==='clearh'){if(confirm('Delete all research history?')){S.history=[];store.set('history',[]);render()}return}
  if(a==='logout'){S.user=null;store.set('user',null);render();return}
  if(a==='wipe'){if(confirm('Delete history, library and settings from this phone?')){S.history=[];S.docs=[];S.user=null;S.prefs={style:'Short'};['history','docs','user','prefs'].forEach(k=>{try{localStorage.removeItem('gk_'+k)}catch(e){}});render()}return}
  if(a==='toggle'){S.signup=!S.signup;render();return}
});
document.addEventListener('submit',e=>{
  e.preventDefault();
  if(e.target.id==='askform'){const el=$('#ask');const q=el.value;el.value='';const btn=e.target.querySelector('button');if(btn)btn.disabled=true;ask(q).then(()=>{});return}
  if(e.target.id==='loginform'){
    S.user={email:$('#em').value.trim(),name:S.signup&&$('#nm')?$('#nm').value.trim():''};
    store.set('user',S.user);go('home');render();
  }
});
document.addEventListener('change',e=>{
  if(e.target.id==='file'){
    [...e.target.files].forEach(f=>S.docs.unshift({name:f.name,size:f.size,t:new Date().toISOString()}));
    store.set('docs',S.docs);render();
  }
  if(e.target.id==='style'){S.prefs.style=e.target.value;store.set('prefs',S.prefs)}
});
window.addEventListener('hashchange',render);
render();
