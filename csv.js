/* Reisekasse – Tabelle (CSV) für Excel: Export einer Reise und Wiedereinlesen nach dem Bearbeiten.
   Zeilen mit bekannter ID ändern den Eintrag, Zeilen ohne ID kommen dazu, „x“ in „Löschen“ löscht.
   Zeilen, die in der Datei fehlen, bleiben in der App erhalten. */
(function(root){
'use strict';
const COLS=['ID','Datum','Betrag','Währung','Kurs (1 € =)','Betrag in €','Kategorie','Betreff','Bezahlt von','Für','Zahlungsart','Nächte','Löschen'];
const ALIAS={id:['id'],date:['datum'],amount:['betrag'],cur:['währung','waehrung'],rate:['kurs (1 € =)','kurs'],
  cat:['kategorie'],note:['betreff'],payer:['bezahlt von'],for:['für','fuer'],method:['zahlungsart'],nights:['nächte','naechte'],del:['löschen','loeschen']};
const pad=n=>String(n).padStart(2,'0');
const lc=s=>String(s??'').trim().toLowerCase();
const dec=v=>String(v).replace('.',',');

/* ---------- Export ---------- */
function cell(v){
  const s=String(v??'');
  return /[";\n\r]/.test(s)||/^\s|\s$/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function exportTrip(t){
  const live=a=>a.filter(x=>!x.deleted);
  const pName=id=>id==='J'?t.joint.name:((t.people.find(p=>p.id===id)||{}).name||'');
  const cName=id=>(t.cats.find(c=>c.id===id)||{}).name||'';
  const rows=live(t.expenses).slice().sort((a,b)=>a.date.localeCompare(b.date)||(a.created||0)-(b.created||0)).map(e=>{
    const [y,m,d]=e.date.split('-');
    const eurV=e.cur==='EUR'?e.amount:e.amount/e.rate;
    return [e.id,`${d}.${m}.${y}`,dec(e.amount),e.cur,e.cur==='EUR'?'':dec(e.rate),eurV.toFixed(2).replace('.',','),cName(e.cat),e.note||'',
      pName(e.payer),e.shared?'alle':e.for.map(pName).join(', '),e.method==='cash'?'Bar':'Karte',e.nights>0?e.nights:'',''];
  });
  /* BOM, damit Excel Umlaute richtig liest; Semikolon und Dezimalkomma wie im deutschen Excel */
  return '﻿'+[COLS,...rows].map(r=>r.map(cell).join(';')).join('\r\n')+'\r\n';
}

/* ---------- Einlesen ---------- */
function detectSep(text){
  const line=text.split(/\r?\n/)[0]||'';
  const n=c=>line.split(c).length;
  return [';','\t',','].sort((a,b)=>n(b)-n(a))[0];
}
function parse(text){
  text=String(text).replace(/^﻿/,'');
  const sep=detectSep(text), rows=[]; let row=[], f='', q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){
      if(c==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}
      else f+=c;
    }
    else if(c==='"')q=true;
    else if(c===sep){row.push(f);f=''}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(f);rows.push(row);row=[];f=''}
    else f+=c;
  }
  if(f!==''||row.length){row.push(f);rows.push(row)}
  return rows.filter(r=>r.some(x=>x.trim()!==''));
}
function parseDate(s){
  s=String(s).trim(); let y,m,d,r;
  if((r=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)))[y,m,d]=[+r[1],+r[2],+r[3]];
  else if((r=s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/)))[d,m,y]=[+r[1],+r[2],r[3].length===2?2000+ +r[3]:+r[3]];
  else return null;
  const dt=new Date(y,m-1,d);
  if(dt.getFullYear()!==y||dt.getMonth()!==m-1||dt.getDate()!==d)return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
/* Betrag: Komma ist Dezimalzeichen; Punkte nur als Tausendertrennung wie in 1.500 */
function parseAmount(v){
  let s=String(v).trim().replace(/\s|€/g,'');
  if(!s)return NaN;
  if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
  return /^-?\d+(\.\d+)?$/.test(s)?parseFloat(s):NaN;
}
function parseRate(v){
  let s=String(v).trim().replace(/\s/g,'');
  if(!s)return NaN;
  if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
  return /^\d+(\.\d+)?$/.test(s)?parseFloat(s):NaN;
}
const isJointName=(t,n)=>lc(n)===lc(t.joint.name)||/^(gemeinsame kasse|gemeinschaftskonto)$/i.test(String(n).trim());

/* Liest die Tabelle in die Reise t ein. env: {uid, now}. Bei Fehlern bleibt t unverändert. */
function apply(t,text,env){
  const rows=parse(text);
  if(!rows.length)return {errors:['Die Tabelle ist leer.']};
  const head=rows[0].map(lc), idx={};
  for(const [k,names] of Object.entries(ALIAS))idx[k]=head.findIndex(h=>names.includes(h));
  if(idx.date<0||idx.amount<0||idx.cat<0)return {errors:['Das ist keine Tabelle der Reisekasse. Es fehlen die Spalten Datum, Betrag oder Kategorie.']};
  const get=(r,k)=>idx[k]<0?'':String(r[idx[k]]??'').trim();
  const names=s=>s.split(/[,;]/).map(x=>x.trim()).filter(Boolean);
  const byId=new Map(t.expenses.map(e=>[e.id,e]));
  const knownRate=code=>(t.currencies.find(c=>c.code===code)||{}).rate;
  const errors=[], items=[];

  /* 1. Prüfen, ohne etwas zu ändern */
  rows.slice(1).forEach((r,i)=>{
    const line=i+2, err=m=>errors.push(`Zeile ${line}: ${m}`);
    const id=get(r,'id'), del=/^(x|ja|j|yes|1)$/i.test(get(r,'del'));
    if(del){items.push({line,id,del});return}
    const date=parseDate(get(r,'date'));
    if(!date)return err(`Datum „${get(r,'date')}“ nicht lesbar (erwartet z. B. 24.09.2026).`);
    const amount=parseAmount(get(r,'amount'));
    if(!(amount>0))return err(`Betrag „${get(r,'amount')}“ ist keine positive Zahl.`);
    const cur=(get(r,'cur')||'EUR').toUpperCase();
    if(!/^[A-Z]{3}$/.test(cur))return err(`Währung „${cur}“ ist kein dreistelliger Code.`);
    let rate=1;
    if(cur!=='EUR'){
      const given=parseRate(get(r,'rate')), old=id&&byId.get(id);
      rate=given>0?given:(old&&old.cur===cur?old.rate:knownRate(cur));
      if(!(rate>0))return err(`Für ${cur} fehlt der Kurs (Spalte „Kurs (1 € =)“).`);
    }
    const cat=get(r,'cat');
    if(!cat)return err('Kategorie fehlt.');
    const nRaw=get(r,'nights'), nights=nRaw?parseInt(nRaw,10):0;
    if(nRaw&&!(nights>=1&&nights<=365&&String(nights)===nRaw))return err(`Nächte „${nRaw}“ ist keine ganze Zahl.`);
    const forRaw=get(r,'for');
    items.push({line,id,date,amount,cur,rate,cat,note:get(r,'note'),payer:get(r,'payer'),
      all:!forRaw||/^(alle|für alle)$/i.test(forRaw),forNames:names(forRaw),cash:/^bar/i.test(get(r,'method')),nights});
  });
  if(errors.length)return {errors};

  /* 2. Übernehmen */
  const ts=env.now(), made={cats:[],people:[],currencies:[]};
  const st={added:0,changed:0,deleted:0,same:0,duplicate:0,skipped:0};
  const findPerson=n=>{
    const hit=t.people.find(p=>!p.deleted&&lc(p.name)===lc(n))||t.people.find(p=>lc(p.name)===lc(n));
    if(hit){if(hit.deleted){hit.deleted=false;hit.updated=ts}return hit.id}
    const p={id:env.uid(),name:n.trim(),updated:ts};t.people.push(p);made.people.push(p.name);return p.id;
  };
  const payerId=n=>{
    if(!n)return t.joint.on?'J':(t.people.find(p=>!p.deleted)||{id:findPerson('Person 1')}).id;
    return isJointName(t,n)?'J':findPerson(n);
  };
  const findCat=(n,nights)=>{
    let c=t.cats.find(x=>!x.deleted&&lc(x.name)===lc(n))||t.cats.find(x=>lc(x.name)===lc(n));
    if(c&&c.deleted){c.deleted=false;c.updated=ts}
    if(!c){c={id:env.uid(),emoji:'•',name:n.trim(),budget:0,hidden:false,nights:nights>0,updated:ts};t.cats.push(c);made.cats.push(c.name)}
    return c;
  };
  const ensureCur=(code,rate)=>{
    if(code==='EUR')return;
    const c=t.currencies.find(x=>x.code===code);
    if(c&&!c.deleted)return;
    if(c)Object.assign(c,{deleted:false,rate,updated:ts});
    else t.currencies.push({code,rate,rateDate:new Date(ts).toISOString().slice(0,10),updated:ts});
    made.currencies.push(code);
  };
  /* Namen zuerst anlegen, damit „alle“ bei neuen Zeilen auch neu hinzugekommene Personen umfasst */
  items.forEach(it=>{if(!it.del){if(it.payer&&!isJointName(t,it.payer))findPerson(it.payer);it.forNames.forEach(n=>{if(!it.all&&!isJointName(t,n))findPerson(n)})}});
  const allIds=()=>t.people.filter(p=>!p.deleted).map(p=>p.id);
  const norm=(o,k)=>k==='note'?(o.note||''):(o[k]??null);
  const sameExp=(a,b)=>['date','amount','cur','rate','cat','payer','shared','method','note','nights'].every(k=>norm(a,k)===norm(b,k))&&JSON.stringify(a.for)===JSON.stringify(b.for);

  items.forEach((it,n)=>{
    const old=it.id?byId.get(it.id):null;
    if(it.del){
      if(old&&!old.deleted){old.deleted=true;old.updated=ts;st.deleted++}else st.skipped++;
      return;
    }
    if(old&&old.deleted){st.skipped++;return}
    const c=findCat(it.cat,it.nights);
    ensureCur(it.cur,it.rate);
    const rec={date:it.date,amount:it.amount,cur:it.cur,rate:it.cur==='EUR'?1:it.rate,cat:c.id,payer:payerId(it.payer),
      for:it.all?(old&&old.shared?old.for.slice():allIds()):it.forNames.filter(x=>!isJointName(t,x)).map(findPerson),
      shared:it.all,method:it.cash?'cash':'card',note:it.note,nights:c.nights&&it.nights>0?it.nights:(c.nights?1:undefined)};
    if(!rec.for.length){rec.for=allIds();rec.shared=true}
    if(old){
      if(sameExp(old,rec)){st.same++;return}
      Object.assign(old,rec,{updated:ts});if(rec.nights===undefined)delete old.nights;st.changed++;return;
    }
    const dup=t.expenses.find(e=>!e.deleted&&e.date===rec.date&&e.amount===rec.amount&&e.cur===rec.cur&&e.cat===rec.cat&&e.note===rec.note&&e.payer===rec.payer);
    if(dup){st.duplicate++;return}
    const e={id:it.id&&!byId.has(it.id)?it.id:env.uid(),...rec,created:ts+n,updated:ts};
    if(e.nights===undefined)delete e.nights;
    t.expenses.push(e);byId.set(e.id,e);st.added++;
  });
  return {errors:[],stats:st,made};
}

root.RKCSV={COLS,exportTrip,parse,apply,parseDate,parseAmount};
})(typeof window!=='undefined'?window:globalThis);
