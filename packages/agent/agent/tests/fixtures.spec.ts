// One test per scripting interface of the testing entry: the default answer, and the answer a test
// scripts. A double runs no semantics of its port; these tests check only that it answers as told.
import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  createManualAgentClock,
  createScriptedAccessCheck,
  createScriptedActionAdmission,
  createScriptedDecisionCards,
  createScriptedExtensions,
  createScriptedMaterials,
  createScriptedMessageHandoff,
  createScriptedModelContext,
  createScriptedModelSelection,
  createScriptedReads,
  createScriptedRequestPreparation,
  createScriptedToolRuntime,
  createTableAdoptions,
  createTableConditions,
  createTestAgentDependencies,
  readyPreparation,
  testAdoption,
  testEvidence,
} from '@omne-harness/agent/testing'
import type {
  AdmissionDecision,
  Authority,
  CardReply,
  RequestPreparation,
  RuntimeConditions,
} from '@omne-harness/agent-contract'
import {
  access,
  attachment,
  execution,
  failure,
  instance,
  ok,
  operation,
  passageId,
} from './journal-support.ts'

const authority: Authority = {
  execution: execution(),
  executionAttachment: attachment(),
  instance: instance(),
  generation: '1',
  source: testEvidence('authority'),
}

/**
 * The input of a double whose answer does not depend on most of its input. The double reads only
 * the fields given here, so the rest of the contract shape is left out on purpose.
 */
function stub<T>(fields: object): T {
  return fields as T
}

const unscripted = (owner: string) => ({
  kind: 'unavailable',
  owner,
  diagnostic: `${owner} has no scripted answer`,
})

describe('access check', () => {
  it('answers allowed by default, then denied and unavailable as scripted, and logs each call', async () => {
    const checks = createScriptedAccessCheck<string>()
    const input = {
      access,
      operation: 'invoke',
      target: { kind: 'instance', instance: instance() },
    } as const
    expect((await checks.port.check(input)).kind).toBe('allowed')
    checks.check.once(() => ({ kind: 'denied' }))
    checks.check.always(() => ({ kind: 'unavailable', diagnostic: 'down' }))
    expect(await checks.port.check(input)).toEqual({ kind: 'denied' })
    expect(await checks.port.check(input)).toEqual({ kind: 'unavailable', diagnostic: 'down' })
    expect(checks.check.calls).toHaveLength(3)
  })
})

describe('action admission', () => {
  it('answers allow by default, then deny, need-decision and unavailable as scripted', async () => {
    const admission = createScriptedActionAdmission<string>()
    const input = stub<Parameters<typeof admission.port.admit>[0]>({
      ...access,
      action: 'action-1',
    })
    expect(ok(await admission.port.admit(input)).kind).toBe('allow')
    const answers: AdmissionDecision[] = [
      { kind: 'deny', reason: 'policy', evidence: testEvidence('deny') },
      {
        kind: 'need-decision',
        card: stub({ title: 'ask' }),
        evidence: testEvidence('ask'),
      },
      { kind: 'unavailable', diagnostic: 'down' },
    ]
    for (const answer of answers) admission.admit.once(() => succeed(answer))
    for (const answer of answers) expect(ok(await admission.port.admit(input))).toEqual(answer)
  })
})

describe('request preparation', () => {
  it('prepare answers ready built from its input; derive and resume answer unsupported', async () => {
    const requests = createScriptedRequestPreparation<string>()
    type PrepareInput = Parameters<RequestPreparation<string>['prepare']>[0]
    const input = stub<PrepareInput>({
      ...access,
      action: 'action-1',
      purpose: 'main',
      position: { owner: 'agent', work: 'w', position: 'P1', purpose: 'main' },
      selection: {
        recipient: { route: 'route-1', profile: testAdoption('profile') },
        parameters: [{ kind: 'temperature', value: 0 }],
      },
      context: { coverage: testEvidence('coverage') },
    })
    const prepared = ok(await requests.port.prepare(input))
    expect(prepared).toEqual(readyPreparation(input))
    expect(prepared).toMatchObject({
      kind: 'ready',
      id: 'action-1',
      recipient: { route: 'route-1' },
      coverage: testEvidence('coverage'),
    })
    expect(failure(await requests.port.derive(stub({ ...access })))).toEqual({
      kind: 'unsupported',
    })
    expect(failure(await requests.port.resume(stub({ ...access })))).toEqual({
      kind: 'unsupported',
    })

    requests.prepare.once(() =>
      succeed({ ...prepared, kind: 'cannot-fit', reason: 'fixed', diagnostic: 'big' }),
    )
    expect(ok(await requests.port.prepare(input)).kind).toBe('cannot-fit')
  })
})

describe('adoptions and conditions tables', () => {
  it('adoptions resolve only the exact adoption in the table; handover is unavailable until scripted', async () => {
    const adoptions = createTableAdoptions<string>()
    const exact = testAdoption('definition')
    const resolution = stub<Parameters<typeof adoptions.define>[1]>({
      definition: 'd',
      evaluator: 'e',
      extensions: [],
    })
    adoptions.define(exact, resolution)

    expect(ok(await adoptions.port.resolve({ ...access, adoption: exact }))).toBe(resolution)
    expect(
      failure(await adoptions.port.resolve({ ...access, adoption: { ...exact, digest: 'other' } })),
    ).toEqual(unscripted('agentAdoptions'))
    expect(failure(await adoptions.port.handover(stub({ ...access }))).kind).toBe('unavailable')
  })

  it('conditions answer the table entry of the advancing execution and unavailable otherwise', async () => {
    const conditions = createTableConditions<string>()
    const current = stub<RuntimeConditions>({ source: testEvidence('conditions') })
    conditions.define(execution(), current)
    expect(ok(await conditions.port.read({ ...access, advance: authority, previous: null }))).toBe(
      current,
    )
    expect(
      failure(
        await conditions.port.read({
          ...access,
          advance: { ...authority, execution: execution('exec-2') },
          previous: null,
        }),
      ),
    ).toEqual(unscripted('agentConditions'))
  })
})

describe('selection, model context and handoff', () => {
  it('selection is unavailable until scripted', async () => {
    const selection = createScriptedModelSelection<string>()
    const input = stub<Parameters<typeof selection.port.select>[0]>({ ...access })
    expect(failure(await selection.port.select(input))).toEqual(unscripted('agentModelSelection'))
    const selected = stub<Awaited<ReturnType<typeof selection.port.select>>>(
      succeed({ evidence: testEvidence('selected') }),
    )
    selection.select.always(() => selected)
    expect(await selection.port.select(input)).toBe(selected)
  })

  it('model context reads full for the recipient of the input by default', async () => {
    const context = createScriptedModelContext<string>()
    const recipient = { route: 'route-1', profile: testAdoption('profile') }
    const read = ok(
      await context.port.read({
        ...access,
        advance: authority,
        position: { owner: 'agent', work: 'w', position: 'M0', purpose: 'main' },
        recipient,
        history: testEvidence('history'),
        adopted: null,
        transition: null,
      }),
    )
    expect(read).toMatchObject({ recipient, content: 'full' })
    context.read.once(() => fail({ kind: 'unavailable', owner: 'context', diagnostic: 'down' }))
    expect(
      failure(
        await context.port.read({
          ...access,
          advance: authority,
          position: { owner: 'agent', work: 'w', position: 'M0', purpose: 'main' },
          recipient,
          history: testEvidence('history'),
          adopted: null,
          transition: null,
        }),
      ).kind,
    ).toBe('unavailable')
  })

  it('handoff accepts by default and rejects as scripted', async () => {
    const handoff = createScriptedMessageHandoff<string>()
    const input = stub<Parameters<typeof handoff.port.accept>[0]>({
      ...access,
      operation: operation('h'),
    })
    expect(ok(await handoff.port.accept(input)).kind).toBe('accepted')
    handoff.accept.once(() =>
      succeed({ kind: 'rejected', reason: 'no', evidence: testEvidence('no') }),
    )
    expect(ok(await handoff.port.accept(input))).toMatchObject({ kind: 'rejected', reason: 'no' })
  })
})

describe('manual clock', () => {
  it('now reads the provider instant without waiting and follows controlled advancement', async () => {
    const clock = createManualAgentClock('2026-10-21T07:00:00Z')
    expect(await clock.port.now()).toEqual({ ok: '2026-10-21T07:00:00Z' })
    expect(clock.pending()).toEqual([])
    ok(clock.advanceTo('2026-10-21T07:01:00Z'))
    expect(await clock.port.now()).toEqual({ ok: '2026-10-21T07:01:00Z' })
  })
  it('a wait elapses when the clock reaches its instant and is cancelled when its signal aborts', async () => {
    const clock = createManualAgentClock('2026-10-20T00:00:00Z')
    const elapsed = clock.port.waitUntil('2026-10-20T00:00:10Z', new AbortController().signal)
    const abort = new AbortController()
    const cancelled = clock.port.waitUntil('2026-10-20T01:00:00Z', abort.signal)
    expect(clock.pending()).toEqual(['2026-10-20T00:00:10Z', '2026-10-20T01:00:00Z'])

    expect(ok(clock.advanceTo('2026-10-20T00:00:10Z'))).toBe(1)
    expect(ok(await elapsed)).toBe('elapsed')
    abort.abort()
    expect(ok(await cancelled)).toBe('cancelled')
    expect(clock.pending()).toEqual([])

    expect(
      ok(await clock.port.waitUntil('2026-10-19T00:00:00Z', new AbortController().signal)),
    ).toBe('elapsed')
    expect(failure(clock.advanceTo('2026-10-19T00:00:00Z')).kind).toBe('invalid')
    expect(failure(await clock.port.waitUntil('tomorrow', new AbortController().signal)).kind).toBe(
      'invalid',
    )
    expect(clock.now()).toBe('2026-10-20T00:00:10Z')
  })
})

describe('tool runtime double', () => {
  it('every method answers unavailable until scripted, and a scripted answer comes back', async () => {
    const tools = createScriptedToolRuntime<string>()
    const input = stub<never>({ ...access })
    expect(await tools.port.invoke(input)).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable' },
    })
    expect(await tools.port.commands.control(input)).toMatchObject({ kind: 'rejected' })
    expect(await tools.port.commands.releaseDelivery(input)).toMatchObject({ kind: 'rejected' })
    const replies = [
      tools.port.inspect(input),
      tools.port.queries.lookup(input),
      tools.port.queries.queryOperation(input),
      tools.port.queries.readProcess(input),
      tools.port.queries.readWait(input),
      tools.port.queries.readDiagnostics(input),
      tools.port.queries.readResult(input),
      tools.port.queries.account(input),
      tools.port.instances.current({ access: input, reference: input }),
      tools.port.content.read(input),
      tools.port.content.raw(input),
      tools.port.catalog.inspect(input),
      tools.port.catalog.usage(input),
      tools.port.catalog.search(input),
    ]
    const kinds = (await Promise.all(replies)).map(reply =>
      'failure' in reply ? reply.failure.kind : 'success',
    )
    expect(new Set(kinds)).toEqual(new Set(['unavailable']))
    expect(kinds).toHaveLength(replies.length)

    const reference = stub<never>({ id: 'ref' })
    tools.invoke.once(() => ({ kind: 'commit-unknown', reference }))
    expect(await tools.port.invoke(input)).toEqual({ kind: 'commit-unknown', reference })
    const selection = { state: stub<never>({ phase: 'accepted' }), current: null }
    tools.instances.current.always(() => succeed(selection))
    expect(ok(await tools.port.instances.current({ access: input, reference: input }))).toEqual(
      selection,
    )
    const frames = []
    for await (const frame of tools.port.observation.observe({
      ref: stub<never>({}),
      access: input,
      signal: new AbortController().signal,
    }))
      frames.push(frame)
    expect(frames).toEqual([{ kind: 'ended', reason: 'unavailable' }])
  })
})

describe('locally required ports', () => {
  it('extensions, cards, materials and reads answer unavailable until scripted', async () => {
    const extensions = createScriptedExtensions<string>()
    const cards = createScriptedDecisionCards<string>()
    const materials = createScriptedMaterials<string>()
    const reads = createScriptedReads<string>()
    const input = stub<never>({ ...access, passage: passageId('p') })
    const replies = [
      extensions.port.resolve(input),
      cards.port.present(input),
      cards.port.lookup(input),
      cards.port.read(input),
      cards.port.invalidate(input),
      materials.port.preserve(input),
      materials.port.read(input),
      reads.port.read(input),
      reads.port.lookup(input),
    ]
    const kinds = (await Promise.all(replies)).map(reply =>
      'failure' in reply ? reply.failure.kind : 'success',
    )
    expect(new Set(kinds)).toEqual(new Set(['unavailable']))
    expect(kinds).toHaveLength(replies.length)

    cards.read.always(() => succeed({ kind: 'pending' }))
    materials.preserve.once(() => succeed(testEvidence('kept')))
    reads.lookup.once(() => succeed({ kind: 'unknown' }))
    expect(ok(await cards.port.read(input))).toEqual({ kind: 'pending' })
    expect(ok(await materials.port.preserve(input))).toEqual(testEvidence('kept'))
    expect(ok(await reads.port.lookup(input))).toEqual({ kind: 'unknown' })
  })

  // Red when the scripted card port cannot carry a `remark` reply unchanged. How the Agent reads
  // a remark is not exercised here: no product code consumes `CardReply` yet (#502 stage 2).
  it('the card double hands back a scripted remark unchanged', async () => {
    const cards = createScriptedDecisionCards<string>()
    const input = stub<never>({ ...access, card: testEvidence('card') })
    const remark: CardReply = {
      kind: 'remark',
      text: '先备份再删',
      evidence: testEvidence('remark'),
    }
    cards.read.once(() => succeed(remark))
    expect(ok(await cards.port.read(input))).toEqual(remark)
  })
})

describe('scripted model provider', () => {
  it('models is the runtime of the scripted Model provider, with its controller among the controls', () => {
    const { dependencies, controls } = createTestAgentDependencies<string>()
    expect(Object.keys(dependencies.models).sort()).toEqual(['calls', 'consumption', 'instances'])
    expect(controls.models).toBeTypeOf('object')
  })
})
