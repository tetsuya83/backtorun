const V = 'btr-v3'
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
    // con rete lenta non si aspetta: dopo 2,5 secondi si apre la copia salvata, la nuova arriva alla prossima apertura
    const net = fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put('/', c)) } return r })
    e.respondWith((async () => {
      net.catch(() => {})
      const saved = await caches.match('/')
      if (!saved) return net
      const slow = new Promise(ok => setTimeout(() => ok(saved), 2500))
      return Promise.race([net.catch(() => saved), slow])
    })())
    return
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)) }
    return r
  })))
})
// Notifica della domenica: arriva senza contenuto, il testo è sempre lo stesso.
self.addEventListener('push', e => e.waitUntil(self.registration.showNotification('BackToRun', { body: "Com'è andata la settimana? Apri il riepilogo e guarda cosa ti aspetta.", icon: '/icon-192.png', badge: '/icon-192.png', tag: 'settimana' })))
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const w = all.find(c => new URL(c.url).origin === location.origin)
    if (w) { await w.focus(); return w.navigate('/#/home') }
    return self.clients.openWindow('/#/home')
  })())
})
