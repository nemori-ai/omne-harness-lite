// Reviewer probes, round 4 (not part of the delivery).
import { expect, it } from 'vitest'
import { correlationKeyOf, endpointRefOf, actionNameOf, jsonOf, requestStateOf, taskIdOf, type PeerReply } from '@omne-harness/mcp-contract/testing'
const T = process.env.PROBE_TESTS ?? '/tmp/r4a/src/packages/mcp/mcp/tests'
const { deferred } = await import(`${T}/doubles/deferred.ts`)
const { alice } = await import(`${T}/doubles/identities.ts`)
const { completed, listing, peer, services, text, taskHandle, taskStatus } = await import(`${T}/doubles/peer.ts`)
const { adoptStdio } = await import(`${T}/doubles/world.ts`)
const { reshapedTransports } = await import(`${T}/doubles/transports.ts`)

const files = endpointRefOf('files')
const READ = actionNameOf('read')
const ASKS: PeerReply = { kind: 'result', result: { resultType: 'input_required', requestState: 's1', inputRequests: { q: 1 } } }

function wrap(obj: any, name: string, methods: string[], log: string[], shut: () => boolean, stall?: { which: string; gate?: any; reached?: any }) {
  const out: any = Object.create(null)
  for (const k of Object.keys(obj)) out[k] = obj[k]
  for (const m of methods) {
    const orig = obj[m].bind(obj)
    out[m] = async (...a: any[]) => {
      log.push(`${name}.${m} shut=${shut()}`)
      if (stall && stall.which === `${name}.${m}` && stall.gate) { const g = stall.gate; stall.gate = undefined; stall.reached.resolve(); await g.promise }
      return orig(...a)
    }
  }
  return out
}

async function arrange(calls: any, tasks?: any, opts: { adopt?: boolean } = {}) {
  const p = peer({ listing: { '': listing([{ name: 'read' }]) }, calls, ...(tasks ? { tasks } : {}) })
  if (opts.adopt !== false) adoptStdio(p, files)
  const log: string[] = []
  let shut = () => false
  const sh = () => shut()
  const stall: any = { which: '' }
  const ports = {
    ...p.ports,
    store: wrap(p.ports.store, 'store', ['read', 'write'], log, sh, stall),
    adoption: wrap(p.ports.adoption, 'adoption', ['endpoint', 'endpoints'], log, sh, stall),
    eligibility: wrap(p.ports.eligibility, 'eligibility', ['check'], log, sh, stall),
    credentials: wrap(p.ports.credentials, 'credentials', ['acquire'], log, sh, stall),
    landing: wrap(p.ports.landing, 'landing', ['start'], log, sh, stall),
    transports: reshapedTransports(p.ports.transports, t => {
      const r: any = {}
      for (const m of ['discover', 'listActions', 'call', 'cancelRequest', 'getTask', 'updateTask', 'getTaskResult', 'cancelTask'])
        r[m] = (...a: any[]) => { log.push(`transport.${m} shut=${sh()}`); if (m === 'call') (r as any).lastRequest = a[0]; seen.push({ m, a }); return (t as any)[m](...a) }
      return r
    }),
  }
  const seen: any[] = []
  const { services: s, table } = services({ ...p, ports })
  shut = () => table.isShut()
  return { p, s, table, log, seen, stall, arm(which: string) { stall.which = which; stall.gate = deferred(); stall.reached = deferred(); return stall } }
}

async function published(c: any) {
  expect(await c.s.discovery.refresh(alice, { ref: files })).toMatchObject({ ok: { kind: 'published' } })
  const cur = await c.s.discovery.current(alice, files)
  return cur.ok.actions[0]!.definitionDigest
}

const after = (log: string[]) => log.filter(l => l.endsWith('shut=true'))

it('R4-1 sweep: closeAll k microtasks after each operation; ports entered after shut, and the answer', async () => {
  const ops = ['invoke-fresh', 'invoke-reused', 'continue', 'queryTask-reused', 'queryTask-built', 'provideTaskInput-reused', 'refresh'] as const
  for (const op of ops) {
    const summary: Record<string, number> = {}
    let k = 0
    for (; k < 400; k++) {
      const c = await arrange({ read: op === 'continue' ? [ASKS, completed([text('d')])] : taskHandle('t1') }, { t1: { get: taskStatus('t1', 'working'), update: { kind: 'accepted' } } })
      const digest = await published(c)
      let issuedAt: any
      if (op === 'continue' || op.startsWith('queryTask') || op.startsWith('provide')) {
        const first = await c.s.invoker.invoke(alice, { ref: files, action: READ, args: jsonOf({}), expectedDefinition: digest, correlationKey: correlationKeyOf('c0'), signal: new AbortController().signal })
        if (first.kind !== 'sent') throw new Error('first not sent ' + JSON.stringify(first))
        issuedAt = first.outcome.issuedAt
      }
      if (op === 'invoke-fresh' || op === 'queryTask-built') await c.s.connections.release(alice, files)
      c.log.length = 0
      const task = { ref: files, taskId: taskIdOf('t1'), issuedAt }
      const pending: Promise<any> =
        op === 'invoke-fresh' || op === 'invoke-reused' ? c.s.invoker.invoke(alice, { ref: files, action: READ, args: jsonOf({}), expectedDefinition: digest, correlationKey: correlationKeyOf('c1'), signal: new AbortController().signal })
        : op === 'continue' ? c.s.invoker.continueWithInput(alice, { ref: files, action: READ, args: jsonOf({}), issuedAt, requestState: requestStateOf('s1'), correlationKey: correlationKeyOf('c1'), signal: new AbortController().signal })
        : op.startsWith('queryTask') ? c.s.invoker.queryTask(alice, task)
        : op.startsWith('provide') ? c.s.invoker.provideTaskInput(alice, task, jsonOf({ a: 1 }))
        : c.s.discovery.refresh(alice, { ref: files })
      for (let i = 0; i < k; i++) await Promise.resolve()
      const closing = c.s.connections.closeAll()
      const r = await pending
      await closing.catch(() => undefined)
      const bad = after(c.log)
      const sentBefore = c.log.some(l => /transport\.(call|getTask|updateTask) shut=false/.test(l)) || (op === 'refresh' && c.log.some(l => l === 'store.write shut=false'))
      const key = `${JSON.stringify(r).slice(0, 110)} | after=${JSON.stringify(bad)}`
      summary[key] = (summary[key] ?? 0) + 1
      if (sentBefore) break
    }
    console.log(`R4-1 ${op} stopped at k=${k}`)
    for (const [key, n] of Object.entries(summary)) console.log(`   ${n}x ${key}`)
  }
})

it('R4-2 publish boundary: closeAll while stillAdmitted asks eligibility; is store.write asked after shut?', async () => {
  const c = await arrange({ read: completed([text('d')]) })
  await published(c)
  c.log.length = 0
  // refresh asks eligibility in admitForUse (1st) and in stillAdmitted (2nd)
  let n = 0
  const orig = c.stall
  const s = c.arm('none')
  // custom: stall the 2nd eligibility.check of this refresh
  const gate = deferred(); const reached = deferred()
  const check = (c as any).p.ports.eligibility
  const r = (async () => {
    // patch through stall slot on second call
  })()
  await r
  orig.which = 'eligibility.check'; orig.gate = undefined
  // first refresh call: let the first check go, hold the second
  const watcher = setInterval(() => {}, 1000); clearInterval(watcher)
  const pending = c.s.discovery.refresh(alice, { ref: files })
  // wait until one eligibility check happened, then arm for the next
  for (let i = 0; i < 1000 && !c.log.some(l => l.startsWith('eligibility.check')); i++) await Promise.resolve()
  orig.gate = gate; orig.reached = reached
  await reached.promise
  await c.s.connections.closeAll()
  gate.resolve()
  const answer = await pending
  console.log('R4-2 refresh =', JSON.stringify(answer), 'log=', c.log.join(','))
})
