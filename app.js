(function(){
'use strict';
const KEY='reisekasse-v1';
const RATE_URLS=[
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.min.json',
  'https://latest.currency-api.pages.dev/v1/currencies/eur.min.json'
];
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parseISO=s=>{const[a,b,c]=s.split('-').map(Number);return new Date(a,b-1,c)};
const addDays=(s,n)=>{const d=parseISO(s);d.setDate(d.getDate()+n);return iso(d)};
const diffDays=(a,b)=>Math.round((parseISO(b)-parseISO(a))/864e5);
const today=()=>iso(new Date());
const now=()=>Date.now();
const eur=v=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:v!==0&&Math.abs(v)<100?2:0}).format(v);
const eur2=v=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(v);
const num=(v,d=0)=>new Intl.NumberFormat('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d}).format(v);
const rateStr=r=>num(r,r<10?4:2);
const dfmt=(s,o)=>new Intl.DateTimeFormat('de-DE',o).format(parseISO(s));
const dayLabel=s=>dfmt(s,{weekday:'long',day:'numeric',month:'long'});
const uid=()=>crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
const pl=(n,sg,pr)=>n+' '+(n===1?sg:pr);
/* Beträge: Komma ist Dezimalzeichen; Punkte nur als Tausendertrennung, wenn sie wie 1.500 aussehen */
const pf=v=>{let s=String(v).trim().replace(/\s|€/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');return parseFloat(s)||0};
/* Kurse: Punkt und Komma gelten beide als Dezimalzeichen */
const pr=v=>{let s=String(v).trim().replace(/\s/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');return parseFloat(s)||0};
const nin=v=>v?String(v).replace('.',','):'';
const live=a=>a.filter(x=>!x.deleted);

const DEFAULT_CATS=[['🛏','Unterkunft',true],['🍽','Essen & Trinken'],['🛒','Einkauf'],['🚐','Transport'],['🎟','Aktivitäten'],['🎁','Souvenirs'],['🧾','Gebühren'],['•','Sonstiges']];

function newTrip(from){
  const t=today(), ts=now();
  return {id:uid(),name:'Neue Reise',start:t,end:addDays(t,6),budget:0,
    joint:from?{...from.joint}:{on:true,name:'Gemeinschaftskonto'},deleted:false,created:ts,updated:ts,lastCur:'EUR',
    people:from?live(from.people).map(p=>({id:p.id,name:p.name,updated:ts})):[{id:uid(),name:'Person 1',updated:ts},{id:uid(),name:'Person 2',updated:ts}],
    cats:from?live(from.cats).filter(c=>!c.hidden).map(c=>({id:uid(),emoji:c.emoji,name:c.name,budget:0,hidden:false,nights:!!c.nights,updated:ts}))
      :DEFAULT_CATS.map(([e,n,ni])=>({id:uid(),emoji:e,name:n,budget:0,hidden:false,nights:!!ni,updated:ts})),
    currencies:[],expenses:[]};
}

/* ---------- Speicher ---------- */
function load(){
  let raw=null;
  try{raw=localStorage.getItem(KEY)}catch(e){}
  if(!raw)return null;
  try{const s=JSON.parse(raw);if(s&&Array.isArray(s.trips))return s}catch(e){}
  /* Nicht lesbare Daten nicht überschreiben, sondern beiseitelegen */
  try{localStorage.setItem(KEY+'-defekt-'+now(),raw)}catch(e){}
  return null;
}
let saveWarned=false;
function save(){
  try{localStorage.setItem(KEY,JSON.stringify(S));saveWarned=false;return true}
  catch(e){if(!saveWarned){saveWarned=true;alert('Speichern fehlgeschlagen. Bitte sofort unter „Reise“ eine Sicherung erstellen.')}return false}
}
let S=load()||{v:1,active:null,trips:[],lastBackup:null};
S.trips.forEach(RK.normalizeTrip);
let T=null;
let tab='overview', filter=null, suggestion=null, installEvt=null, persisted=null, appVersion='';

/* ---------- Grundfunktionen ---------- */
const people=()=>live(T.people);
const cats=()=>live(T.cats);
const curs=()=>live(T.currencies);
const exps=()=>live(T.expenses);
const touch=o=>{o.updated=now();return o};
const rateOf=code=>code==='EUR'?1:((curs().find(c=>c.code===code)||{}).rate||1);
const toEUR=e=>e.cur==='EUR'?e.amount:e.amount/e.rate;
const catOf=id=>T.cats.find(c=>c.id===id)||{emoji:'•',name:'Unbekannt'};
const person=id=>T.people.find(p=>p.id===id);
const pName=id=>id==='J'?T.joint.name:((person(id)||{}).name||'Unbekannt');
const forIds=e=>e.for&&e.for.length?e.for:people().map(p=>p.id);
const inBudget=e=>!!e.shared;
const shared=()=>exps().filter(inBudget);
const sumE=a=>a.reduce((s,e)=>s+toEUR(e),0);
const forLabel=f=>!f||people().every(p=>f.includes(p.id))?'für alle':(f.length===1?'nur '+pName(f[0]):'für '+f.map(pName).join(', '));
const curList=()=>['EUR',...curs().map(c=>c.code)];

function alloc(ex){
  const out=[], end=T.end;
  for(const e of ex){
    const v=toEUR(e);
    if(e.nights>0){for(let i=0;i<e.nights;i++){let d=addDays(e.date,i);if(d>end)d=end;out.push({date:d,v:v/e.nights,cat:e.cat})}}
    else out.push({date:e.date,v,cat:e.cat});
  }
  return out;
}
const sumA=a=>a.reduce((s,x)=>s+x.v,0);
function budgetState(){
  const t=today(),{start,end,budget}=T, ex=shared();
  const total=Math.max(1,diffDays(start,end)+1), spent=sumE(ex);
  let phase='during',ref=t;
  if(t<start){phase='before';ref=start}
  if(t>end){phase='after';ref=end}
  const al=alloc(ex);
  const before=sumA(al.filter(x=>x.date<ref)), todaySpent=sumA(al.filter(x=>x.date===ref));
  const remDays=Math.max(1,diffDays(ref,end)+1), allowance=(budget-before)/remDays;
  const elapsed=phase==='before'?0:diffDays(start,ref)+1;
  const personal=sumE(exps().filter(e=>!inBudget(e)));
  return {phase,ref,total,elapsed,planned:budget/total,dayNo:diffDays(start,ref)+1,spent,left:budget-spent,allowance,todayLeft:allowance-todaySpent,daysTo:diffDays(t,start),personal};
}
function perNight(catId){
  const ex=shared().filter(e=>e.cat===catId&&e.nights>0), n=ex.reduce((a,e)=>a+e.nights,0);
  return n?{n,v:sumE(ex)/n}:null;
}
function avgFor(catId){
  const b=budgetState(), ex=shared().filter(e=>!catId||e.cat===catId), v=sumE(ex);
  const soFarV=b.elapsed?sumA(alloc(ex).filter(x=>x.date<=b.ref)):0;
  const c=catId?T.cats.find(x=>x.id===catId):null;
  const planned=catId?(c&&c.budget?c.budget/b.total:null):(T.budget?b.planned:null);
  return {v,soFar:b.elapsed?soFarV/b.elapsed:null,whole:v/b.total,planned,elapsed:b.elapsed,total:b.total};
}
/* Abrechnung für beliebig viele Personen: Salden bilden, dann mit möglichst wenigen Zahlungen ausgleichen */
function settlement(){
  const bal={J:0}; people().forEach(p=>bal[p.id]=0);
  for(const e of exps()){
    const v=toEUR(e), parts=forIds(e), share=v/parts.length;
    if(e.payer==='J'&&inBudget(e))continue;
    bal[e.payer]=(bal[e.payer]||0)+v;
    parts.forEach(id=>bal[id]=(bal[id]||0)-share);
  }
  const cred=Object.entries(bal).filter(([,v])=>v>0.005).map(([k,v])=>({k,v})).sort((a,b)=>b.v-a.v);
  const debt=Object.entries(bal).filter(([,v])=>v<-0.005).map(([k,v])=>({k,v:-v})).sort((a,b)=>b.v-a.v);
  const tr=[]; let i=0,j=0;
  while(i<debt.length&&j<cred.length){
    const m=Math.min(debt[i].v,cred[j].v);
    tr.push({from:debt[i].k,to:cred[j].k,v:m});
    debt[i].v-=m;cred[j].v-=m;
    if(debt[i].v<0.005)i++; if(cred[j].v<0.005)j++;
  }
  return tr;
}

/* ---------- Sicherung ---------- */
function lastChange(){
  let m=0;
  for(const t of S.trips){m=Math.max(m,t.updated||0);for(const k of ['people','cats','currencies','expenses'])for(const o of t[k])m=Math.max(m,o.updated||0)}
  return m;
}
function backupDue(){
  if(!S.trips.some(t=>!t.deleted&&live(t.expenses).length))return false;
  const lb=S.lastBackup||0;
  return lastChange()>lb&&now()-lb>864e5;
}
function ago(ts){
  if(!ts)return 'noch nie';
  const d=diffDays(iso(new Date(ts)),today());
  return d<=0?'heute':d===1?'gestern':`vor ${d} Tagen`;
}
const slug=s=>String(s).normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/ß/g,'ss').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'')||'Reise';
function canShareFiles(){
  try{return !!(navigator.canShare&&navigator.canShare({files:[new File(['x'],'x.txt',{type:'text/plain'})]}))}catch(e){return false}
}
function download(text,name,type){
  const url=URL.createObjectURL(new Blob([text],{type:type||'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
const DONE={backup:['Sicherung übergeben','Sicherung im Download-Ordner gespeichert'],trip:['Reise geteilt','Datei im Download-Ordner gespeichert'],csv:['Tabelle übergeben','Tabelle im Download-Ordner gespeichert']};
function exported(kind,how){
  if(kind==='backup'){S.lastBackup=now();save()}
  render();
  toast(DONE[kind][how==='share'?0:1]);
}
async function shareFile(text,base,kind){
  /* Chrome teilt nur bestimmte Dateitypen. JSON geht nicht überall, Text schon – der Inhalt bleibt gleich. */
  let f=kind==='csv'?new File([text],base+'.csv',{type:'text/csv'}):new File([text],base+'.json',{type:'application/json'});
  if(!navigator.canShare({files:[f]}))f=new File([text],base+'.txt',{type:'text/plain'});
  try{await navigator.share({files:[f],title:base});exported(kind,'share')}
  catch(e){
    if(e&&e.name==='AbortError')return;
    saveFile(text,base,kind);
  }
}
function saveFile(text,base,kind){
  if(kind==='csv')download(text,base+'.csv','text/csv;charset=utf-8');else download(text,base+'.json');
  exported(kind,'download');
}
function exportChoice(kind){
  const text=kind==='csv'?RKCSV.exportTrip(T):RK.makeFile(kind==='backup'?S.trips:[T],kind);
  const base=kind==='backup'?`Reisekasse-Sicherung-${today()}`:`Reisekasse-${slug(T.name)}-${today()}`;
  const n=live(S.trips).length, share=canShareFiles();
  const TEXT={
    backup:['Sicherung erstellen',`${n===1?'Deine Reise':`Alle ${n} Reisen`} in einer Datei. Lege sie in Google Drive oder OneDrive ab, damit sie auch nach einem Handywechsel noch da ist.`,'Senden an … (z. B. Google Drive)'],
    trip:['Reise teilen',`„${T.name}“ als Datei an die andere Person schicken, z. B. per WhatsApp. Sie öffnet die Reisekasse, tippt unter „Reise“ auf „Datei einlesen“ und schickt dir danach ihre Datei zurück.`,'Senden an … (z. B. WhatsApp)'],
    csv:['Als Tabelle exportieren',`Alle Ausgaben von „${T.name}“ als Tabelle für Excel. Du kannst sie dort bearbeiten und mit „Datei einlesen“ zurückholen: Zeilen mit ID ändern den Eintrag, Zeilen ohne ID kommen dazu, ein „x“ in der Spalte „Löschen“ löscht. Die ID-Spalte bitte nicht ändern.`,'Senden an … (z. B. Google Drive)']
  }[kind];
  openChoice({title:TEXT[0],text:TEXT[1],buttons:[
    share&&{label:TEXT[2],primary:true,fn:()=>shareFile(text,base,kind)},
    {label:'Im Download-Ordner speichern',primary:!share,fn:()=>saveFile(text,base,kind)}
  ]});
}
const undoBtn=snapshot=>({label:'Rückgängig machen',fn:()=>{S=JSON.parse(snapshot);save();render();toast('Einlesen rückgängig gemacht')}});
const failed=msg=>openChoice({title:'Datei nicht eingelesen',text:msg,buttons:[{label:'OK',primary:true}]});
let importing=false;
async function importFile(file){
  if(importing)return; importing=true;
  try{
    let text;
    try{text=await file.text()}catch(e){failed('Die Datei konnte nicht gelesen werden.');return}
    if(/^\s*\{/.test(text.replace(/^﻿/,'')))importJSON(text);else importCSV(text,file.name);
  }finally{importing=false}
}
function importJSON(text){
  let data;
  try{data=RK.parseFile(text)}catch(err){failed(err.message);return}
  const snapshot=JSON.stringify(S);
  const res=RK.mergeState(S,data);
  const alive=live(S.trips);
  if(!alive.some(t=>t.id===S.active)){const first=res.find(r=>alive.some(t=>t.id===r.id));S.active=first?first.id:(alive[0]||{}).id||null}
  /* Wiederherstellung auf leerem Gerät: die eingelesene Sicherung ist die letzte Sicherung */
  if(data.kind==='backup'&&!JSON.parse(snapshot).trips.length)S.lastBackup=Date.parse(data.exported)||now();
  filter=null;save();render();
  const lines=res.map(r=>{
    if(r.isNew)return `<li><b>${esc(r.name)}</b>: neu übernommen (${pl(r.count,'Ausgabe','Ausgaben')})</li>`;
    if(r.removed)return `<li><b>${esc(r.name)}</b>: wurde auf dem anderen Gerät gelöscht und ist jetzt auch hier gelöscht</li>`;
    const p=[];
    if(r.restored)p.push('wiederhergestellt');
    if(r.added)p.push(r.added===1?'1 neue Ausgabe':r.added+' neue Ausgaben');
    if(r.changed)p.push(r.changed===1?'1 geänderte Ausgabe':r.changed+' geänderte Ausgaben');
    if(r.deleted)p.push(r.deleted===1?'1 Ausgabe gelöscht':r.deleted+' Ausgaben gelöscht');
    if(r.settings)p.push('Einstellungen aktualisiert');
    return `<li><b>${esc(r.name)}</b>: ${p.length?p.join(', '):'keine Änderungen'}</li>`;
  });
  openChoice({title:'Datei eingelesen',
    html:lines.length?`<ul>${lines.join('')}</ul>`:'<p>Die Datei enthielt nichts Neues.</p>',
    buttons:[{label:'OK',primary:true},undoBtn(snapshot)]});
}
/* Tabelle einlesen: in die geöffnete Reise, oder ohne Reise in eine neue */
function importCSV(text,fileName){
  const snapshot=JSON.stringify(S);
  let target=T, fresh=false;
  if(!target){
    target=newTrip(null);target.people=[];fresh=true;
    const n=String(fileName||'').replace(/\.[^.]*$/,'').replace(/^Reisekasse-/i,'').replace(/-?\d{4}-\d{2}-\d{2}$/,'').replace(/[-_]+/g,' ').trim();
    if(n)target.name=n;
  }
  const r=RKCSV.apply(target,text,{uid,now});
  if(r.errors.length){
    S=JSON.parse(snapshot);render();
    failed(r.errors.slice(0,8).join('\n')+(r.errors.length>8?`\n… und ${r.errors.length-8} weitere Fehler`:'')+'\n\nEs wurde nichts übernommen.');
    return;
  }
  if(fresh){
    if(!live(target.people).length)target.people.push({id:uid(),name:'Person 1',updated:now()});
    const ds=live(target.expenses).map(e=>e.date).sort();
    if(ds.length){target.start=ds[0];target.end=ds[ds.length-1]}
    S.trips.push(target);S.active=target.id;tab='overview';
  }
  filter=null;save();render();
  const st=r.stats, p=[];
  if(st.added)p.push(pl(st.added,'neue Ausgabe','neue Ausgaben'));
  if(st.changed)p.push(pl(st.changed,'geänderte Ausgabe','geänderte Ausgaben'));
  if(st.deleted)p.push(st.deleted===1?'1 Ausgabe gelöscht':st.deleted+' Ausgaben gelöscht');
  if(st.same)p.push(`${st.same} unverändert`);
  const extra=[];
  if(st.duplicate)extra.push(st.duplicate===1?'1 Zeile ohne ID war schon vorhanden und wurde übersprungen.':`${st.duplicate} Zeilen ohne ID waren schon vorhanden und wurden übersprungen.`);
  if(st.skipped)extra.push(st.skipped===1?'1 Zeile betrifft eine in der App gelöschte Ausgabe und wurde übersprungen.':`${st.skipped} Zeilen betreffen in der App gelöschte Ausgaben und wurden übersprungen.`);
  const m=r.made;
  if(m.people.length)extra.push('Neu angelegte Personen: '+m.people.join(', ')+'.');
  if(m.cats.length)extra.push('Neu angelegte Kategorien: '+m.cats.join(', ')+'.');
  if(m.currencies.length)extra.push('Neu angelegte Währungen: '+m.currencies.join(', ')+'.');
  openChoice({title:fresh?'Neue Reise aus Tabelle':'Tabelle eingelesen',
    html:`<ul><li><b>${esc(target.name)}</b>: ${p.length?p.join(', '):'keine Änderungen'}</li>${extra.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`+
      (fresh?'<p>Prüfe unter „Reise“ Name, Daten, Budget und Personen.</p>':''),
    buttons:[{label:'OK',primary:true},undoBtn(snapshot)]});
}

/* ---------- Kurse ---------- */
async function fetchRate(code){
  let reached=false;
  for(const u of RATE_URLS){
    try{
      const r=await fetch(u,{cache:'no-store'});
      if(!r.ok)continue;
      const j=await r.json(); reached=true;
      const v=j&&j.eur&&j.eur[code.toLowerCase()];
      if(v>0)return {v:Number(v.toPrecision(6)),date:j.date};
    }catch(e){}
  }
  throw new Error(reached?`Für ${code} liefert der Kursdienst keinen Kurs. Bitte von Hand eintragen.`:'Kurs konnte nicht abgerufen werden. Ohne Netz bitte von Hand eintragen.');
}

/* ---------- Ansichten ---------- */
function render(){
  const trips=live(S.trips);
  T=trips.find(t=>t.id===S.active)||trips[0]||null;
  if(T&&S.active!==T.id)S.active=T.id;
  document.body.classList.toggle('welcome',!T);
  if(!T){$('#app').innerHTML=welcome();bindView();return}
  document.querySelectorAll('.tab').forEach(b=>{if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  const head=`<header class="top"><h1>${esc(T.name)}</h1><button class="sub linkish" id="goTrips">${fmtRange()}${trips.length>1?', Reise wechseln':''}</button></header>`;
  const views={overview,list,settle,trip};
  $('#app').innerHTML=head+(tab==='overview'?banners():'')+views[tab]();
  bindView();
}
function installBtn(){return installEvt?`<button class="btn wide" data-install>Als App installieren</button>`:''}
function banners(){
  let h='';
  if(backupDue())h+=`<div class="banner"><span>Letzte Sicherung: ${ago(S.lastBackup)}</span><button id="bkNow">Jetzt sichern</button></div>`;
  if(installEvt)h+=`<div class="banner info"><span>Als App installieren, dann startet sie auch offline.</span><button data-install>Installieren</button></div>`;
  return h;
}
function welcome(){
  return `<header class="top"><h1>Reisekasse</h1></header>
  <div class="hero">
    <p>Reiseausgaben schnell erfassen, das Budget im Blick behalten und am Ende abrechnen. Die Daten bleiben auf diesem Gerät.</p>
    <button class="btn primary wide" id="wNew">Neue Reise anlegen</button>
    <button class="btn wide" data-import>Geteilte Reise oder Sicherung einlesen</button>
    ${installBtn()}
    <p class="explain">Hat die andere Person die Reise schon angelegt? Dann lass sie dir unter „Reise“ mit „Reise teilen“ schicken und lies die Datei hier ein. Nach einem Neuinstallieren stellst du so auch eine Sicherung wieder her.</p>
  </div>`;
}
function fmtRange(){const f=s=>dfmt(s,{day:'numeric',month:'short'});return f(T.start)+' bis '+f(T.end)}
function overview(){
  const b=budgetState(), pct=T.budget?Math.min(100,b.spent/T.budget*100):0;
  let label='Heute noch', big=eur(b.todayLeft), hint=`von ${eur(b.allowance)} Tagesbudget, Tag ${b.dayNo} von ${b.total}`;
  if(b.phase==='before'){label=`Reise beginnt in ${b.daysTo} ${b.daysTo===1?'Tag':'Tagen'}`;big=eur(b.allowance);hint='Tagesbudget, wenn nichts vorab bezahlt wird'}
  if(b.phase==='after'){label='Reise beendet';big=eur(b.left);hint=b.left>=0?'unter Budget geblieben':'über Budget'}
  if(!T.budget){label='Noch kein Budget';big=eur(b.spent);hint='ausgegeben. Lege unter „Reise“ ein Gesamtbudget fest.'}
  const over=T.budget&&((b.phase==='during'&&b.todayLeft<0)||(b.phase==='after'&&b.left<0));
  const rows=cats().filter(c=>!c.hidden).map(c=>({c,a:avgFor(c.id)})).sort((x,y)=>y.a.v-x.a.v).map(({c,a})=>{
    const p=c.budget?Math.min(100,a.v/c.budget*100):0, o=c.budget&&a.v>c.budget;
    const hot=a.planned!=null&&a.soFar!=null&&a.soFar>a.planned, pn=c.nights&&perNight(c.id);
    return `<button class="catrow catlink" data-filter="${c.id}"><span class="ic">${esc(c.emoji)}</span><span>${esc(c.name)}</span>
      <span class="amt">${eur(a.v)}${c.budget?`<small>von ${eur(c.budget)}</small>`:''}</span>
      ${c.budget?`<div class="cbar ${o?'over':''}"><i style="width:${p}%"></i></div>`:''}
      <div class="cavg"><span class="${hot?'hot':''}">Ø ${a.soFar==null?'–':eur2(a.soFar)} bisher</span><span>Ø ${eur2(a.whole)} ganze Reise</span>${a.planned!=null?`<span>Plan ${eur2(a.planned)}</span>`:''}${pn?`<span>Ø ${eur2(pn.v)} pro Nacht (${pn.n} ${pn.n===1?'Nacht':'Nächte'})</span>`:''}</div></button>`}).join('');
  return `<div class="ticket">
    <div class="main"><div class="label">${label}</div><div class="big ${over?'over':''}">${big}</div><div class="hint">${hint}</div></div>
    <div class="perf"></div>
    <div class="stub"><div><div class="s">Gesamt noch</div><div class="v">${T.budget?eur(b.left):'–'}</div></div>
      <div style="text-align:right"><div class="s">ausgegeben</div><div class="v">${eur(b.spent)} <span class="s">von ${T.budget?eur(T.budget):'–'}</span></div></div>
      <div class="bar ${T.budget&&b.left<0?'over':''}"><i style="width:${pct}%"></i></div></div>
  </div>
  <section class="block"><h2>Durchschnittliche Kosten</h2>${avgBlock()}</section>
  <section class="block"><h2>Nach Kategorie</h2><div class="panel">${rows}</div>
    <p class="explain">Werte pro Tag. Tippe eine Kategorie an, um ihre Ausgaben zu sehen.</p></section>`;
}
function avgBlock(catId){
  const a=avgFor(catId), b=budgetState();
  const hot=a.planned!=null&&a.soFar!=null&&a.soFar>a.planned;
  const foot=[a.planned!=null?`Geplant sind ${eur2(a.planned)} pro Tag.`:(catId?'Für diese Kategorie ist kein Budget festgelegt.':'Noch kein Gesamtbudget festgelegt.')];
  if(shared().some(e=>(!catId||e.cat===catId)&&e.nights>1))foot.push('Unterkünfte sind auf ihre Nächte verteilt.');
  if(!catId&&b.personal>=0.01)foot.push(`Ausgaben nicht für alle (${eur2(b.personal)}) zählen nicht ins Reisebudget.`);
  return `<div class="avg">
    <div><div class="k">Ø pro Tag bisher</div><div class="n ${hot?'over':''}">${a.soFar==null?'–':eur2(a.soFar)}</div><div class="k">${a.elapsed?`über ${a.elapsed} ${a.elapsed===1?'Tag':'Tage'}`:'Reise noch nicht begonnen'}</div></div>
    <div><div class="k">Ø pro Tag, ganze Reise</div><div class="n">${eur2(a.whole)}</div><div class="k">über ${a.total} Tage</div></div>
    <div class="p">${foot.join(' ')}</div></div>`;
}
function itemHTML(e){
  const c=catOf(e.cat), v=toEUR(e), tags=[];
  if(e.payer!=='J')tags.push(`<span class="tag">bezahlt von ${esc(pName(e.payer))}</span>`);
  if(!inBudget(e))tags.push(`<span class="tag own">${esc(forLabel(e.for))}, nicht im Budget</span>`);
  if(e.method==='cash')tags.push(`<span class="tag cash">Bar</span>`);
  if(e.nights>0)tags.push(`<span class="tag">${e.nights} ${e.nights===1?'Nacht':'Nächte'}, ${eur2(v/e.nights)} pro Nacht</span>`);
  const orig=e.cur==='EUR'?'':`<small>${num(e.amount,e.amount%1?2:0)} ${esc(e.cur)}</small>`;
  return `<button class="item ${inBudget(e)?'':'personal'}" data-edit="${e.id}"><span class="ic">${esc(c.emoji)}</span>
    <span><span class="t">${esc(e.note||c.name)}</span><span class="m">${e.note?`<span>${esc(c.name)}</span>`:''}${tags.join('')}</span></span>
    <span class="a">${eur2(v)}${orig}</span></button>`;
}
function list(){
  const all=exps();
  if(!all.length)return `<div class="empty">Noch keine Ausgaben. Tippe unten auf +, um die erste zu erfassen.</div>`;
  if(filter&&!cats().some(c=>c.id===filter))filter=null;
  const used=cats().filter(c=>all.some(e=>e.cat===c.id));
  const chips=`<div class="chips" role="group" aria-label="Nach Kategorie filtern"><button data-filter="" aria-pressed="${!filter}">Alle</button>
    ${used.map(c=>`<button data-filter="${c.id}" aria-pressed="${filter===c.id}">${esc(c.emoji)} ${esc(c.name)}</button>`).join('')}</div>`;
  const ex=all.filter(e=>!filter||e.cat===filter), days=[...new Set(ex.map(e=>e.date))].sort().reverse();
  const fpn=filter&&catOf(filter).nights?perNight(filter):null;
  const title=filter?`<h2 class="ftitle">${esc(catOf(filter).emoji)} ${esc(catOf(filter).name)}: ${eur2(sumE(shared().filter(e=>e.cat===filter)))}${fpn?`<br><span class="fsub">Ø ${eur2(fpn.v)} pro Nacht über ${fpn.n} Nächte</span>`:''}</h2>`:'';
  return chips+title+avgBlock(filter)+(days.length?days.map(d=>{
    const es=ex.filter(e=>e.date===d).sort((a,b)=>b.created-a.created);
    return `<div class="day"><div class="dayhead"><span>${dayLabel(d)}</span><span>${eur2(sumE(es.filter(inBudget)))}</span></div>${es.map(itemHTML).join('')}</div>`;
  }).join(''):`<div class="empty" style="margin-top:14px">Keine Ausgaben in dieser Kategorie.</div>`);
}
function settle(){
  const tr=settlement();
  const out=tr.length?tr.map(t=>`<div class="debt"><div class="who">${esc(pName(t.from))} <span>zahlt an</span> ${esc(pName(t.to))}</div><div class="v">${eur2(t.v)}</div></div>`).join('')
    :`<div class="ok">Alles ausgeglichen. Niemand schuldet jemandem etwas.</div>`;
  const payers=[...(T.joint.on||exps().some(e=>e.payer==='J')?['J']:[]),...people().map(p=>p.id)];
  const byPayer=payers.map(p=>`<div class="catrow"><span class="ic">${p==='J'?'🏦':'👤'}</span><span>${esc(pName(p))}</span><span class="amt">${eur2(sumE(exps().filter(e=>e.payer===p)))}</span></div>`).join('');
  return `<section class="block" style="margin-top:0"><h2>Wer schuldet wem</h2>${out}
    <p class="explain">Gemeinsame Ausgaben werden gleichmäßig auf alle beteiligten Personen verteilt. Zahlungen vom ${esc(T.joint.name)} für alle zählen nur fürs Budget. Hat es etwas bezahlt, das nicht für alle war, zahlen die Beteiligten ihren Anteil zurück. Die Vorschläge sind so verrechnet, dass möglichst wenige Überweisungen nötig sind.</p></section>
    <section class="block"><h2>Bezahlt von</h2><div class="panel">${byPayer}</div></section>`;
}
function trip(){
  const t=T, ex=exps();
  const trips=live(S.trips).sort((a,b)=>b.start.localeCompare(a.start)).map(x=>`<button class="triprow" data-trip-id="${x.id}" aria-pressed="${x.id===S.active}">
      <span><b>${esc(x.name)}</b><small>${dfmt(x.start,{day:'numeric',month:'short',year:'numeric'})} bis ${dfmt(x.end,{day:'numeric',month:'short',year:'numeric'})}</small></span><span>${x.id===S.active?'✓':''}</span></button>`).join('');
  const usedP=id=>ex.some(e=>e.payer===id||(e.for&&e.for.includes(id)));
  const ps=people();
  const pRows=ps.map(p=>`<div class="prow"><input value="${esc(p.name)}" data-person="${p.id}" aria-label="Name">
      <button class="iconbtn" data-pdel="${p.id}" ${usedP(p.id)||ps.length<2?'disabled':''} title="${usedP(p.id)?'Kann nicht entfernt werden, weil schon Ausgaben zugeordnet sind':'Entfernen'}" aria-label="Entfernen">✕</button></div>`).join('');
  const usedC=code=>ex.some(e=>e.cur===code);
  const cRows=curs().map(c=>`<div class="currow">
      <div class="cl"><b>${esc(c.code)}</b><label class="rateline">1 € =<input data-rate="${c.code}" inputmode="decimal" value="${nin(c.rate)}" aria-label="Kurs für ${esc(c.code)}">${esc(c.code)}</label><small>übernommen am ${dfmt(c.rateDate,{day:'2-digit',month:'2-digit',year:'numeric'})}</small></div>
      <div class="row">${suggestion&&suggestion.code===c.code?'':`<button class="btn sm" data-rfetch="${c.code}">Kurs abrufen</button>`}
        <button class="iconbtn" data-cdel="${c.code}" ${usedC(c.code)?'disabled':''} title="${usedC(c.code)?'Wird schon verwendet':'Entfernen'}" aria-label="Entfernen">✕</button></div>
      ${suggestion&&suggestion.code===c.code?`<div class="suggest" style="grid-column:1/-1"><div>Vorschlag: 1 € = <b>${rateStr(suggestion.v)} ${esc(c.code)}</b><br><span class="fsub">Referenzkurs vom ${suggestion.date?dfmt(suggestion.date,{day:'2-digit',month:'2-digit',year:'numeric'}):'–'}. Er gilt erst für neue Ausgaben, wenn du ihn übernimmst.</span></div>
        <div class="row"><button class="btn primary" id="rateAccept">Kurs übernehmen</button><button class="btn" id="rateDrop">Verwerfen</button></div></div>`:''}</div>`).join('');
  const cRowsEdit=cats().map(c=>{
    const used=ex.some(e=>e.cat===c.id);
    return `<div class="catedit ${c.hidden?'hidden':''}" data-cat="${c.id}">
      <input class="emo" value="${esc(c.emoji)}" data-k="emoji" aria-label="Symbol">
      <input value="${esc(c.name)}" data-k="name" aria-label="Name">
      <input value="${nin(c.budget)}" data-k="budget" inputmode="decimal" placeholder="€" aria-label="Budget in Euro">
      <button class="iconbtn" data-catnights="${c.id}" aria-pressed="${!!c.nights}" aria-label="Nächte erfassen" title="Nächte erfassen (Preis pro Nacht)">☾</button>
      <button class="iconbtn" data-catdel="${c.id}" aria-label="${used?(c.hidden?'Einblenden':'Ausblenden'):'Löschen'}" title="${used?(c.hidden?'Einblenden':'Ausblenden (wird schon verwendet)'):'Löschen'}">${used?(c.hidden?'↺':'⊘'):'✕'}</button></div>`}).join('');
  const pers=persisted===true?'Der Speicher ist vor automatischem Löschen geschützt.':persisted===false?'Der Browser darf die Daten bei Speichermangel löschen. Installiere die App und sichere regelmäßig.':'';
  return `<section class="block" style="margin-top:0" id="tripsSec"><h2>Reisen</h2><div class="panel">${trips}
    <div style="padding:8px 0 10px"><button class="btn wide" id="tripNew">Neue Reise anlegen</button></div>
    <p class="explain" style="margin:0 0 10px">Eine neue Reise übernimmt Personen, gemeinsame Kasse und Kategorien der aktuellen Reise. Budgets und Währungen legst du neu fest.</p></div></section>
  <section class="block"><h2>Sicherung und Abgleich</h2><div class="panel">
    <div class="bkstat">Letzte Sicherung: <b>${ago(S.lastBackup)}</b>${pers?`<br><small>${pers}</small>`:''}</div>
    <div class="stack">
      <button class="btn primary wide" id="bkAll">Sicherung erstellen</button>
      <button class="btn wide" id="bkTrip">„${esc(t.name)}“ teilen</button>
      <button class="btn wide" data-import>Datei einlesen</button>
      <button class="btn wide" id="bkCsv">Als Tabelle exportieren (CSV)</button>
      ${installBtn()}
    </div>
    <p class="explain" style="margin:0 0 10px"><b>Abgleich mit der zweiten Person:</b> Teile die Reise und schicke die Datei. Die andere Person liest sie ein und schickt dir danach ihre Datei zurück, die du einliest. Beim Einlesen wird zusammengeführt: Neues kommt dazu, bei Änderungen am selben Eintrag gewinnt die neuere, Gelöschtes bleibt gelöscht. Mit einer Sicherung stellst du nach dem Neuinstallieren alles wieder her.</p>
    <p class="explain" style="margin:0 0 10px"><b>Tabelle (CSV):</b> zum Bearbeiten in Excel. „Datei einlesen“ holt die bearbeitete Tabelle in diese Reise zurück.</p></div></section>
  <section class="block"><h2>Diese Reise</h2><div class="panel">
    <div class="field"><label for="f-name">Name</label><input id="f-name" data-trip="name" value="${esc(t.name)}"></div>
    <div class="field two"><div><label for="f-start">Beginn</label><input id="f-start" type="date" data-trip="start" value="${t.start}"></div>
      <div><label for="f-end">Ende</label><input id="f-end" type="date" data-trip="end" value="${t.end}"></div></div>
    <div class="field"><label for="f-budget">Gesamtbudget in €</label><input id="f-budget" inputmode="decimal" data-trip="budget" value="${nin(t.budget)}" placeholder="z. B. 3000"></div>
  </div></section>
  <section class="block"><h2>Personen</h2><div class="panel">${pRows}
    <div class="field"><label class="check"><input type="checkbox" id="jointOn" ${t.joint.on?'checked':''}> Gemeinsame Kasse nutzen</label>
      ${t.joint.on?`<input data-joint value="${esc(t.joint.name)}" aria-label="Name der gemeinsamen Kasse">`:''}</div>
    <div style="padding:8px 0 10px"><button class="btn wide" id="pAdd">Person hinzufügen</button></div></div></section>
  <section class="block"><h2>Währungen</h2><div class="panel">
    <p class="explain" style="margin:10px 0 4px">Euro ist immer dabei. Füge alle Währungen hinzu, die unterwegs anfallen, auch beim Umstieg. Ein geänderter Kurs gilt nur für neue Ausgaben.</p>${cRows}
    <div class="curadd"><input id="cCode" placeholder="Code" maxlength="3" autocapitalize="characters" aria-label="Währungscode"><input id="cRate" inputmode="decimal" placeholder="1 € = …" aria-label="Kurs"><button class="btn" id="cAdd">Hinzufügen</button></div>
    <div class="curfetch"><button class="btn sm" id="cFetch">Kurs für den Code abrufen</button></div></div></section>
  <section class="block"><h2>Kategorien dieser Reise</h2><div class="panel">${cRowsEdit}
    <p class="explain" style="margin:4px 0 0">☾ aktiv: Bei dieser Kategorie wird die Anzahl der Nächte abgefragt und der Preis pro Nacht angezeigt.</p>
    <div style="padding:8px 0 10px"><button class="btn wide" id="catAdd">Kategorie hinzufügen</button></div></div></section>
  <section class="block"><div class="row"><button class="btn danger" id="tripDel">Diese Reise löschen</button></div></section>
  <p class="ver">Reisekasse ${esc(appVersion||'')}${appVersion?' · offline bereit':''}</p>`;
}

function bindView(){
  const all=(sel,f)=>document.querySelectorAll(sel).forEach(f);
  const on=(id,f)=>{const el=document.getElementById(id);if(el)el.onclick=f};
  const commitT=()=>{save();render()};
  all('[data-import]',b=>b.onclick=()=>$('#fileIn').click());
  all('[data-install]',b=>b.onclick=async()=>{if(!installEvt)return;const e=installEvt;installEvt=null;e.prompt();try{await e.userChoice}catch(_){}render()});
  on('wNew',()=>{const n=newTrip(null);S.trips.push(n);S.active=n.id;tab='trip';save();render();toast('Reise angelegt. Trag Name, Daten und Personen ein.');const f=document.getElementById('f-name');f&&f.focus()});
  if(!T)return;
  on('goTrips',()=>{tab='trip';render();const s=document.getElementById('tripsSec');s&&s.scrollIntoView&&s.scrollIntoView()});
  on('bkNow',()=>exportChoice('backup'));
  on('bkAll',()=>exportChoice('backup'));
  on('bkTrip',()=>exportChoice('trip'));
  on('bkCsv',()=>exportChoice('csv'));
  all('[data-filter]',b=>b.onclick=()=>{filter=b.dataset.filter||null;tab='list';render();window.scrollTo(0,0)});
  all('[data-edit]',b=>b.onclick=()=>openSheet(T.expenses.find(e=>e.id===b.dataset.edit)));
  all('[data-trip-id]',b=>b.onclick=()=>{S.active=b.dataset.tripId;filter=null;suggestion=null;save();render();toast('Reise gewechselt')});
  on('tripNew',()=>{const n=newTrip(T);S.trips.push(n);S.active=n.id;filter=null;save();render();toast('Neue Reise angelegt');const f=document.getElementById('f-name');f&&f.focus()});
  on('tripDel',()=>{if(confirm(`„${T.name}“ mit allen Ausgaben löschen?`)){T.deleted=true;touch(T);filter=null;S.active=null;tab='overview';commitT();toast('Reise gelöscht')}});
  all('[data-trip]',i=>i.onchange=()=>{
    const k=i.dataset.trip; let v=i.value.trim();
    if(k==='budget')v=pf(v);
    if((k==='start'||k==='end')&&!v){render();return}
    if(k==='name'&&!v){render();return}
    T[k]=v; if(T.end<T.start)T.end=T.start; touch(T); commitT();
  });
  all('[data-person]',i=>i.onchange=()=>{const p=person(i.dataset.person);p.name=i.value.trim()||p.name;touch(p);commitT()});
  all('[data-pdel]',b=>b.onclick=()=>{const p=person(b.dataset.pdel);p.deleted=true;touch(p);commitT()});
  on('pAdd',()=>{T.people.push({id:uid(),name:'Person '+(people().length+1),updated:now()});commitT();const ins=document.querySelectorAll('[data-person]');const l=ins[ins.length-1];l&&(l.focus(),l.select())});
  const jo=document.getElementById('jointOn'); if(jo)jo.onchange=()=>{T.joint={...T.joint,on:jo.checked};touch(T);commitT()};
  all('[data-joint]',i=>i.onchange=()=>{T.joint={...T.joint,name:i.value.trim()||T.joint.name};touch(T);commitT()});
  on('cAdd',()=>{
    const code=$('#cCode').value.trim().toUpperCase(), rate=pr($('#cRate').value);
    if(!/^[A-Z]{3}$/.test(code)){toast('Bitte einen dreistelligen Währungscode eingeben, z. B. TZS');return}
    if(code==='EUR'||curs().some(c=>c.code===code)){toast(code+' ist schon angelegt');return}
    if(!(rate>0)){toast('Bitte den Kurs eingeben: wie viel '+code+' bekommst du für 1 €?');return}
    const old=T.currencies.find(c=>c.code===code);
    if(old)Object.assign(old,{rate,rateDate:today(),deleted:false,updated:now()});
    else T.currencies.push({code,rate,rateDate:today(),updated:now()});
    /* Vor der ersten Ausgabe ist die neue Reisewährung die naheliegende Vorauswahl */
    if(!exps().length)T.lastCur=code;
    commitT();toast(code+' hinzugefügt');
  });
  on('cFetch',async function(){
    const code=$('#cCode').value.trim().toUpperCase();
    if(!/^[A-Z]{3}$/.test(code)){toast('Erst einen dreistelligen Währungscode eingeben, z. B. TZS');return}
    this.disabled=true;this.textContent='Wird abgerufen …';
    try{const r=await fetchRate(code);const inp=$('#cRate');if(inp)inp.value=nin(r.v);toast(`Kurs vom ${r.date?dfmt(r.date,{day:'2-digit',month:'2-digit'}):'heute'} eingetragen. Prüfen und „Hinzufügen“ tippen.`)}
    catch(e){toast(e.message)}
    this.disabled=false;this.textContent='Kurs für den Code abrufen';
  });
  all('[data-cdel]',b=>b.onclick=()=>{const c=T.currencies.find(x=>x.code===b.dataset.cdel);c.deleted=true;touch(c);if(T.lastCur===c.code)T.lastCur='EUR';commitT()});
  all('[data-rate]',i=>i.onchange=()=>{
    const c=T.currencies.find(x=>x.code===i.dataset.rate), v=pr(i.value);
    if(!(v>0)){render();return}
    if(v!==c.rate){c.rate=v;c.rateDate=today();touch(c);commitT();toast('Kurs geändert. Er gilt für neue Ausgaben.')}
  });
  all('[data-rfetch]',b=>b.onclick=async()=>{
    const code=b.dataset.rfetch;b.disabled=true;b.textContent='Lädt …';
    try{const r=await fetchRate(code);suggestion={code,v:r.v,date:r.date}}catch(e){toast(e.message)}
    render();
  });
  on('rateAccept',()=>{const c=T.currencies.find(x=>x.code===suggestion.code);c.rate=suggestion.v;c.rateDate=today();touch(c);suggestion=null;commitT();toast('Kurs übernommen')});
  on('rateDrop',()=>{suggestion=null;render()});
  all('.catedit input',i=>i.onchange=()=>{
    const c=T.cats.find(x=>x.id===i.closest('.catedit').dataset.cat), k=i.dataset.k;
    c[k]=k==='budget'?pf(i.value):(i.value.trim()||c[k]); touch(c); commitT();
  });
  all('[data-catnights]',b=>b.onclick=()=>{const c=T.cats.find(x=>x.id===b.dataset.catnights);c.nights=!c.nights;touch(c);commitT()});
  all('[data-catdel]',b=>b.onclick=()=>{
    const id=b.dataset.catdel, c=T.cats.find(x=>x.id===id);
    if(exps().some(e=>e.cat===id))c.hidden=!c.hidden; else c.deleted=true;
    touch(c);commitT();
  });
  on('catAdd',()=>{T.cats.push({id:uid(),emoji:'✳',name:'Neue Kategorie',budget:0,hidden:false,nights:false,updated:now()});commitT()});
}

/* ---------- Unterseite (Erfassung und Dialoge) ----------
   Die Unterseite legt einen Verlaufseintrag an, damit die Zurück-Taste unter Android
   sie schließt, statt die App zu verlassen. */
let D=null, C=null, sheetOpen=false;
function showSheet(){
  $('#sheet').classList.add('open');$('#scrim').classList.add('open');
  if(!sheetOpen){sheetOpen=true;try{history.pushState({sheet:1},'')}catch(e){}}
}
function hideSheet(){$('#sheet').classList.remove('open');$('#scrim').classList.remove('open');sheetOpen=false;D=null;C=null}
function closeSheet(){
  if(!sheetOpen)return;
  if(history.state&&history.state.sheet){hideSheet();history.back()}else hideSheet();
}
window.addEventListener('popstate',()=>{if(sheetOpen)hideSheet()});

function openChoice(opts){
  D=null;C=opts;
  $('#sheet').setAttribute('aria-label',opts.title);
  $('#sheetInner').innerHTML=`<div class="grab"></div>
    <div class="sheethead"><h3>${esc(opts.title)}</h3><button class="close" id="sClose" aria-label="Schließen">✕</button></div>
    <div class="choice">${opts.html||(opts.text?`<p>${esc(opts.text)}</p>`:'')}
      ${opts.buttons.filter(Boolean).map((b,i)=>`<button class="btn wide ${b.primary?'primary':''}" data-choice="${i}">${esc(b.label)}</button>`).join('')}</div>`;
  const btns=opts.buttons.filter(Boolean);
  $('#sClose').onclick=closeSheet;
  document.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{const f=btns[+b.dataset.choice].fn;closeSheet();f&&f()});
  showSheet();
}

function openSheet(exp){
  C=null;
  const lc=curList().includes(T.lastCur)?T.lastCur:(curs()[0]?curs()[0].code:'EUR');
  D=exp?{id:exp.id,amt:String(exp.amount).replace('.',','),cur:exp.cur,origCur:exp.cur,origRate:exp.rate,cat:exp.cat,payer:exp.payer,for:exp.shared?null:[...exp.for],method:exp.method,date:exp.date,note:exp.note||'',nights:exp.nights||1,details:false}
       :{id:null,amt:'',cur:lc,cat:null,payer:T.joint.on?'J':people()[0].id,for:null,method:'card',date:clampDate(today()),note:'',nights:1,details:false};
  $('#sheet').setAttribute('aria-label',exp?'Ausgabe bearbeiten':'Ausgabe erfassen');
  drawSheet();
  showSheet();
}
function clampDate(d){return d<T.start?T.start:d>T.end?T.end:d}
const amtVal=()=>pf(D.amt||'0');
const dRate=()=>D.id&&D.cur===D.origCur?D.origRate:rateOf(D.cur);
function drawSheet(){
  const v=amtVal(), r=dRate();
  const conv=D.cur==='EUR'?'':(v?`≈ ${eur2(v/r)} bei 1 € = ${rateStr(r)} ${esc(D.cur)}`:`1 € = ${rateStr(r)} ${esc(D.cur)}`);
  const seg=(key,opts)=>`<div class="seg">${opts.map(([val,lab])=>`<button data-set="${key}" data-val="${val}" aria-pressed="${D[key]===val}">${esc(lab)}</button>`).join('')}</div>`;
  const ps=people();
  const payers=[...(T.joint.on||D.payer==='J'?[['J',T.joint.name]]:[]),...ps.map(p=>[p.id,p.name])];
  const isAll=!D.for;
  const forChips=`<div class="seg"><button data-forall aria-pressed="${isAll}">Alle</button>${ps.map(p=>`<button data-for="${p.id}" aria-pressed="${!isAll&&D.for.includes(p.id)}">${esc(p.name)}</button>`).join('')}</div>`;
  const summary=[pName(D.payer),forLabel(D.for),D.method==='cash'?'Bar':'Karte',D.date===today()?'heute':dfmt(D.date,{day:'numeric',month:'short'})].join(', ');
  const cs=cats().filter(c=>!c.hidden||c.id===D.cat).map(c=>`<button data-cat="${c.id}" aria-pressed="${D.cat===c.id}"><span class="e">${esc(c.emoji)}</span>${esc(c.name)}</button>`).join('');
  const cl=curList(); if(!cl.includes(D.cur))cl.push(D.cur);
  $('#sheetInner').innerHTML=`<div class="grab"></div>
    <div class="sheethead"><h3>${D.id?'Ausgabe bearbeiten':'Neue Ausgabe'}</h3><button class="close" id="sClose" aria-label="Schließen">✕</button></div>
    <div class="display" id="disp"><span class="num ${D.amt?'':'zero'}">${D.amt||'0'}</span></div>
    ${cl.length>1?`<div class="curseg" role="group" aria-label="Währung">${cl.map(c=>`<button data-cur="${c}" aria-pressed="${D.cur===c}">${c}</button>`).join('')}</div>`:''}
    <div class="conv">${conv}</div>
    <input class="note" id="dNote" value="${esc(D.note)}" placeholder="Betreff (optional), z. B. Abendessen" aria-label="Betreff" enterkeyhint="done">
    <div class="keys">${['1','2','3','4','5','6','7','8','9',',','0','⌫'].map(k=>`<button data-key="${k}" aria-label="${k==='⌫'?'Löschen':k}">${k}</button>`).join('')}</div>
    <div class="details ${D.details?'open':''}"><button id="detToggle" aria-expanded="${D.details}"><span>Details</span><span>${esc(summary)} ${D.details?'▴':'▾'}</span></button>
      <div class="body">
        <div><div class="dlabel">Bezahlt von</div>${seg('payer',payers)}</div>
        <div><div class="dlabel">Für wen</div>${forChips}</div>
        <div><div class="dlabel">Zahlungsart</div>${seg('method',[['card','Karte'],['cash','Bar']])}</div>
        <div><div class="dlabel">Datum</div><input type="date" id="dDate" value="${D.date}"></div>
      </div></div>
    <div class="cathint">${D.id?'Kategorie':'Kategorie antippen, um zu speichern'}</div>
    <div class="cats">${cs}</div>
    ${nightsPanel()}
    ${D.id?`<div class="editbar"><button class="btn danger" id="sDel">Löschen</button><button class="btn primary" id="sSave">Änderungen speichern</button></div>`:''}`;
  bindSheet();
}
function nightsPanel(){
  const c=D.cat&&catOf(D.cat);
  if(!c||!c.nights||(!D.id&&!D.askNights))return '';
  const e=D.cur==='EUR'?amtVal():amtVal()/dRate();
  return `<div class="nights" id="nightsBox"><div class="top">
      <div><div class="dlabel">Anzahl Nächte</div><div class="stepper"><button data-n="-1" aria-label="Eine Nacht weniger">−</button><span>${D.nights}</span><button data-n="1" aria-label="Eine Nacht mehr">+</button></div></div>
      <div class="pn"><small>pro Nacht</small><b>${eur2(e/D.nights)}</b></div></div>
    ${D.id?'':`<button class="btn primary wide" id="sSaveN">Speichern</button>`}</div>`;
}
function bindSheet(){
  const all=(sel,f)=>document.querySelectorAll(sel).forEach(f);
  $('#sClose').onclick=closeSheet;
  all('[data-cur]',b=>b.onclick=()=>{D.cur=b.dataset.cur;drawSheet()});
  all('[data-key]',b=>b.onclick=()=>{
    const k=b.dataset.key;
    if(k==='⌫')D.amt=D.amt.slice(0,-1);
    else if(k===','){if(!D.amt.includes(','))D.amt=(D.amt||'0')+','}
    else{const dec=D.amt.split(',')[1];if(dec!==undefined&&dec.length>=2)return;if(D.amt==='0')D.amt='';if(D.amt.replace(',','').length>=9)return;D.amt+=k}
    drawSheet();
  });
  $('#detToggle').onclick=()=>{D.details=!D.details;drawSheet()};
  all('[data-set]',b=>b.onclick=()=>{D[b.dataset.set]=b.dataset.val;drawSheet()});
  all('[data-forall]',b=>b.onclick=()=>{D.for=null;drawSheet()});
  all('[data-for]',b=>b.onclick=()=>{
    const id=b.dataset.for; let f=D.for?[...D.for]:[];
    f=f.includes(id)?f.filter(x=>x!==id):[...f,id];
    D.for=!f.length||people().every(p=>f.includes(p.id))?null:f; drawSheet();
  });
  $('#dDate').onchange=e=>{if(e.target.value)D.date=e.target.value;drawSheet()};
  $('#dNote').oninput=e=>{D.note=e.target.value};
  $('#dNote').onkeydown=e=>{if(e.key==='Enter')e.target.blur()};
  all('.cats [data-cat]',b=>b.onclick=()=>{
    D.cat=b.dataset.cat;
    if(D.id){drawSheet();return}
    if(catOf(D.cat).nights&&amtVal()){D.askNights=true;drawSheet();const nb=document.getElementById('nightsBox');nb&&nb.scrollIntoView&&nb.scrollIntoView({block:'nearest',behavior:'smooth'});return}
    D.askNights=false;commit();
  });
  all('[data-n]',b=>b.onclick=()=>{D.nights=Math.max(1,Math.min(365,D.nights+Number(b.dataset.n)));drawSheet()});
  const sn=document.getElementById('sSaveN'); if(sn)sn.onclick=commit;
  const del=document.getElementById('sDel'), sv=document.getElementById('sSave');
  if(del)del.onclick=()=>{
    const e=T.expenses.find(x=>x.id===D.id);e.deleted=true;touch(e);save();closeSheet();render();
    toast('Ausgabe gelöscht',()=>{e.deleted=false;touch(e);save();render()});
  };
  if(sv)sv.onclick=commit;
}
function commit(){
  const v=amtVal();
  if(!v){const n=$('#disp');n.classList.remove('shake');void n.offsetWidth;n.classList.add('shake');return}
  if(!D.cat)return;
  const orig=D.id?T.expenses.find(x=>x.id===D.id):null;
  /* „Für alle“ ist beim ersten Speichern festgeschrieben: Wer später dazukommt, zahlt nicht rückwirkend mit */
  const forList=D.for?D.for:(orig&&orig.shared?orig.for.slice():people().map(p=>p.id));
  const rec={id:D.id||uid(),date:D.date,amount:v,cur:D.cur,rate:dRate(),cat:D.cat,payer:D.payer,for:forList,shared:!D.for,method:D.method,note:D.note.trim(),nights:catOf(D.cat).nights?D.nights:undefined,created:orig?orig.created:now(),updated:now()};
  if(orig)T.expenses[T.expenses.indexOf(orig)]=rec; else T.expenses.push(rec);
  T.lastCur=D.cur;
  save();closeSheet();render();
  toast(`${orig?'Geändert':'Gespeichert'}: ${rec.cur==='EUR'?eur2(v):num(v,v%1?2:0)+' '+rec.cur} für ${catOf(rec.cat).name}`,orig?null:()=>{rec.deleted=true;touch(rec);save();render()});
}

/* ---------- Hinweis unten ---------- */
let tt;
function toast(msg,undo){
  $('#toastText').textContent=msg;
  const u=$('#toastUndo');u.style.display=undo?'':'none';u.onclick=()=>{undo&&undo();$('#toast').classList.remove('show')};
  $('#toast').classList.add('show');clearTimeout(tt);tt=setTimeout(()=>$('#toast').classList.remove('show'),undo?6000:4000);
}

/* ---------- Start ---------- */
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;suggestion=null;render();window.scrollTo(0,0)});
$('#addBtn').onclick=()=>{if(T)openSheet(null)};
$('#scrim').onclick=closeSheet;
$('#fileIn').onchange=e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(f)importFile(f)};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sheetOpen)closeSheet()});
/* Ein zweites Fenster derselben App hat gespeichert: dessen Stand übernehmen */
window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue){try{S=JSON.parse(e.newValue);S.trips.forEach(RK.normalizeTrip);if(!sheetOpen)render()}catch(_){}}});
/* Nach Stunden im Hintergrund stimmt „heute“ sonst nicht mehr */
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!sheetOpen)render()});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;if(!sheetOpen)render()});
window.addEventListener('appinstalled',()=>{installEvt=null;if(!sheetOpen)render();toast('App installiert')});

if(navigator.storage&&navigator.storage.persist){
  navigator.storage.persisted().then(p=>p||navigator.storage.persist()).then(p=>{persisted=p;if(tab==='trip'&&!sheetOpen)render()}).catch(()=>{});
}
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').then(()=>navigator.serviceWorker.ready).then(()=>caches.keys()).then(keys=>{
    const c=keys.filter(k=>k.startsWith('reisekasse-')).sort().pop();
    if(c){appVersion=c.replace('reisekasse-','');if(tab==='trip'&&!sheetOpen)render()}
  }).catch(()=>{});
}
save();render();
})();
