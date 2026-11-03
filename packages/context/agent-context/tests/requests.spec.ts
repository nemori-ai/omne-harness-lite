// agentRequests over the real Request Context registry and operation group with the default
// strategies: the four outcomes of prepare, the request that the Model double fixes, the lineage of
// a second round, the translated groups, the staging table, the registration, the failure classes,
// and the plan identity, bound and completed checks of derive and resume.
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeActionId, type Preparation } from '@omne-harness/agent-contract'
import { decodeModelCallId } from '@omne-harness/model-contract'
import {
  decodeFixedRequestRecord,
  type AssemblyCall,
  type AssemblyOperations,
  type StepResult,
} from '@omne-harness/request-context-contract'
import { fixtureBudget } from '@omne-harness/request-context-contract/testing'
import { digest } from '../src/records.ts'
import {
  RESULT_CAPACITY,
  authority,
  createWorld,
  evidence,
  historyRow,
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

  describe('the fixed request record in the state of a ready preparation (RQ-14)', () => {
    /** A report with two input-tokens checks; the forecast is the larger one. */
    const twoChecks: NonNullable<WorldOptions['meter']> = () => {
      const [only] = fixtureBudget().checks
      if (only === undefined) throw new Error('fixture check')
      const at = (amount: string) => ({
        ...only,
        measurement: { kind: 'exact' as const, amount, method: only.supplier },
      })
      return { ok: { ...fixtureBudget(), checks: [at('7'), at('90')] } }
    }
    /** The selection of a profile with another window than the fixture profile has. */
    function widerSelection(w: World, provided: string) {
      const { profile } = w.selection.resolution
      const { context } = profile.definition
      return {
        ...w.selection,
        resolution: {
          ...w.selection.resolution,
          profile: {
            ...profile,
            definition: {
              ...profile.definition,
              context: { ...context, window: { ...context.window, provided } },
            },
          },
        },
      }
    }

    it('keeps the facts of this moment: coverage, window of the fixing profile, forecast, candidate and target', async () => {
      const w = await createWorld({ meter: twoChecks })
      const result = okOf(
        await prepared(w, { beforeModelCall: w.passed, selection: widerSelection(w, '4000') }),
      )
      if (result.kind !== 'ready') throw new Error(`expected ready, got ${result.kind}`)
      const decoded = decodeFixedRequestRecord(result.state)
      if (!('ok' in decoded)) throw new Error(`state refused: ${JSON.stringify(decoded)}`)
      const record = decoded.ok
      expect(digest(record.coverage)).toBe(result.coverage.digest)
      expect(record.coverage).toEqual(w.candidates.at(-1)?.coverage)
      expect(record.windowTokens).toBe('4000')
      expect(record.forecast).toEqual({ kind: 'estimate', usedTokens: '90' })
      expect(record.candidate).toBe('action-1')
      expect(record.target).toEqual(w.f.target)
      expect(record.continuation).toBeNull()
    })

    it('keeps the coverage of the candidate, not a coverage that a later read gives', async () => {
      const w = await createWorld({
        rows: Array.from({ length: 3 }, (_, i) => historyRow(i)),
        upper: 0,
      })
      const first = okOf(await prepared(w, { beforeModelCall: w.passed }))
      w.growTo(2)
      const later = okOf(await prepared(w, { beforeModelCall: w.passed }))
      if (first.kind !== 'ready' || later.kind !== 'ready') throw new Error('expected ready')
      const record = decodeFixedRequestRecord(first.state)
      if (!('ok' in record)) throw new Error('state refused')
      expect(digest(record.ok.coverage)).toBe(first.coverage.digest)
      expect(digest(record.ok.coverage)).not.toBe(later.coverage.digest)
    })

    it('has no forecast when the report has no input-tokens check', async () => {
      const w = await createWorld({ meter: () => ({ ok: { ...fixtureBudget(), checks: [] } }) })
      const result = okOf(await prepared(w, { beforeModelCall: w.passed }))
      if (result.kind !== 'ready') throw new Error(`expected ready, got ${result.kind}`)
      const record = decodeFixedRequestRecord(result.state)
      expect('ok' in record && record.ok.forecast).toBeNull()
    })

    it('leaves the state null for assembled and needs-compaction preparations', async () => {
      const w = await createWorld()
      const assembled = okOf(await prepared(w))
      expect(assembled.kind).toBe('assembled')
      expect(assembled.state).toEqual({ kind: 'null' })
      const compact = await createWorld({ meter: meterBy(500) })
      const needs = okOf(await prepared(compact))
      expect(needs.kind).toBe('needs-compaction')
      expect(needs.state).toEqual({ kind: 'null' })
    })
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

  describe('the fourth group with a definition (R2-D124)', () => {
    const definition = { owner: 'release', name: 'coding', revision: '1', digest: 'sha256:coding' }
    const sections = [
      { id: 'role', text: '# Role' },
      { id: 'trust', text: '# Trust' },
      { id: 'tools', text: '# Tools' },
    ]
    const systemText = (result: Awaited<ReturnType<typeof prepared>>) => {
      const value = okOf(result)
      if (value.kind !== 'assembled') throw new Error(value.kind)
      const [block] = value.input.system
      return block?.kind === 'text' ? block.text : ''
    }

    it('contributes the instructions as the first sections, in the order of the definition', async () => {
      let prompt: unknown
      let w: World | undefined
      w = await createWorld({
        definitions: async ({ definition: asked }) =>
          asked.name === 'coding'
            ? { kind: 'value', value: sections }
            : { kind: 'unavailable', diagnostic: 'unknown' },
        operations: real => ({
          ...real,
          assemble: async (call: AssemblyCall<string>) => {
            prompt = await w?.registered[0]?.groups.prompt.readSource(call)
            return real.assemble(call)
          },
        }),
      })
      const text = systemText(await prepared(w, { definition }))
      expect(text.split('\n')).toEqual(['# Role', '# Trust', '# Tools'])
      expect(prompt).toMatchObject({
        kind: 'value',
        value: {
          promptContributions: {
            contributions: sections.map(section => ({
              kind: 'section',
              name: `definition/${section.id}`,
              scope: w?.f.target.scope,
              source: definition,
              template: section.text,
              uses: [],
            })),
          },
          assembleContext: { scope: w.f.target.scope, workspace: null, keys: {} },
        },
      })
      expect(
        (prompt as { value: { assembleContext: { definition: unknown } } }).value.assembleContext
          .definition,
      ).toEqual(expect.stringContaining('"name":"coding"'))
    })

    it('fails closed when the definition cannot be read: no candidate, and no empty prompt is sent', async () => {
      let assembled = 0
      const w = await createWorld({
        definitions: async () => ({ kind: 'unavailable', diagnostic: 'definition-store-down' }),
        operations: real => ({
          ...real,
          assemble: async (call: AssemblyCall<string>) => {
            const result = await real.assemble(call)
            if ('candidate' in result) assembled += 1
            return result
          },
        }),
      })
      const refused = await prepared(w, { definition })
      expect('failure' in refused && refused.failure).toMatchObject({
        kind: 'unavailable',
        diagnostic: expect.stringContaining('definition-store-down'),
      })
      expect(assembled).toBe(0)
    })

    it('fails closed when no definition source was given and a definition is named', async () => {
      const w = await createWorld()
      const refused = await prepared(w, { definition })
      expect('failure' in refused && refused.failure).toMatchObject({
        kind: 'unavailable',
        diagnostic: expect.stringContaining('definition-source-absent'),
      })
    })

    it('contributes nothing for a definition that carries no instructions, and keeps the definition key', async () => {
      let prompt: unknown
      let w: World | undefined
      w = await createWorld({
        definitions: async () => ({ kind: 'value', value: null }),
        operations: real => ({
          ...real,
          assemble: async (call: AssemblyCall<string>) => {
            prompt = await w?.registered[0]?.groups.prompt.readSource(call)
            return real.assemble(call)
          },
        }),
      })
      expect(kindOf(await prepared(w, { definition }))).toBe('assembled')
      expect(prompt).toMatchObject({
        kind: 'value',
        value: { promptContributions: null, assembleContext: { scope: w.f.target.scope } },
      })
      expect(
        (prompt as { value: { assembleContext: { definition: unknown } } }).value.assembleContext
          .definition,
      ).toEqual(expect.stringContaining('"name":"coding"'))
    })

    it('a definition text that differs by one character gives another fourth-group token', async () => {
      const tokens: string[] = []
      let variant = sections
      let w: World | undefined
      w = await createWorld({
        definitions: async () => ({ kind: 'value', value: variant }),
        operations: real => ({
          ...real,
          assemble: async (call: AssemblyCall<string>) => {
            const read = await w?.registered[0]?.groups.prompt.readCount(call)
            if (read?.kind === 'value') tokens.push(read.value)
            return real.assemble(call)
          },
        }),
      })
      okOf(await prepared(w, { definition }))
      okOf(await prepared(w, { definition }))
      variant = [{ id: 'role', text: '# Role!' }, ...sections.slice(1)]
      okOf(await prepared(w, { definition }))
      expect(tokens).toHaveLength(3)
      expect(tokens[0]).toBe(tokens[1])
      expect(tokens[2]).not.toBe(tokens[0])
    })
  })

  it('gives no tool when the conditions name no binding, and tool-lookup-absent without a lookup otherwise', async () => {
    const w = await createWorld()
    expect(kindOf(await prepared(w))).toBe('assembled')
    const bound = { ...w.conditions, bindings: [owner] }
    const refused = await prepared(w, { conditions: bound })
    expect('failure' in refused && refused.failure).toMatchObject({
      kind: 'unavailable',
      diagnostic: expect.stringContaining('tool-lookup-absent'),
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

describe('CX-14 the derivation of a long conversation grows with the new rows', () => {
  const seed = 2
  const perRound = 2
  const actionOf = (round: number) => {
    const id = decodeActionId(`action-${round}`)
    if ('failure' in id) throw new Error('fixture action')
    return id.ok
  }
  /** One real round: the holder resolves the head to the longer history, then the adapter prepares. */
  async function round(w: World, index: number, last: number) {
    w.growTo(last)
    w.observation.reset()
    const calls = w.f.preparation.calls().length
    const context = await w.read()
    const result = await w.requests.prepare(w.prepareInput(context, { action: actionOf(index) }))
    const kind = kindOf(result)
    if (kind !== 'assembled') throw new Error(`round ${index}: ${JSON.stringify(result)}`)
    const whole = w.f.preparation.calls()[calls]
    return {
      round: index,
      ...w.observation.counts(),
      // The whole request is still measured with every message of the history.
      measuredMessages: whole?.assembled[0]?.messages.length ?? 0,
      requestMessages:
        'ok' in result && result.ok.kind === 'assembled' ? result.ok.input.messages.length : 0,
    }
  }
  const worldOf = (rounds: number) =>
    createWorld({
      rows: Array.from({ length: seed + perRound * rounds }, (_, i) => historyRow(i, `row ${i}`)),
      upper: seed - 1,
    })

  it('CX-14 reads only the new rows in the second and third round', async () => {
    const w = await worldOf(3)
    const first = await round(w, 1, seed - 1)
    const second = await round(w, 2, seed + perRound - 1)
    const third = await round(w, 3, seed + 2 * perRound - 1)
    expect(first).toMatchObject({ pageCalls: 1, returnedRows: seed })
    for (const next of [second, third])
      expect(next).toMatchObject({ pageCalls: 1, returnedRows: perRound, olderRowsTouched: 1 })
    expect(second.requestMessages).toBeGreaterThan(first.requestMessages)
    expect(third.requestMessages).toBeGreaterThan(second.requestMessages)
    expect(second.messageRows).toBeLessThan(first.messageRows + perRound * 2)
  })

  it('CX-14 keeps derivation counts constant for 200 rounds', async () => {
    const rounds = 200
    const w = await worldOf(rounds)
    const table = [await round(w, 1, seed - 1)]
    for (let index = 2; index <= rounds; index++)
      table.push(await round(w, index, seed + perRound * (index - 1) - 1))
    const derived = (item: (typeof table)[number]) => ({
      pageCalls: item.pageCalls,
      returnedRows: item.returnedRows,
      messageRows: item.messageRows,
      touchedRows: item.touchedRows,
      olderRowsTouched: item.olderRowsTouched,
    })
    const early = table.slice(10, 30).map(derived)
    const late = table.slice(180, 200).map(derived)
    // Rounds 11 to 30 and rounds 181 to 200 do the same work per round, pair by pair.
    expect(late).toEqual(early.slice(0, late.length))
    for (const item of table.slice(1)) {
      expect(item.pageCalls).toBe(1)
      expect(item.returnedRows).toBe(perRound)
      // Only the last cached row is read: the cursor of the tail read continues from it.
      expect(item.olderRowsTouched).toBe(1)
    }
    // The full request is not skipped: it is still built and measured over the whole history.
    const requests = table.map(item => item.requestMessages)
    expect(requests.at(-1)).toBeGreaterThan((requests[19] ?? 0) * 5)
    expect(table.at(-1)?.measuredMessages).toBeGreaterThan(table[19]?.measuredMessages ?? 0)
    const out = process.env.CX14_COUNTS_OUT
    if (out !== undefined) writeFileSync(out, JSON.stringify(table, null, 1))
  })
})
