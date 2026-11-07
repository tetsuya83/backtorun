/* Notifica della domenica: iscrizione del telefono o del computer. */
import { call } from './api'

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const bytes = (s: string) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)) }
export async function currentSub() { if (!pushSupported()) return null; const r = await navigator.serviceWorker.getRegistration(); return r ? r.pushManager.getSubscription() : null }
export async function enablePush() {
  if (!pushSupported()) throw new Error('Questo browser non riceve notifiche. Su Android installa l\'app dal menu di Chrome.')
  if (await Notification.requestPermission() !== 'granted') throw new Error('Notifiche non permesse. Puoi attivarle nelle impostazioni del browser per questo sito.')
  const reg = await navigator.serviceWorker.ready, { key } = await call<{ key: string }>('GET', '/api/push/key')
  const sub = await reg.pushManager.getSubscription() ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(key) })
  await call('PUT', '/api/push/sub', { sub: { endpoint: sub.endpoint } })
}
export async function disablePush() {
  const sub = await currentSub()
  if (!sub) return
  await call('DELETE', '/api/push/sub', { endpoint: sub.endpoint }).catch(() => null)
  await sub.unsubscribe().catch(() => false)
}
