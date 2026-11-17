/* PK Atlas offline shell + Web Push.
 * Only same-origin public, non-personalized static assets enter CacheStorage.
 * All /api/ traffic bypasses this worker: never cache credentials, session
 * responses, private state, medication records, or notification subscriptions.
 */
const SHELL_CACHE="pk-atlas-public-shell-v20261117-1";
const CACHE_PREFIX="pk-atlas-public-shell-";
const SHELL_ASSETS=[
  "/","/index.html",
  "/styles.css?v=offline-20261116a",
  "/api-client.js?v=autosync-20261115",
  "/app.js?v=offline-20261116a",
  // Current production solver was deployed independently after the session
  // release. Cache its exact public scripts without touching its code.
  "/app.js?v=stable-point-20261116",
  "/inverse-worker.js?v=stable-point-20261116",
  "/push.js?v=11",
  "/manifest.webmanifest","/icon-192.png","/icon-512.png",
  "/quick.html","/quick.js?v=mwg-20261115","/quick.css",
  "/notifications.html","/push-diagnostics.js?v=20261117a",
  "/data-center.html","/data-center.css?v=20261116b",
  "/data-center.js?v=20261117a","/sync-center-core.js?v=20261117a","/data-portability-core.js?v=20261116b",
  "/install.html","/install.css","/api.html","/api.css"
];
const assets=new Set(SHELL_ASSETS.map(path=>new URL(path,self.location.origin).href));
// Safe public build files may receive new version query strings before the
// Service Worker is redeployed. Cache these exact code paths only, never
// user state or any arbitrary same-origin request.
const versionedPublicCode=new Set(["/app.js","/styles.css","/inverse-worker.js"]);
self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_ASSETS);
    await self.skipWaiting();
  })());
});
self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    for(const name of await caches.keys()){
      if(name.startsWith(CACHE_PREFIX)&&name!==SHELL_CACHE)await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return;
  if(req.mode==="navigate"){
    // The home page is a public app shell with no personalized HTML. Serve
    // it immediately from the device and refresh in the background, avoiding
    // multi-second CDN latency on every home-screen launch. API remains live.
    const shellPage=new Set(["/","/index.html","/quick.html",
      "/notifications.html","/data-center.html","/install.html","/api.html"]).has(url.pathname);
    event.respondWith((async()=>{
      const cache=await caches.open(SHELL_CACHE);
      const cached=shellPage?await cache.match(url.pathname):null;
      const update=async()=>{
        const live=await fetch(req);
        if(shellPage&&live.ok&&live.headers.get("content-type")?.includes("text/html")){
          await cache.put(url.pathname,live.clone());
        }
        return live;
      };
      if(cached){
        event.waitUntil(update().catch(()=>{}));
        return cached;
      }
      try{return await update()}
      catch{
        return (await cache.match("/"))||
          new Response("离线页面尚未缓存。请联网打开一次药时后重试。",
                       {status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}});
      }
    })());
    return;
  }
  // Cache-first applies exclusively to this allowlist. Do not cache API,
  // cross-origin, or arbitrary resources fetched from user-controlled URLs.
  const publicVersion=versionedPublicCode.has(url.pathname)&&/^\?v=[A-Za-z0-9_.-]{1,80}$/.test(url.search);
  if(assets.has(url.href)||publicVersion){
    event.respondWith((async()=>{
      const cached=await caches.match(req);
      if(cached)return cached;
      const live=await fetch(req);
      if(publicVersion&&live.ok){
        const kind=live.headers.get("content-type")||"";
        if(url.pathname.endsWith(".css")?kind.includes("text/css"):kind.includes("javascript")){
          // Best-effort cache only: quota/storage failures must not break
          // an otherwise successful script fetch or the running app.
          try{
            const cache=await caches.open(SHELL_CACHE);
            await cache.put(req,live.clone());
          }catch{}
        }
      }
      return live;
    })());
  }
});
self.addEventListener("push",event=>{
  let data={};
  try{data=event.data?.json()||{}}catch{}
  const target=typeof data.url==="string"&&data.url.startsWith("/")&&!data.url.startsWith("//")?data.url:"/";
  event.waitUntil(self.registration.showNotification(data.title||"药时提醒",{
    body:data.body||"请打开药时查看。",icon:"/icon-192.png",badge:"/icon-192.png",
    tag:typeof data.tag==="string"?data.tag:"pk-atlas-test",data:{url:target}
  }));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url||"/",self.location.origin).href;
  event.waitUntil((async()=>{
    for(const client of await self.clients.matchAll({type:"window",includeUncontrolled:true})){
      if(new URL(client.url).origin===self.location.origin){
        await client.focus();
        if("navigate" in client)await client.navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
