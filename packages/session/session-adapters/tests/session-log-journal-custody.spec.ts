// The custody chain of a message handoff (Agent SPEC "准入结果保管") across a recordHandoff whose
// storage outcome is still undecided. The reference core holds the custody attempt of a root
// recordHandoff as soon as the write was tried, so the chain of its H goes on from it while the
// storage has not decided and after the attempt is excluded. The production Journal keeps the
// attempt of an undecided write in the process (see `Held` in agent-journal.ts) and puts it back
// into every copy it rebuilds.
import { describe, expect, it } from 'vitest'
import {
  decodeActionId,
  type AgentJournal,
  type AgentOperationId,
  type DurableEvidence,
} from '@omne-harness/agent-contract'
import { judgeMessage } from '@omne-harness/message'
import { decodeModelCallId } from '@omne-harness/model-contract'
import { assistantMessage, operationId } from '@omne-harness/session-contract/testing'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { createSessionLogJournal } from '../src/cordis/agent-journal.ts'
import { evidence, instance, ok, operation } from './fixtures/common-journal.ts'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

type Journal = AgentJournal<string>
type Handoff = NonNullable<Parameters<Journal['commit']>[0]['handoff']>
type Request = Extract<Handoff, { kind: 'prepare' }>['request']
type RootHandoff = Parameters<Journal['recordHandoff']>[0]

const PROVIDER = {
  owner: 'suite',
  name: 'message-handoff',
  revision: '1',
  digest: 'suite:handoff',
}

/**
 * A provider over the scene whose next storage commit stays undecided: it is not applied, and the
 * storage answers unknown to a query of it from then on.
 */
function undecidedNext(s: SqlScene) {
  const control = { next: false }
  const undecided = new Set<string>()
  const storage: SqlStorage = {
    registerCombination: input => s.storage.registerCombination(input),
    read: (request, options) => s.storage.read(request, options),
    commit: input => {
      if (!control.next) return s.storage.commit(input)
      control.next = false
      undecided.add(input.identity.operation)
      return Promise.resolve({ kind: 'unknown', identity: input.identity, diagnostic: 'undecided' })
    },
    query: identity =>
      undecided.has(identity.operation)
        ? Promise.resolve({ kind: 'unknown', identity, diagnostic: 'undecided' })
        : s.storage.query(identity),
  }
  const journal = createSessionLogJournal<string>({
    storage,
    tenantDomainLookup: { lookup: () => Promise.resolve({ kind: 'ready', domain: s.domain }) },
    sessionAccessCheck: {
      check: check =>
        Promise.resolve({ kind: 'allowed', evidence: evidence(`access/${check.operation}`) }),
    },
    combination: s.combination,
  }).forSession(s.access).journal
  return { journal, control }
}

const proof = (record: string): DurableEvidence => ({
  owner: 'suite',
  record,
  revision: '1',
  digest: `suite:${record}`,
})

/** The H of a model reply at the position I3 of the checkpoint the execution is at. */
function handoffRequest(
  s: SqlScene,
  loaded: Extract<Awaited<ReturnType<Journal['load']>>, { ok: unknown }>['ok'],
  authority: Parameters<Journal['commit']>[0]['authority'],
): Request {
  const call = ok(decodeModelCallId(`mcall_${'0'.repeat(20)}h1`))
  const candidate = judgeMessage(assistantMessage('reply h1'))
  if (!('ok' in candidate)) throw new Error('the candidate message is invalid')
  return {
    kind: 'execution',
    reference: { kind: 'execution', execution: s.execution, operation: operation('h1') },
    predecessor: loaded.revision,
    position: { step: loaded.checkpoint.step, node: 'I3', slot: null },
    source: {
      kind: 'model-reply',
      step: loaded.checkpoint.step,
      action: ok(decodeActionId('core-h1/action')),
      call,
      result: {
        producer: { kind: 'model', call },
        version: 'v1',
        delivery: null,
        source: proof('result/h1'),
      },
    },
    candidate: candidate.ok,
    originalAdvance: authority,
    predecessorHandoff: null,
  } as Request
}

/** The root recordHandoff of `request` under `name`: a prepared outcome, no custody yet. */
function rootOf(s: SqlScene, request: Request, name: string): RootHandoff {
  return {
    ...s.access,
    execution: s.execution,
    operation: operation(name),
    original: {
      kind: 'recorded',
      outcome: {
        request,
        origin: null,
        provider: PROVIDER,
        qualification: proof('qualification/h1'),
        record: proof('record/h1'),
        decision: {
          kind: 'prepared',
          message: request.candidate,
          admission: proof('admission/h1'),
        },
      },
    },
    custody: null,
  } as RootHandoff
}

/** The H prepared at the Journal: the P commit of the suite, then the request. */
async function preparedH(s: SqlScene, journal: Journal) {
  const opened = ok(await journal.open(s.openInput))
  const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
  const request = handoffRequest(s, loaded, opened.authority)
  ok(
    await journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('p1'),
      authority: opened.authority,
      expected: loaded.revision,
      checkpoint: { ...loaded.checkpoint, position: 'Q2', currentHandoff: request.reference },
      state: { kind: 'advancing' },
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: { kind: 'prepare', request },
      finish: null,
    } as Parameters<Journal['commit']>[0]),
  )
  return request
}

const undecided = (journal: Journal, control: { next: boolean }, root: RootHandoff) => {
  control.next = true
  return journal.recordHandoff(root)
}

describe('the custody chain of a recordHandoff whose storage outcome is undecided', () => {
  it('a second root of the same H is invalid while the first root is undecided', async () => {
    const s = await sqlScene('custody-second-root')
    const { journal, control } = undecidedNext(s)
    const request = await preparedH(s, journal)
    const first = rootOf(s, request, 'rh-root')
    expect(await undecided(journal, control, first)).toEqual({
      failure: { kind: 'commit-unknown', operation: first.operation },
    })
    expect(await journal.recordHandoff(rootOf(s, request, 'rh-root-other'))).toEqual({
      failure: {
        kind: 'invalid',
        field: 'operation',
        reason: 'the H already has its custody root',
      },
    })
  })

  it('the direct successor of a root still undecided when a takeover fenced it goes on from it', async () => {
    const s = await sqlScene('custody-after-fence')
    const { journal, control } = undecidedNext(s)
    const request = await preparedH(s, journal)
    const root = rootOf(s, request, 'rh-root')
    expect(await undecided(journal, control, root)).toEqual({
      failure: { kind: 'commit-unknown', operation: root.operation },
    })

    // A takeover attach fences the undecided write: it is excluded in the records that publish.
    const work = ok(await s.port.readWork(s.sessionAccess))
    if (work.run.kind !== 'active') throw new Error('active Run expected')
    const claimed = ok(
      await s.port.commit({
        access: s.sessionAccess,
        command: {
          kind: 'claim',
          input: {
            tenant: s.access.tenant,
            session: s.access.session,
            operation: operationId('claim'),
            run: work.run.run,
            instance: { owner: 'agent', id: 'takeover' },
            continuity: evidence('continuity'),
          },
        },
        guards: [],
      }),
    )
    ok(
      await journal.attach({
        ...s.access,
        execution: s.execution,
        operation: operation('attach-takeover'),
        instance: instance('takeover'),
        grant: claimed.receipt.source,
        recovery: evidence('recovery'),
        takeover: evidence('takeover'),
      }),
    )
    const fenced = ok(
      await journal.query({ ...s.access, execution: s.execution, operation: root.operation }),
    )
    expect(fenced.kind).toBe('excluded')

    const successor = {
      ...root,
      operation: operation('rh-2') as AgentOperationId,
      custody: {
        protocol: 'hand-off-custody-successor/1',
        custodyRoot: root.operation,
        rootRequest: proof(`request/${root.operation}`),
        factSource: {
          owner: PROVIDER.owner,
          adoption: PROVIDER,
          record: 'record/h1',
          version: '1',
        },
        predecessor: { operation: root.operation, request: proof(`request/${root.operation}`) },
        priorExcluded: [
          {
            operation: root.operation,
            method: 'recordHandoff' as const,
            request: proof(`request/${root.operation}`),
            predecessor: null,
            authority: proof(`exclusion/${root.operation}`),
            fence: proof(`fence/${root.operation}`),
          },
        ],
      },
    } as RootHandoff
    expect(await journal.recordHandoff(successor)).toHaveProperty('ok')
  })
})
