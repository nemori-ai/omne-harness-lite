import { originalScope } from './original-scope.ts'
import {
  decodeAgentExecutionId,
  decodeInputId,
  type Access,
  type AgentEvent,
  type AgentExecutionId,
} from '@omne-harness/agent-contract'
import {
  type AgentJournalEntriesFixture,
  type ReceivedCommitFixture,
} from '@omne-harness/agent-contract/testing'
import { type SessionId } from '@omne-harness/session-contract'
import {
  createMemoryInitializationSource,
  createPolicySessionAccessCheck,
  sessionId,
  memoryAccess,
  memoryOtherAccess,
  operationId,
} from '@omne-harness/session-contract/testing'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail } from '@omne-harness/operation-result'
import { canonical } from '../../src/testing/canonical.ts'
import { sessionView } from '../../src/testing/session-view.ts'
import { createMemorySessionJournal } from '../../src/testing.ts'
import { ok, operation, instance, checkpoint, evidence, openInput } from './common-journal.ts'

export function entriesFixture() {
  const initialization = createMemoryInitializationSource(),
    access = memoryAccess('alice'),
    otherAccess = memoryOtherAccess('bob')
  const backend = createMemorySessionJournal({
    initialization,
    accessCheck: createPolicySessionAccessCheck(request => ({
      kind: 'allowed',
      evidence: evidence(`access/${request.operation}`),
    })),
    authorize: () => 'allowed',
  })
  const scopes = new Map<string, SessionId>(),
    baselines = new Map<string, number>()
  const observations: Array<{ scope: string; raw: number; baseline: number; adjusted: number }> = []
  const materialRoutes = new Map<string, ReturnType<typeof backend.forSession>>()
  const consumerRoutes = new Map<string, ReturnType<typeof backend.forSession>>()
  const scopeKey = (who: Access<string>, execution: string) =>
    canonical([tenantCodec.encode(who.tenant), execution])
  const scopeFor = (who: Access<string>, execution: string) => {
    const key = scopeKey(who, execution),
      held = scopes.get(key)
    if (held) return held
    const session = sessionId(`entries-scope-${scopes.size + 1}`)
    scopes.set(key, session)
    return session
  }
  const bound = (who: Access<string> & { execution: AgentExecutionId }) =>
    backend.forSession({ tenant: who.tenant, session: scopeFor(who, who.execution) })
  const invalidBoundary = backend.forSession({
    ...access,
    session: sessionId('invalid-input-boundary'),
  })
  const provider = sessionView<string>(who => {
    if (
      !tenantCodec.encode(who.tenant).ok ||
      !('execution' in who) ||
      typeof who.execution !== 'string' ||
      who.execution.length === 0
    )
      return invalidBoundary
    if (!('execution' in who) || typeof who.execution !== 'string')
      throw new Error('fixture execution route missing')
    return bound({ ...who, execution: ok(decodeAgentExecutionId(who.execution)) })
  })
  provider.materials.preserve = async input => {
    const view = consumerRoutes.get(canonical([tenantCodec.encode(input.tenant), input.consumer]))
    if (!view) return fail({ kind: 'denied', action: 'preserve' })
    const result = await view.materials.preserve(input)
    if ('ok' in result) materialRoutes.set(canonical(result.ok), view)
    return result
  }
  provider.materials.read = async input => {
    const view = materialRoutes.get(canonical(input.source))
    return view
      ? view.materials.read(input)
      : fail({ kind: 'unavailable', owner: 'material', diagnostic: 'no original material route' })
  }
  // The events as `AgentJournal.read` pages them; `denied` is the answer for an execution that
  // does not exist (or belongs to another tenant), any other failure is a defect of the run.
  const listEvents = async (
    who: Access<string>,
    execution: AgentExecutionId,
  ): Promise<readonly AgentEvent[] | undefined> => {
    const listed: AgentEvent[] = []
    let after: string | null = null
    for (;;) {
      const page = await provider.journal.output.read({ ...who, execution, after, limit: 100 })
      if ('failure' in page) {
        if (page.failure.kind === 'denied') return undefined
        throw new Error(`fixture read failed: ${JSON.stringify(page.failure)}`)
      }
      if (page.ok.kind !== 'page') throw new Error('fixture read met a retention gap')
      listed.push(...page.ok.events)
      after = page.ok.next
      if (page.ok.caughtUp) return listed
    }
  }
  const fixture: AgentJournalEntriesFixture<string> = {
    entries: provider.entries,
    access,
    otherAccess,
    async open(who, execution) {
      const session = scopeFor(who, execution)
      const seed = await originalScope(initialization, { ...who, session }, execution),
        initial = seed.command.input.creation.initial
      if (!initial) throw new Error('initial fixture missing')
      ok(backend.controls.loadHistory(seed))
      const grant = ok(backend.controls.originalGrant({ ...who, session, execution }))
      const opened = ok(
        await provider.journal.open(
          openInput({
            access: who,
            execution,
            operation: operation('fixture-open'),
            instance: instance(),
            grant,
            initial: {
              id: ok(decodeInputId(initial.input)),
              content: initial.message,
              source: initial.origin,
              priority: 'ordinary',
            },
            checkpoint: checkpoint(),
          }),
        ),
      )
      baselines.set(scopeKey(who, execution), Number(opened.receipt.revision))
      return opened.authority
    },
    async supersede(who, execution) {
      return ok(
        await provider.journal.attach({
          ...who,
          execution,
          operation: operation('fixture-attach'),
          instance: instance('replacement'),
          grant: ok(
            backend.controls.originalGrant({
              ...who,
              session: scopeFor(who, execution),
              execution,
            }),
          ),
          recovery: evidence('recovery'),
          takeover: evidence('takeover'),
        }),
      ).authority
    },
    async end(who, execution) {
      let loaded = ok(await provider.journal.load({ ...who, execution }))
      const authority = loaded.executionAttachment
      if (!authority) throw new Error('no attachment')
      const page = ok(
        await provider.journal.inputs({ ...who, execution, watermark: loaded.inputWatermark }),
      )
      ok(
        await provider.journal.commit({
          ...who,
          execution,
          operation: operation('fixture-take'),
          authority,
          expected: loaded.revision,
          checkpoint: { ...loaded.checkpoint, inputBatch: page.batch.id },
          state: { kind: 'advancing' },
          events: [{ kind: 'input-taken', batch: page.batch }],
          effects: [],
          caller: { kind: 'none' },
          replyAdmission: null,
          handoff: null,
          finish: null,
        }),
      )
      // The Session hands the pending input over by interpreting the input-taken event; its
      // sequence depends on what the case wrote before (an entry written after a takeover already
      // holds an earlier one), so it is looked up by content, not fixed.
      const taken = (await listEvents(who, execution))?.find(
        event => event.body.kind === 'input-taken' && event.body.batch.id === page.batch.id,
      )
      if (!taken) throw new Error('no input-taken event for the fixture batch')
      ok(
        await backend.controls.interpret({
          ...who,
          session: scopeFor(who, execution),
          execution,
          operation: operationId('fixture-take'),
          sequence: taken.sequence,
        }),
      )
      loaded = ok(await provider.journal.load({ ...who, execution }))
      const result = ok(
        await provider.journal.tryFinish({
          ...who,
          execution,
          operation: operation('fixture-end'),
          authorization: { kind: 'advancement', authority },
          expected: loaded.revision,
          intent: {
            conclusion: { kind: 'complete' },
            inputWatermark: loaded.inputWatermark,
            obligations: evidence('obligations'),
            beforeTerminal: evidence('before-terminal'),
            failure: null,
          },
        }),
      )
      if (result.kind !== 'ended') throw new Error(JSON.stringify(result))
    },
    async read(who, execution) {
      const loaded = await provider.journal.load({ ...who, execution })
      return 'ok' in loaded ? loaded.ok.entries : undefined
    },
    events: listEvents,
    // Detaches the current attachment through the public port, as `AgentJournalAttachment.detach`
    // does; the execution stays open (suspended) and the detached attachment stays the latest one.
    async detach(who, execution) {
      const loaded = ok(await provider.journal.load({ ...who, execution }))
      const authority = loaded.executionAttachment
      if (!authority) throw new Error('no current attachment to detach')
      ok(
        await provider.journal.detach({
          ...who,
          execution,
          operation: operation('fixture-detach'),
          authority,
          reason: evidence('detach'),
        }),
      )
    },
    // Scripts the next `record` of that execution that reaches its write step; see the control of
    // the same name on the session journal's receiving controls.
    async failNextRecord(who, execution, fault) {
      bound({ ...who, execution }).controls.failNextRecord({ ...who, execution }, fault)
    },
  }
  const joint: ReceivedCommitFixture<string, ContentBlock> = {
    ...provider,
    received: {
      commit: async input => {
        const result = await provider.received.commit(input)
        if ('ok' in result && result.ok.kind === 'committed')
          materialRoutes.set(canonical(result.ok.value.entry.material), bound(input))
        return result
      },
      query: async input => {
        const result = await provider.received.query(input)
        if ('ok' in result && result.ok.kind === 'committed')
          materialRoutes.set(canonical(result.ok.value.entry.material), bound(input))
        return result
      },
    },
    bind: async input => {
      const view = bound(input)
      await view.controls.bind(input)
      consumerRoutes.set(canonical([tenantCodec.encode(input.tenant), input.entry.consumer]), view)
    },
    material: name => ({
      kind: 'facts',
      schema: { owner: 'suite', name: 'payload', revision: '1', digest: 'fixture' },
      value: { kind: 'string', value: name },
    }),
    inspect: async (who, execution) => {
      const raw = await bound({ ...who, execution }).controls.inspect(who, execution)
      const baseline = baselines.get(scopeKey(who, execution))
      if (baseline === undefined) throw new Error('missing original open baseline')
      observations.push({
        scope: scopeKey(who, execution),
        raw: raw.revision,
        baseline,
        adjusted: raw.revision - baseline,
      })
      return { ...raw, revision: raw.revision - baseline }
    },
    pause: input => bound(input).controls.pause(input),
    fault: (input, point) => bound(input).controls.fault(input, point),
    exclude: (input, evidence) => bound(input).controls.exclude(input, evidence),
    qualify: (who, execution, status) =>
      bound({ ...who, execution }).controls.qualify(who, execution, status),
    retainSaved: (input, saved) => bound(input).controls.retainSaved(input, saved),
    loseMaterial: source => {
      const view = materialRoutes.get(canonical(source))
      if (!view) throw new Error('no original material route')
      view.controls.loseMaterial(source)
    },
  }
  return { fixture, joint, backend, provider, observations }
}
