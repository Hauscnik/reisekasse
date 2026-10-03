/* Reisekasse – Rechenlogik ohne Oberfläche: Kontoinhaber, Budget-Sichten und Abrechnung.
   Sicht 'joint': was die Kontoinhaber der gemeinsamen Kasse zusammen ausgeben (ihr Anteil an allem,
   an dem alle Inhaber beteiligt sind). Sicht 'group': Ausgaben für alle, voll. */
(function(root){
'use strict';
const live=a=>(a||[]).filter(x=>!x.deleted);
const toEUR=e=>e.cur==='EUR'?e.amount:e.amount/e.rate;
const peopleIds=t=>live(t.people).map(p=>p.id);
const forIds=(t,e)=>e.for&&e.for.length?e.for:peopleIds(t);

/* Inhaber der gemeinsamen Kasse, nur lebende Personen, in der Reihenfolge der Personenliste.
   Fehlt die Angabe (ältere Daten), sind alle Personen Inhaber. */
function members(t){
  const ids=peopleIds(t), m=t.joint&&Array.isArray(t.joint.members)?t.joint.members:ids;
  return ids.filter(id=>m.includes(id));
}
/* Nur wenn ein Teil der Personen Inhaber ist, unterscheiden sich die beiden Sichten. */
function viewsDiffer(t){
  const n=members(t).length;
  return !!(t.joint&&t.joint.on)&&n>0&&n<peopleIds(t).length;
}
function budgetMode(t){
  return t.joint&&t.joint.on&&members(t).length&&t.budgetFor!=='group'?'joint':'group';
}
/* Sichten, zwischen denen die App umschalten kann */
const modes=t=>viewsDiffer(t)?['joint','group']:[budgetMode(t)];

/* Sind alle Inhaber an der Ausgabe beteiligt? „Für alle“ ist beim Speichern festgeschrieben: Kam ein Inhaber
   erst später dazu, gilt die Ausgabe trotzdem als für alle Inhaber, er zahlt aber nicht rückwirkend mit. */
const allHolders=(m,e,f)=>m.length>0&&(!!e.shared||m.every(id=>f.includes(id)));

/* Wert einer Ausgabe in EUR in der Sicht `mode`: in 'joint' der Anteil der beteiligten Inhaber */
function value(t,e,mode){
  if(mode==='group')return e.shared?toEUR(e):0;
  const m=members(t), f=forIds(t,e);
  if(!allHolders(m,e,f))return 0;
  return toEUR(e)*m.filter(id=>f.includes(id)).length/f.length;
}
/* Zählt die Ausgabe in mindestens einer Sicht? (Tagesbudget-Einstellung ist dann sinnvoll) */
const counts=(t,e)=>modes(t).some(m=>value(t,e,m)>0);

/* Abrechnung für beliebig viele Personen: Salden bilden, dann mit möglichst wenigen Zahlungen ausgleichen.
   Zahlt die Kasse ('J') und sind alle Inhaber beteiligt, sind die Anteile der Inhaber neutral.
   Alle anderen Anteile gehen an die Kasse zurück. */
function settlement(t){
  const m=members(t), bal={J:0};
  peopleIds(t).forEach(id=>bal[id]=0);
  const add=(k,v)=>{bal[k]=(bal[k]||0)+v};
  for(const e of live(t.expenses)){
    const v=toEUR(e), parts=forIds(t,e), share=v/parts.length;
    if(e.payer==='J'){
      const allM=allHolders(m,e,parts);
      parts.forEach(id=>{if(allM&&m.includes(id))return;add('J',share);add(id,-share)});
      continue;
    }
    add(e.payer,v);
    parts.forEach(id=>add(id,-share));
  }
  const cred=Object.entries(bal).filter(([,v])=>v>0.005).map(([k,v])=>({k,v})).sort((a,b)=>b.v-a.v);
  const debt=Object.entries(bal).filter(([,v])=>v<-0.005).map(([k,v])=>({k,v:-v})).sort((a,b)=>b.v-a.v);
  const tr=[]; let i=0,j=0;
  while(i<debt.length&&j<cred.length){
    const x=Math.min(debt[i].v,cred[j].v);
    tr.push({from:debt[i].k,to:cred[j].k,v:x});
    debt[i].v-=x;cred[j].v-=x;
    if(debt[i].v<0.005)i++; if(cred[j].v<0.005)j++;
  }
  return tr;
}

root.RKCALC={toEUR,forIds,members,viewsDiffer,budgetMode,modes,value,counts,settlement};
})(typeof window!=='undefined'?window:globalThis);
