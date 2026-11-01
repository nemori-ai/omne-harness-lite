// agentModelContext over the real Runtime Context mechanism: when a read is full and when it is
// incremental, which material a read keeps and under which key, how a lost material is answered,
// how the evidence it hands out is resolved, and which refusals it gives.
import { describe, expect, it } from 'vitest'
import { decodeAgentExecutionId } from '@omne-harness/agent-contract'
import { createAgentModelContext, createContextMaterials } from '@omne-harness/agent-context'
import { authority, createWorld, owner, tenantOf, type World } from './fixtures/context-world.ts'

/** A full read, an assembled preparation on it, and that candidate made the fixed adoption. */
async function adoptedRound(w: World, attachment = 'attachment-1') {
  const advance = authority(attachment)
  const first = await w.read({ advance })
  const prepared = await w.requests.prepare(w.prepareInput(first, { advance }))
  if (!('ok' in prepared) || prepared.ok.kind !== 'assembled')
    throw new Error(`expected assembled, got ${JSON.stringify(prepared)}`)
  const candidate = w.candidates.at(-1)
  if (candidate === undefined) throw new Error('no candidate was assembled')
  w.adopt(candidate)
  return { first, coverage: prepared.ok.coverage, advance }
}

describe('full and incremental reads', () => {
  it('reads in full first, then incrementally from the kept material of the same attachment', async () => {
    const w = await createWorld()
    const { first, coverage, advance } = await adoptedRound(w)
    expect(first.content).toBe('full')
    const second = await w.read({ advance, adopted: coverage })
    expect(second.content).toBe('incremental')
    expect(second.recipient).toEqual(w.selection.recipient)
  })

  it('reads in full again when the recipient changes', async () => {
    const w = await createWorld()
    const { coverage, advance } = await adoptedRound(w)
    const recipient = { ...w.selection.recipient, route: 'other-route' }
    expect((await w.read({ advance, adopted: coverage, recipient })).content).toBe('full')
  })

  it('reads in full when no adopted coverage is given or it is not the fixed one', async () => {
    const w = await createWorld()
    const { coverage, advance } = await adoptedRound(w)
    expect((await w.read({ advance })).content).toBe('full')
    w.adopted.set(null)
    expect((await w.read({ advance, adopted: coverage })).content).toBe('full')
  })

  it('keys the material by execution attachment: a new attachment reads in full', async () => {
    const w = await createWorld()
    const { coverage } = await adoptedRound(w, 'attachment-1')
    const moved = authority('attachment-2')
    expect((await w.read({ advance: moved, adopted: coverage })).content).toBe('full')
  })

  it('a later full read on the old attachment leaves the material of the new one alone', async () => {
    const w = await createWorld()
    await adoptedRound(w, 'attachment-1')
    const { coverage, advance } = await adoptedRound(w, 'attachment-2')
    // The old attachment reads in full again after the new one took its material.
    expect((await w.read({ advance: authority('attachment-1') })).content).toBe('full')
    expect((await w.read({ advance, adopted: coverage })).content).toBe('incremental')
  })

  it('reads in full after the kept material was dropped for lack of room', async () => {
    const w = await createWorld({ capacity: 1 })
    const { coverage, advance } = await adoptedRound(w, 'attachment-1')
    await w.read({ advance: authority('attachment-2') })
    expect((await w.read({ advance, adopted: coverage })).content).toBe('full')
  })
})

describe('the evidence a read hands out', () => {
  it('names a lost read as context-material-lost when prepare resolves it', async () => {
    const w = await createWorld({ capacity: 1 })
    const first = await w.read()
    await w.read({ advance: authority('attachment-2') })
    expect(await w.requests.prepare(w.prepareInput(first))).toEqual({
      failure: { kind: 'unavailable', owner: 'agent-context', diagnostic: 'context-material-lost' },
    })
    expect(w.counts.assemble).toBe(0)
  })

  it('a new instance resolves nothing, but still tells whose execution an evidence names', async () => {
    const w = await createWorld()
    const { coverage, advance } = await adoptedRound(w)
    // A restart: the same owner, a new material instance, the same holder and Runtime Context.
    const restarted = createAgentModelContext<string>({
      materials: createContextMaterials<string>({ owner, capacity: 8 }),
      parts: w.parts,
      eligibility: { current: async () => ({ kind: 'current', eligibility: w.held }) },
      runtimeContext: { bind: id => w.rc.bind(id, { consumer: 'model' }) },
    })
    const same = await restarted.read(w.readInput({ advance, adopted: coverage }))
    expect('ok' in same && same.ok.content).toBe('full')
    const run = decodeAgentExecutionId('execution-2')
    if ('failure' in run) throw new Error('fixture execution')
    const other = authority('attachment-9', run.ok)
    expect(await restarted.read(w.readInput({ advance: other, adopted: coverage }))).toEqual({
      failure: { kind: 'invalid', field: 'adopted', reason: 'other-execution' },
    })
  })

  it('refuses adopted evidence that another owner minted', async () => {
    const w = await createWorld()
    const foreign = { owner: 'someone-else', record: 'x', revision: '1', digest: 'd' }
    expect(await w.reader.read(w.readInput({ adopted: foreign }))).toEqual({
      failure: { kind: 'invalid', field: 'adopted', reason: 'foreign-evidence' },
    })
  })
})

describe('refusals', () => {
  it('answers eligibility-absent when the holder hands no eligibility', async () => {
    const w = await createWorld()
    w.answer({ kind: 'absent' })
    expect(await w.reader.read(w.readInput())).toEqual({
      failure: {
        kind: 'unavailable',
        owner: 'runtime-context-holder',
        diagnostic: 'eligibility-absent',
      },
    })
    expect(w.counts.bind).toBe(0)
  })

  it('denies a read that Runtime Context refuses as unauthorized, after asking the holder again', async () => {
    const w = await createWorld()
    await w.rc.revokeEligibility('holder', w.held)
    expect(await w.reader.read(w.readInput())).toEqual({
      failure: { kind: 'denied', action: 'read-runtime-context' },
    })
    expect(w.counts.eligibility).toBe(2)
  })

  it('binds the next eligibility when the handed one no longer binds', async () => {
    const w = await createWorld()
    const old = w.held
    await w.rc.revokeEligibility('holder', old)
    const replacing = await w.issue()
    w.answerInTurn([
      { kind: 'current', eligibility: old },
      { kind: 'current', eligibility: replacing },
    ])
    const read = await w.reader.read(w.readInput())
    expect('ok' in read && read.ok.content).toBe('full')
    expect(w.counts.bind).toBe(2)
  })

  it('denies another tenant before Runtime Context or the holder handoff is asked', async () => {
    const w = await createWorld()
    const stranger = { principal: 'bob', tenant: tenantOf('2') }
    expect(await w.reader.read(w.readInput(stranger))).toEqual({
      failure: { kind: 'denied', action: 'resolve-history' },
    })
    expect(w.counts.eligibility).toBe(0)
    expect(w.counts.bind).toBe(0)
  })

  it('denies evidence of another tenant before anything is resolved', async () => {
    const w = await createWorld()
    const { coverage } = await adoptedRound(w)
    const before = w.counts.resolveHistory
    const stranger = { principal: 'bob', tenant: tenantOf('2') }
    expect(await w.reader.read(w.readInput({ ...stranger, adopted: coverage }))).toEqual({
      failure: { kind: 'denied', action: 'read' },
    })
    expect(w.counts.resolveHistory).toBe(before)
  })
})
