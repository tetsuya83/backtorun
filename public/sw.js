const V = 'btr-v1'
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(V).then(c => c.addAll(['/', '/manifest.webmanifest']))) })
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== V && k !== 'btr-share') await caches.delete(k)
  await self.clients.claim()
})()))
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url)
  if (e.request.method === 'POST' && u.pathname === '/share-fit') {
    e.respondWith((async () => {
      const f = (await e.request.formData()).get('file')
      if (f) await (await caches.open('btr-share')).put('/shared.fit', new Response(f, { headers: { 'x-name': encodeURIComponent(f.name || 'attivita.fit') } }))
      return Response.redirect('/?shared=1#/registra', 303)
    })())
    return
  }
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(r => { caches.open(V).then(c => c.put('/', r.clone())); return r.clone() }).catch(() => caches.match('/')))
    return
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)) }
    return r
  })))
})
