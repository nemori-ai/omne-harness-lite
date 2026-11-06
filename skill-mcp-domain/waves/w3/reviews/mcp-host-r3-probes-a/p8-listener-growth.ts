// P8: every write nobody waits for (notification, answer to a peer request) adds an abort listener to the session-wide closing signal.
import { getEventListeners } from 'node:events'
import { factory, server, material } from './common.ts'
const warnings: string[] = []
process.on('warning', w => warnings.push(w.name + ': ' + w.message.slice(0, 90)))
const s = await server((req, body, res) => { res.writeHead(202).end() })
const f = await factory()
const t = (await f.open(material(s.url), new AbortController().signal)).ok as any
for (let i = 0; i < 50; i++) await t.cancelRequest('r' + i) // modern HTTP: no pending -> no-op; use legacy flag to send notifications
t.legacy = true
for (let i = 0; i < 50; i++) await t.cancelRequest('r' + i)
await new Promise(r => setTimeout(r, 200))
console.log('P8 abort listeners on the closing signal after 50 notifications/cancelled:', getEventListeners(t.closing.signal, 'abort').length)
console.log('P8 warnings:', warnings.join(' | ') || 'none')
await t.close(); s.close()
