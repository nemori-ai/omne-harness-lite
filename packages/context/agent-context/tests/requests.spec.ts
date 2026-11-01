// agentRequests over the real Request Context registry and operation group with the default
// strategies: the four outcomes of prepare, the request that the Model double fixes, the lineage of
// a second round, the translated groups, the staging table, the registration, the failure classes,
// and the plan identity, bound and completed checks of derive and resume.
import { describe, expect, it } from 'vitest'
import type { Preparation } from '@omne-harness/agent-contract'
import { decodeModelCallId } from '@omne-harness/model-contract'
import type {
  AssemblyCall,
  AssemblyOperations,
  StepResult,
} from '@omne-harness/request-context-contract'
import { fixtureBudget } from '@omne-harness/request-context-contract/testing'
import {
  RESULT_CAPACITY,
  authority,
  createWorld,
  evidence,
  meterBy,
  owner,
  tenantOf,
  userMessage,
  type World,
  type WorldOptions,
} from './fixtures/context-world.ts'

async function prepared(w: World, overrides: Parameters<World['prepareInput']>[1] = {}) {
  const context = await w.read()
  return w.requests.prepare(w.prepareInput(context, overrides))
}
function modelCall(raw: string) {
  const call = decodeModelCallId(raw)
  if ('failure' in call) throw new Error('fixture call')
  return call.ok
}
function okOf<T>(result: { ok: T } | { failure: unknown }): T {
  if (!('ok' in result)) throw new Error(`expected a success, got ${JSON.stringify(result)}`)
  return result.ok
}
function kindOf(result: { ok: Preparation } | { failure: unknown }) {
  return 'ok' in result ? result.ok.kind : result
}

/** Holds the next assemble until `open` is called, to keep one call in flight. */
function gated(): Readonly<{ wrap: NonNullable<WorldOptions['operations']>; open(): void }> {
  const gate = Promise.withResolvers<void>()
  let held = false
  return {
    wrap: real => ({
      ...real,
      assemble: async call => {
        if (!held) {
          held = true
          await gate.promise
        }
        return real.assemble(call)
      },
    }),
    open: () => gate.resolve(),
  }
}

describe('prepare', () => {
  it('gives an assembled preparation before the position before the model call', async () => {
    const w = await createWorld()
    const result = okOf(await prepared(w))
    if (result.kind !== 'assembled') throw new Error(`expected assembled, got ${result.kind}`)
    expect(result.input).toEqual(w.candidates.at(-1)?.assembled)
    expect(result.recipient).toEqual(w.selection.recipient)
    expect(result.schema).toEqual(owner)
    expect(w.counts.model).toBe(0)
  })

  it('fixes the default assembly through the Model request preparation once the position passed', async () => {
    const w = await createWorld()
    const result = okOf(await prepared(w, { beforeModelCall: w.passed }))
    if (result.kind !== 'ready') throw new Error(`expected ready, got ${result.kind}`)
    expect(result.request.messages).toEqual(w.candidates.at(-1)?.assembled.messages)
    expect(result.capacity).toEqual(RESULT_CAPACITY)
    expect(w.counts.model).toBe(1)
  })

  it('declares continues in the second round when the first request is the fixed adoption', async () => {
    const w = await createWorld()
    okOf(await prepared(w, { beforeModelCall: w.passed }))
    expect(w.f.preparation.calls().every(seen => seen.lineage?.continues === undefined)).toBe(true)
    const first = w.candidates.at(-1)
    if (first === undefined) throw new Error('no candidate')
    const call = w.adopt(first, true)
    okOf(await prepared(w, { beforeModelCall: w.passed }))
    expect(w.f.preparation.calls().some(seen => seen.lineage?.continues === call)).toBe(true)
  })

  it('enters the plan in the same call when compaction is needed: plan, bound and zero steps', async () => {
    const w = await createWorld({ meter: meterBy(500) })
    const result = okOf(await prepared(w))
    if (result.kind !== 'needs-compaction')
      throw new Error(`expected needs-compaction, got ${result.kind}`)
    expect(w.counts.planCompaction).toBe(1)
    expect(result.progress.completed).toBe('0')
    expect(BigInt(result.progress.bound)).toBeGreaterThan(0n)
    expect(result.progress.plan.owner).toContain('agent-context')
  })

  it('gives cannot-fit with reason fixed when the fixed part is over the limit', async () => {
    const w = await createWorld({ meter: () => ({ ok: fixtureBudget('2000') }) })
    const result = okOf(await prepared(w))
    expect(result.kind === 'cannot-fit' && result.reason).toBe('fixed')
  })
})

describe('the groups that Request Context reads', () => {
  it('gives the fourth group the resolved scope and null definition and workspace', async () => {
    let w: World | undefined
    let prompt: unknown
    w = await createWorld({
      operations: real => ({
        ...real,
        assemble: async (call: AssemblyCall<string>) => {
          prompt = await w?.registered[0]?.groups.prompt.readSource(call)
          return real.assemble(call)
        },
      }),
    })
    okOf(await prepared(w))
    expect(prompt).toEqual({
      kind: 'value',
      value: {
        promptContributions: null,
        assembleContext: { scope: w.f.target.scope, definition: null, workspace: null, keys: {} },
      },
    })
  })

  it('gives no tool when the conditions name no binding, and tools-source-absent otherwise', async () => {
    const w = await createWorld()
    expect(kindOf(await prepared(w))).toBe('assembled')
    const bound = { ...w.conditions, bindings: [owner] }
    const refused = await prepared(w, { conditions: bound })
    expect('failure' in refused && refused.failure).toMatchObject({
      kind: 'unavailable',
      diagnostic: expect.stringContaining('tools-source-absent'),
    })
  })

  it('tokens: same input same token, another input another token, never a constant', async () => {
    const tokens: string[] = []
    let w: World | undefined
    w = await createWorld({
      operations: real => ({
        ...real,
        assemble: async (call: AssemblyCall<string>) => {
          const read = await w?.registered[0]?.groups.control.readCount(call)
          if (read?.kind === 'value') tokens.push(read.value)
          return real.assemble(call)
        },
      }),
    })
    okOf(await prepared(w))
    okOf(await prepared(w))
    okOf(await prepared(w, { alterations: [evidence('alteration')] }))
    expect(tokens).toHaveLength(3)
    expect(tokens[0]).toBe(tokens[1])
    expect(tokens[2]).not.toBe(tokens[0])
  })
})

describe('the staging table', () => {
  it('answers call-input-busy to a second call of the same candidate in flight, and clears after', async () => {
    const gate = gated()
    const w = await createWorld({ operations: gate.wrap })
    const context = await w.read()
    const first = w.requests.prepare(w.prepareInput(context))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(await w.requests.prepare(w.prepareInput(context))).toEqual({
      failure: { kind: 'unavailable', owner: 'agent-context', diagnostic: 'call-input-busy' },
    })
    gate.open()
    expect(kindOf(await first)).toBe('assembled')
    expect(kindOf(await w.requests.prepare(w.prepareInput(context)))).toBe('assembled')
  })

  it('leaves no group value behind: a read after the call answers call-input-absent', async () => {
    const w = await createWorld()
    okOf(await prepared(w))
    const call: AssemblyCall<string> = { ...w.f.call, access: w.access }
    expect(await w.registered[0]?.groups.history.readSource(call)).toEqual({
      kind: 'unavailable',
      diagnostic: 'call-input-absent',
    })
  })
})

describe('registration of the source set', () => {
  it('registers a target once, on its first call', async () => {
    const w = await createWorld()
    okOf(await prepared(w))
    okOf(await prepared(w))
    expect(w.counts.register).toBe(1)
  })

  it('answers source-set-conflict when another registrant holds the target, and replaces nothing', async () => {
    const w = await createWorld()
    const other = { ...owner, name: 'other' }
    const held = await w.registry.register({
      access: w.access,
      target: w.f.target,
      owner: other,
      sources: w.f.sources,
    })
    expect(held.kind).toBe('registered')
    expect(await prepared(w)).toEqual({
      failure: { kind: 'unavailable', owner: 'agent-context', diagnostic: 'source-set-conflict' },
    })
  })

  it('answers source-registration-denied when the registration authority refuses, and asks again later', async () => {
    const w = await createWorld()
    w.setRegisterAnswer({ kind: 'denied' })
    expect(await prepared(w)).toEqual({
      failure: {
        kind: 'unavailable',
        owner: 'agent-context',
        diagnostic: 'source-registration-denied',
      },
    })
    w.setRegisterAnswer(null)
    expect(kindOf(await prepared(w))).toBe('assembled')
    expect(w.counts.register).toBe(2)
  })

  it('close withdraws every registration, settles, and refuses later calls', async () => {
    const w = await createWorld()
    const context = await w.read()
    okOf(await w.requests.prepare(w.prepareInput(context)))
    expect(await w.requests.close()).toEqual({ kind: 'settled' })
    // The target is free again: another registrant gets it, which a live registration refuses.
    const other = { ...owner, name: 'next' }
    const next = await w.registry.register({
      access: w.access,
      target: w.f.target,
      owner: other,
      sources: w.f.sources,
    })
    expect(next.kind).toBe('registered')
    expect(await w.requests.prepare(w.prepareInput(context))).toEqual({
      failure: { kind: 'unavailable', owner: 'agent-context', diagnostic: 'agent-context-closed' },
    })
  })
})

describe('failures', () => {
  it('maps a refused history resolution as it is and asks Request Context nothing', async () => {
    const w = await createWorld()
    const context = await w.read()
    const before = w.counts.assemble
    const result = await w.requests.prepare(
      w.prepareInput(context, { history: evidence('another-head') }),
    )
    expect(result).toEqual({
      failure: { kind: 'invalid', field: 'evidence', reason: 'unknown-epoch' },
    })
    expect(w.counts.assemble).toBe(before)
    expect(w.counts.register).toBe(0)
  })

  it('a deterministic Model refusal is invalid on request with the reason of Model', async () => {
    const w = await createWorld()
    w.planModel({ failure: { kind: 'invalid', field: 'parameters', reason: 'unsupported' } })
    expect(await prepared(w, { beforeModelCall: w.passed })).toEqual({
      failure: { kind: 'invalid', field: 'request', reason: 'unsupported' },
    })
  })

  it('a temporary Model failure stays unavailable', async () => {
    const w = await createWorld()
    w.planModel({
      failure: { kind: 'unavailable', dependency: 'transport', diagnostic: 'busy' },
    })
    expect(await prepared(w, { beforeModelCall: w.passed })).toEqual({
      failure: { kind: 'unavailable', owner: 'transport', diagnostic: 'busy' },
    })
  })

  it('denies a target of another tenant that the holder resolves, and asks nothing further', async () => {
    const w = await createWorld()
    const context = await w.read()
    const seen = { ...w.counts }
    w.resolveTo(tenantOf('2'))
    expect(await w.requests.prepare(w.prepareInput(context))).toEqual({
      failure: { kind: 'denied', action: 'prepare' },
    })
    expect(w.counts.resolveHistory).toBe(seen.resolveHistory + 1)
    expect({ ...w.counts, resolveHistory: 0 }).toEqual({ ...seen, resolveHistory: 0 })
  })

  it('denies a read of another tenant before anything is resolved', async () => {
    const w = await createWorld()
    const context = await w.read()
    const before = w.counts.resolveHistory
    const stranger = { principal: 'bob', tenant: tenantOf('2') }
    expect(await w.requests.prepare(w.prepareInput(context, stranger))).toEqual({
      failure: { kind: 'denied', action: 'prepare' },
    })
    expect(w.counts.resolveHistory).toBe(before)
  })
})

describe('derive and resume', () => {
  async function planned(options: WorldOptions = {}) {
    const w = await createWorld({ meter: meterBy(500), ...options })
    const original = okOf(await prepared(w))
    if (original.kind !== 'needs-compaction')
      throw new Error(`expected needs-compaction, got ${original.kind}`)
    const derive = (overrides: Partial<Parameters<World['requests']['derive']>[0]> = {}) =>
      w.requests.derive({
        ...w.access,
        advance: authority(),
        original,
        progress: original.progress,
        action: original.id,
        selection: w.selection,
        result: null,
        ...overrides,
      })
    return { w, original, derive }
  }
  const [first] = userMessage(90, 'the gist').blocks
  const summaryBlock = first?.kind === 'text' ? first : undefined
  const summary = {
    produced: {
      producer: { kind: 'model' as const, call: modelCall('mcall_step') },
      version: '1',
      delivery: null,
      source: evidence('step-result'),
    },
    consumed: evidence('step-consumed'),
  }

  it('gives the first step of the entered plan, fixed through Model for the compaction purpose', async () => {
    const { w, original, derive } = await planned()
    const result = okOf(await derive())
    if (result.kind !== 'continue') throw new Error(`expected continue, got ${result.kind}`)
    expect(result.progress).toEqual(original.progress)
    expect(result.stepRequest.purpose).toBe('compaction')
    expect(result.stepRequest.kind).toBe('ready')
    expect(w.counts.planCompaction).toBe(1)
  })

  it('refuses a progress whose plan or bound differs from the plan entered, or whose count moved', async () => {
    const { original, derive } = await planned()
    const other = { ...original.progress, plan: evidence('another-plan') }
    expect(await derive({ progress: other })).toEqual({
      failure: { kind: 'invalid', field: 'progress', reason: 'plan-mismatch' },
    })
    const bound = { ...original.progress, bound: '99' }
    expect(await derive({ progress: bound })).toEqual({
      failure: { kind: 'invalid', field: 'progress', reason: 'plan-mismatch' },
    })
    const moved = { ...original.progress, completed: '1' }
    expect(await derive({ progress: moved })).toEqual({
      failure: { kind: 'invalid', field: 'progress.completed', reason: 'progress-mismatch' },
    })
  })

  /** A plan whose step results are readable, with each derived step result passed through `rewrite`. */
  function stepped(rewrite: (real: StepResult) => StepResult) {
    return planned({
      stepResults: async () =>
        summaryBlock === undefined
          ? { kind: 'unavailable', diagnostic: 'fixture' }
          : { kind: 'value', value: [summaryBlock] },
      operations: (real: AssemblyOperations<string>) => ({
        ...real,
        deriveStep: async input => rewrite(await real.deriveStep(input)),
      }),
    })
  }

  it('takes a step result that Request Context counts as exactly one more step', async () => {
    const { derive } = await stepped(real => real)
    const result = okOf(await derive({ result: summary }))
    expect(result.kind === 'cannot-fit' ? 'cannot-fit' : result.progress.completed).toBe('1')
  })

  for (const completed of ['2', '0'])
    it(`refuses a step result that Request Context counts as ${completed} steps done`, async () => {
      const { derive } = await stepped(real =>
        'progress' in real ? { ...real, progress: { ...real.progress, completed } } : real,
      )
      expect(await derive({ result: summary })).toEqual({
        failure: { kind: 'invalid', field: 'progress.completed', reason: 'progress-mismatch' },
      })
    })

  it('answers unavailable when the step result cannot be read', async () => {
    const { derive } = await planned()
    expect(await derive({ result: summary })).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'none' },
    })
  })

  it('resume answers changed for another commit, and asks Request Context nothing', async () => {
    const { w, original } = await planned()
    const after = await w.read({ transition: evidence('commit-a') })
    const result = await w.requests.resume({
      ...w.access,
      advance: authority(),
      original,
      transition: evidence('commit-b'),
      selection: w.selection,
      context: after,
    })
    expect(result).toEqual({ failure: { kind: 'changed' } })
    expect(w.counts.resume).toBe(0)
  })

  it('resume of the same commit reaches Request Context; the sixth group has no source there', async () => {
    const { w, original } = await planned()
    const after = await w.read({ transition: evidence('commit-a') })
    const result = await w.requests.resume({
      ...w.access,
      advance: authority(),
      original,
      transition: evidence('commit-a'),
      selection: w.selection,
      context: after,
    })
    expect(w.counts.resume).toBe(1)
    expect('failure' in result && result.failure).toMatchObject({
      kind: 'unavailable',
      diagnostic: expect.stringContaining('tools-source-absent'),
    })
  })
})
