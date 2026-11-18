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

function undecidedNext(s: SqlScene) {
  const control = { next: false }
  const undecided = new Set<string>()
  const storage: SqlStorage = {
    database: s.storage.database,
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
            expected: work.run.revision,
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

describe('the custody of a hand-off the journal no longer holds open', () => {
  it('a custody attempt that comes after the hand-off closed is recorded, and the next one sees it', async () => {
    const s = await sqlScene('custody-after-close')
    const journal = s.view.journal
    const opened = ok(await journal.open(s.openInput))
    const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
    const request = handoffRequest(s, loaded, opened.authority)
    const commit = async (name: string, change: object) => {
      const at = ok(await journal.load({ ...s.access, execution: s.execution }))
      ok(
        await journal.commit({
          ...s.access,
          execution: s.execution,
          operation: operation(name),
          authority: opened.authority,
          expected: at.revision,
          checkpoint: at.checkpoint,
          state: { kind: 'advancing' },
          events: [],
          effects: [],
          caller: { kind: 'none' },
          replyAdmission: null,
          handoff: null,
          finish: null,
          ...change,
        } as Parameters<Journal['commit']>[0]),
      )
    }
    const excluded = {
      kind: 'excluded' as const,
      request,
      origin: null,
      exclusion: proof('exclusion/h1'),
    }
    await commit('prepare', {
      checkpoint: { ...loaded.checkpoint, position: 'Q2', currentHandoff: request.reference },
      handoff: { kind: 'prepare', request },
    })
    await commit('retire', {
      checkpoint: { ...loaded.checkpoint, position: 'I3', currentHandoff: null },
      handoff: { kind: 'retire', excluded, reason: proof('retired/h1') },
    })
    // The step moves on: nothing holds the retired hand-off, and its item closes.
    await commit('next-step', {
      checkpoint: { ...loaded.checkpoint, position: 'I3', step: 'step-2', currentHandoff: null },
    })
    const after = ok(await journal.load({ ...s.access, execution: s.execution }))
    expect(after.handoffs.filter(item => item.handoff.kind === 'execution')).toEqual([])

    const root = { ...rootOf(s, request, 'rh-late'), original: excluded } as RootHandoff
    const recorded = ok(await journal.recordHandoff(root))
    expect(await journal.recordHandoff(root)).toEqual({ ok: recorded })
    // Another replica reads the closed hand-off and the attempt recorded under it.
    const other = { ...rootOf(s, request, 'rh-late-other'), original: excluded } as RootHandoff
    expect(await s.fresh().journal.recordHandoff(other)).toEqual({
      failure: {
        kind: 'invalid',
        field: 'operation',
        reason: 'the H already has its custody root',
      },
    })
    await s.close()
  })
})
