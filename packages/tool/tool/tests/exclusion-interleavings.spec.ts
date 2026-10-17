import { describe, expect, it } from 'vitest'
import { type LedgerCommitInput, type ToolLedger, type ToolLedgerStore } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import {
  admission,
  callId,
  dummyRequest,
  evidence,
  ledgerOver,
  ok,
  operationId,
  putsOperation,
  tenantA,
  type Block,
  type Principal,
} from './runtime-values.ts'

const q = (op: string) => ({ ...admission('call-1', op), operation: operationId(op) })
const lk = (op: string) => ({ ...admission('call-1', op), admission: operationId(op) })
const rel = (op: string) => ({
  ...admission('call-1', op),
  result: 'v1' as never,
  delivery: 'd1' as never,
  consumer: dummyRequest().consumer,
  evidence: { kind: 'retained', custody: evidence('kept', 'session') } as const,
})
const excludedOf = (op: string) => ({
  failure: {
    kind: 'unavailable',
    dependency: 'ledger-store',
    diagnostic: `operation ${op} was excluded by a negative answer; resubmit with the same identity`,
  },
})

type Hook = { matches: (i: LedgerCommitInput<Block>) => boolean; land: () => Promise<unknown> }
type Entry = {
  label: string
  ops: string[]
  excl: string[]
  dels: string[]
  result: string
  revision: string
}
function hooked() {
  const memory = createMemoryToolLedgerStore<Block>()
  const hooks: Hook[] = []
  const log: Entry[] = []
  let label = ''
  const store: ToolLedgerStore<Block> = {
    durability: 'none',
    read: d => memory.read(d),
    commit: async input => {
      const i = hooks.findIndex(h => h.matches(input))
      if (i >= 0) {
        const [h] = hooks.splice(i, 1)
        await h!.land()
      }
      const r = await memory.commit(input)
      log.push({
        label,
        ops: input.writes.flatMap(w =>
          w.kind === 'put' && w.record.kind === 'operation' ? [w.record.operation.operation] : [],
        ),
        excl: input.writes.flatMap(w =>
          w.kind === 'put' && w.record.kind === 'exclusion'
            ? [`${w.record.exclusion.operation}@${w.record.exclusion.revision}`]
            : [],
        ),
        dels: input.writes.flatMap(w => (w.kind === 'delete' ? [w.key] : [])),
        result: r.kind,
        revision: input.revision,
      })
      return r
    },
  }
  const records = async () => {
    const read = await memory.read({
      kind: 'call',
      tenant: tenantA as never,
      call: callId('call-1'),
    })
    if (read.kind !== 'complete') throw new Error('read')
    return read
  }
  return {
    memory,
    store,
    hooks,
    log,
    records,
    setLabel: (l: string) => {
      label = l
    },
  }
}
const landedOps = (log: Entry[], op: string) =>
  log.filter(e => e.result === 'committed' && e.ops.includes(op))

describe('14 exclusion interleavings', () => {
  it('14 exclusion: a release in flight when not-committed is given is excluded, and a fresh release lands and removes the fence', async () => {
    const h = hooked()
    const ledger: ToolLedger<Principal, Block> = ledgerOver(h.store)
    ok(await ledger.admissions.admit(admission('call-1', 'op-1', dummyRequest())))
    let negative: unknown
    h.hooks.push({
      matches: putsOperation('op-2'),
      land: async () => {
        negative = await ledger.reads.operation(q('op-2'))
      },
    })
    expect(await ledger.commands.releaseDelivery(rel('op-2'))).toEqual(excludedOf('op-2'))
    expect(negative).toEqual({ ok: { kind: 'not-committed' } })
    expect(landedOps(h.log, 'op-2')).toEqual([])
    expect(ok(await ledger.commands.releaseDelivery(rel('op-2'))).kind).toBe('released')
    expect((await h.records()).records.some(r => r.kind === 'exclusion')).toBe(false)
  })

  it('14 exclusion: a fence of another operation does not exclude an in-flight admission', async () => {
    const h = hooked()
    const ledger: ToolLedger<Principal, Block> = ledgerOver(h.store)
    h.hooks.push({ matches: putsOperation('op-1'), land: () => ledger.reads.lookup(lk('op-9')) })
    expect(
      ok(await ledger.admissions.admit(admission('call-1', 'op-1', dummyRequest()))).recovered,
    ).toBe(false)
  })

  it('14 exclusion: revisions compare as numbers, so a fence at 10 excludes an admission that first read at 9', async () => {
    const h = hooked()
    const ledger: ToolLedger<Principal, Block> = ledgerOver(h.store)
    for (let i = 0; i < 9; i += 1) await ledger.reads.operation(q(`op-x${i}`))
    expect((await h.records()).revision).toBe('9')
    h.hooks.push({ matches: putsOperation('op-1'), land: () => ledger.reads.operation(q('op-1')) })
    expect(await ledger.admissions.admit(admission('call-1', 'op-1', dummyRequest()))).toEqual(
      excludedOf('op-1'),
    )
    expect(landedOps(h.log, 'op-1')).toEqual([])
  })

  it('14 exclusion: a fresh admission that first reads after a later fence of another operation is not excluded by its own older fence', async () => {
    const h = hooked()
    const ledger: ToolLedger<Principal, Block> = ledgerOver(h.store)
    await ledger.reads.operation(q('op-1'))
    await ledger.reads.operation(q('op-2'))
    expect(
      ok(await ledger.admissions.admit(admission('call-1', 'op-1', dummyRequest()))).recovered,
    ).toBe(false)
  })
})
