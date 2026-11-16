import { closeSync, fsyncSync, mkdirSync, openSync, writeFileSync, writeSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { payloadKind, startAssembly } from './assembly.ts'

const [outArg, kindArg, measuredArg, longArg] = process.argv.slice(2)
if (outArg === undefined) throw new Error('give an output directory')
const kind = payloadKind(kindArg)
const measured = Number(measuredArg ?? '10')
const SHORT = 20
const LONG = Number(longArg ?? '200')
type Tenant = 'a' | 'b'
type Block = 0 | 1 | 2

const out = resolve(outArg)
mkdirSync(out, { recursive: true })
const assembly = await startAssembly(kind)
const homes = { a: join(assembly.base, 'home-a'), b: join(assembly.base, 'home-b') } as const

function reference() {
  const spawned = performance.now()
  spawnSync(process.execPath, ['-e', ''])
  const spawnMs = performance.now() - spawned
  const page = Buffer.alloc(4096, 1)
  const fd = openSync(join(assembly.base, 'reference.bin'), 'w')
  const synced = performance.now()
  for (let i = 0; i < 8; i += 1) {
    writeSync(fd, page)
    fsyncSync(fd)
  }
  const fsyncMs = performance.now() - synced
  closeSync(fd)
  const { rss, heapUsed } = process.memoryUsage()
  return { spawnMs, fsyncMs, rss, heapUsed }
}

type Sample = Readonly<{
  ordinal: number
  tenant: Tenant
  block: Block
  settledBefore: number
  elapsedMs: number
  reference: ReturnType<typeof reference> | null
}>

const samples: Sample[] = []
const settled = { a: 0, b: 0 }
let outcome: Record<string, unknown> = { ok: false }

async function call(tenant: Tenant, block: Block) {
  const ordinal = samples.length + 1
  const probes = block === 0 ? null : reference()
  const { elapsedMs } = await assembly.call(homes[tenant], ordinal, {
    readBack: false,
    settleMs: block === 0 ? 0 : 500,
  })
  samples.push({
    ordinal,
    tenant,
    block,
    settledBefore: settled[tenant],
    elapsedMs,
    reference: probes,
  })
  settled[tenant] += 1
  writeFileSync(join(out, 'samples.json'), `${JSON.stringify(samples, null, 2)}\n`)
}

const pairs = async (block: Block) => {
  for (let i = 0; i < measured; i += 1)
    for (const tenant of ['a', 'b'] as const) await call(tenant, block)
}

try {
  await assembly.ready()
  for (const tenant of ['a', 'b'] as const) {
    await assembly.enrol(homes[tenant], `history-cost-${tenant}`)
    for (let i = 0; i < SHORT; i += 1) await call(tenant, 0)
  }
  assembly.storageSnapshot(join(out, 'storage-block-1.json'))
  await pairs(1)
  while (settled.a < LONG) await call('a', 0)
  assembly.storageSnapshot(join(out, 'storage-block-2.json'))
  await pairs(2)
  outcome = {
    ok: true,
    kind,
    bytes: assembly.author.bytes,
    measured,
    long: LONG,
    calls: samples.length,
  }
} catch (error) {
  outcome = { ok: false, kind, error: String(error), stderr: assembly.stderr }
} finally {
  const exitCode = await assembly.close()
  outcome['exitCode'] = exitCode
  if (exitCode !== 0) outcome['ok'] = false
  writeFileSync(join(out, 'result.json'), `${JSON.stringify(outcome, null, 2)}\n`)
  console.log(JSON.stringify(outcome).slice(0, 2000))
  const flush: unknown = Reflect.get(globalThis, 'historyCostFlush')
  if (typeof flush === 'function') flush()
  process.exitCode = outcome['ok'] === true ? 0 : 1
}
