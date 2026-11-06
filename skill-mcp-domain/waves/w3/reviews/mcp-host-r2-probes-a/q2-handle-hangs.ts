// Q2: the credential handle hangs. (a) authorize never answers: call's signal fires; close() runs.
// (b) reportRejection never answers after a 401: close() runs. (c) authorize answers after the
// signal fired: what does call report, and did anything reach the peer?
import { factory, server, race, material } from './common.ts'
const seen: string[] = []
const s = await server((req, body, res) => {
  seen.push(`${req.method} ${body?.method ?? ''}`)
  if (body?.method === 'tools/list') { res.writeHead(401, { 'www-authenticate': 'Bearer' }).end(); return }
  if (req.url?.startsWith('/.well-known')) { res.writeHead(404).end(); return }
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: body?.id, result: { content: [] } }))
})
const f = await factory()
const args = { kind: 'object', entries: [] }
{ // (a)
  const cred = { authorize: () => new Promise(() => {}), reportRejection: async () => {} }
  const t = (await f.open(material(s.url, cred), new AbortController().signal)).ok
  const ac = new AbortController()
  const call = t.call({ action: 'x', args }, ac.signal)
  const list = t.listActions()
  setTimeout(() => ac.abort(), 50)
  console.log('Q2a call() returned within 1s after its signal:', (await race(call, 1000)).settled)
  console.log('Q2a close() returned within 1s:', (await race(t.close(), 1000)).settled)
  console.log('Q2a call() returned within 1s after close():', (await race(call, 1000)).settled)
  console.log('Q2a listActions() returned within 1s after close():', (await race(list, 1000)).settled)
}
{ // (b)
  let rejections = 0
  const cred = { authorize: async (h: Headers) => { h.set('authorization', 'Bearer t'); return { ok: 'authorized' } }, reportRejection: () => { rejections += 1; return new Promise(() => {}) } }
  const t = (await f.open(material(s.url, cred), new AbortController().signal)).ok
  const list = t.listActions()
  await new Promise(r => setTimeout(r, 300))
  console.log('Q2b reportRejection calls:', rejections)
  console.log('Q2b close() returned within 2s:', (await race(t.close(), 2000)).settled)
  console.log('Q2b listActions() returned within 1s after close():', (await race(list, 1000)).settled)
}
{ // (c)
  seen.length = 0
  let release: () => void = () => {}
  const cred = { authorize: (h: Headers) => new Promise(r => { release = () => r({ ok: 'authorized' }) }), reportRejection: async () => {} }
  const t = (await f.open(material(s.url, cred), new AbortController().signal)).ok
  const ac = new AbortController()
  const call = t.call({ action: 'x', args }, ac.signal)
  await new Promise(r => setTimeout(r, 50)); ac.abort(); release()
  const r = await race(call, 1000) as any
  console.log('Q2c call():', JSON.stringify(r.v), r.v?.ok ? JSON.stringify(await r.v.ok.answer) : '', '| peer saw:', JSON.stringify(seen))
  await t.close()
}
s.close(); process.exit(0)
