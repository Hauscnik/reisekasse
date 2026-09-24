/* Reisekasse – Offline-Funktion.
   Bei jeder Änderung an einer App-Datei VERSION erhöhen, sonst bekommen die Handys das Update nicht. */
const VERSION='1.1.0';
const CACHE='reisekasse-'+VERSION;
const FILES=['./','index.html','style.css','app.js','sync.js','csv.js','manifest.webmanifest',
  'fonts/figtree-latin-wght-normal.woff2',
  'icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png','icons/apple-touch-icon.png','icons/favicon-32.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(f=>new Request(f,{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('reisekasse-')&&k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});
/* Nur die App selbst kommt aus dem Speicher. Anfragen an andere Adressen (Kursdienst) gehen direkt ins Netz. */
self.addEventListener('fetch',e=>{
  const req=e.request, url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin)return;
  if(req.mode==='navigate'&&(url.pathname.endsWith('/')||url.pathname.endsWith('/index.html'))){
    e.respondWith(caches.match('index.html',{cacheName:CACHE}).then(r=>r||fetch(req)));
    return;
  }
  e.respondWith(caches.match(req,{ignoreSearch:true,cacheName:CACHE}).then(r=>r||fetch(req)));
});
