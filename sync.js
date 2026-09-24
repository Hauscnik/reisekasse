/* Reisekasse – Dateiformat und Zusammenführen zweier Kassenbücher.
   Jedes Objekt (Reise, Person, Kategorie, Währung, Ausgabe) trägt `updated` (ms seit 1970).
   Beim Zusammenführen gewinnt pro Objekt die neuere Fassung. Gelöschtes bleibt mit
   `deleted: true` stehen, damit es beim nächsten Abgleich nicht wieder auftaucht. */
(function(root){
'use strict';
const APP='reisekasse', FORMAT=1;
const META=['name','start','end','budget','joint','deleted','created','updated'];
const LISTS=[['people','id'],['cats','id'],['currencies','code'],['expenses','id']];
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const clone=o=>JSON.parse(JSON.stringify(o));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const pick=(o,keys)=>{const r={};keys.forEach(k=>{if(o[k]!==undefined)r[k]=o[k]});return r};

/* true, wenn `inc` die lokale Fassung ersetzt. Bei gleicher Zeit entscheidet ein fester
   Vergleich, damit beide Geräte zum selben Ergebnis kommen. */
function wins(inc,loc){
  const a=inc.updated||0,b=loc.updated||0;
  if(a!==b)return a>b;
  return JSON.stringify(inc)>JSON.stringify(loc);
}

function mergeList(loc,inc,key){
  const out=loc.slice(), idx=new Map(out.map((o,i)=>[o[key],i]));
  const st={added:0,changed:0,deleted:0};
  for(const o of inc){
    const i=idx.get(o[key]);
    if(i===undefined){idx.set(o[key],out.length);out.push(clone(o));if(!o.deleted)st.added++;continue}
    const l=out[i];
    if(!wins(o,l)||same(o,l))continue;
    out[i]=clone(o);
    if(o.deleted&&!l.deleted)st.deleted++;
    else if(!o.deleted&&l.deleted)st.added++;
    else st.changed++;
  }
  return {list:out,st};
}

/* Personen, Kategorien und Währungen, auf die eine gültige Ausgabe verweist, bleiben erhalten –
   auch wenn sie auf dem anderen Gerät gelöscht wurden. */
function revive(t){
  const back=(list,key,id,ts)=>{const o=list.find(x=>x[key]===id);if(o&&o.deleted){o.deleted=false;o.updated=Math.max(o.updated||0,ts)}};
  for(const e of t.expenses){
    if(e.deleted)continue;
    const ts=e.updated||0;
    if(e.payer!=='J')back(t.people,'id',e.payer,ts);
    (e.for||[]).forEach(id=>back(t.people,'id',id,ts));
    back(t.cats,'id',e.cat,ts);
    if(e.cur!=='EUR')back(t.currencies,'code',e.cur,ts);
  }
  if(t.deleted){
    const newest=Math.max(0,...LISTS.flatMap(([k])=>t[k].map(o=>o.updated||0)));
    if(newest>(t.updated||0)){t.deleted=false;t.updated=newest}
  }
  return t;
}

function mergeTrip(loc,inc){
  const t={...loc}, st={settings:false,added:0,changed:0,deleted:0};
  const lm=pick(loc,META), im=pick(inc,META);
  if(wins(im,lm)&&!same(im,lm)){META.forEach(k=>{if(k in im)t[k]=clone(im[k]);else delete t[k]});st.settings=true}
  for(const [k,key] of LISTS){
    const r=mergeList(loc[k],inc[k],key);
    t[k]=r.list;
    if(k==='expenses'){st.added=r.st.added;st.changed=r.st.changed;st.deleted=r.st.deleted}
    else if(r.st.added||r.st.changed||r.st.deleted)st.settings=true;
  }
  return {trip:revive(t),st};
}

/* Führt die Reisen einer eingelesenen Datei in den Zustand S ein. Gibt je Reise eine Zusammenfassung zurück. */
function mergeState(S,data){
  const res=[];
  for(const inc of data.trips){
    const i=S.trips.findIndex(t=>t.id===inc.id);
    if(i<0){
      if(inc.deleted)continue;
      const t=normalizeTrip(clone(inc));
      S.trips.push(t);
      res.push({id:t.id,name:t.name,isNew:true,count:t.expenses.filter(e=>!e.deleted).length});
      continue;
    }
    const old=S.trips[i], {trip,st}=mergeTrip(old,inc);
    S.trips[i]=trip;
    res.push({id:trip.id,name:trip.name,removed:!!trip.deleted&&!old.deleted,restored:!trip.deleted&&!!old.deleted,...st});
  }
  return res;
}

/* Ergänzt fehlende Felder, z. B. bei Dateien älterer Versionen. */
function normalizeTrip(t){
  LISTS.forEach(([k])=>{if(!Array.isArray(t[k]))t[k]=[]});
  if(!t.joint)t.joint={on:true,name:'Gemeinschaftskonto'};
  if(!t.lastCur)t.lastCur='EUR';
  if(t.budget==null)t.budget=0;
  const ids=t.people.filter(p=>!p.deleted).map(p=>p.id);
  t.expenses.forEach(e=>{
    if(e.shared===undefined)e.shared=!e.for||ids.every(id=>e.for.includes(id));
    if(!e.for||!e.for.length)e.for=ids.slice();
  });
  return t;
}

function makeFile(trips,kind){
  return JSON.stringify({app:APP,format:FORMAT,kind,exported:new Date().toISOString(),trips});
}

function parseFile(text){
  const bad=()=>new Error('Die Datei ist beschädigt oder unvollständig.');
  let d;
  try{d=JSON.parse(String(text).replace(/^﻿/,''))}catch(e){throw new Error('Das ist keine Datei der Reisekasse.')}
  if(!d||d.app!==APP||!Array.isArray(d.trips))throw new Error('Das ist keine Datei der Reisekasse.');
  if(d.format>FORMAT)throw new Error('Die Datei stammt aus einer neueren Version der App. Bitte zuerst die App aktualisieren.');
  for(const t of d.trips){
    if(!t||typeof t.id!=='string'||typeof t.name!=='string'||!DATE.test(t.start)||!DATE.test(t.end))throw bad();
    for(const [k,key] of LISTS){
      if(t[k]===undefined)continue;
      if(!Array.isArray(t[k])||t[k].some(o=>!o||typeof o[key]!=='string'))throw bad();
    }
    for(const e of t.expenses||[]){
      if(e.deleted)continue;
      if(!Number.isFinite(e.amount)||!(e.rate>0)||!DATE.test(e.date)||typeof e.cat!=='string'||typeof e.cur!=='string')throw bad();
    }
    normalizeTrip(t);
  }
  return d;
}

root.RK={APP,FORMAT,wins,mergeList,mergeTrip,mergeState,normalizeTrip,revive,makeFile,parseFile};
})(typeof window!=='undefined'?window:globalThis);
