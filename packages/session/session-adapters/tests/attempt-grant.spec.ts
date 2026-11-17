import { afterEach, describe, expect, it } from 'vitest'
import type { Authority, DurableEvidence } from '@omne-harness/agent-contract'
import type { SessionAttemptRecord, WorkSnapshot } from '@omne-harness/session-contract'
import { guard, ordinaryInput } from '@omne-harness/session-contract/testing'
import { decodeInputId } from '@omne-harness/agent-contract'
import { canonical } from '../src/testing/canonical.ts'
import { attemptOfGrant } from '../src/cordis/attempt-grant.ts'
import {
  evidence,
  instance,
  ok,
  operation,
  operationId,
  scene,
  submitInput,
} from './fixtures/common-journal.ts'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

const scenes: { close(): Promise<void> }[] = []
afterEach(async () => {
  for (const s of scenes.splice(0)) await s.close()
})

type Lane = Readonly<{
  name: string
  access: SqlScene['access']
  sessionAccess: SqlScene['sessionAccess']
  execution: SqlScene['execution']
  checkpoint: SqlScene['checkpoint']
  grant: DurableEvidence
  authority: Authority
  journal: SqlScene['view']['journal']
  commit: SqlScene['port']['commit']
  readWork(): Promise<WorkSnapshot>
  submitSource: 'receipt' | 'origin'
}>

async function sqlLane(name: string): Promise<Lane> {
  const s = await sqlScene(name)
  scenes.push(s)
  const opened = ok(await s.view.journal.open(s.openInput))
  return {
    name,
    access: s.access,
    sessionAccess: s.sessionAccess,
    execution: s.execution,
    checkpoint: s.checkpoint,
    grant: s.grant,
    authority: opened.authority,
    journal: s.view.journal,
    commit: input => s.port.commit(input),
    readWork: async () => ok(await s.port.readWork(s.sessionAccess)),
    submitSource: 'receipt',
  }
}

async function memoryLane(name: string): Promise<Lane> {
  const s = await scene(name)
  return {
    name,
    access: s.access,
    sessionAccess: s.access,
    execution: s.execution,
    checkpoint: s.checkpoint,
    grant: s.input.runtime.grant as DurableEvidence,
    authority: s.opened.authority,
    journal: s.view.journal,
    commit: input => s.backend.transactions.commit(input as never),
    readWork: async () => ok(await s.backend.transactions.readWork(s.access)),
    submitSource: 'origin',
  }
}

async function takeover(lane: Lane, label: string) {
  const before = await lane.readWork()
  if (before.run.kind !== 'active') throw new Error('an active Run is expected')
  const claimed = ok(
    await lane.commit({
      access: lane.sessionAccess,
      command: {
        kind: 'claim',
        input: {
          tenant: lane.access.tenant,
          session: lane.access.session,
          operation: operationId(`claim-${label}`),
          run: before.run.run,
          instance: { owner: 'agent', id: 'instance-1' },
          continuity: evidence(`continuity-${label}`),
          expected: before.run.revision,
        },
      },
      guards: [],
    }),
  )
  const attached = ok(
    await lane.journal.attach({
      ...lane.access,
      execution: lane.execution,
      operation: operation(`attach-${label}`),
      instance: instance(),
      grant: claimed.receipt.source,
      recovery: evidence(`recovery-${label}`),
      takeover: evidence(`takeover-${label}`),
    }),
  )
  const after = await lane.readWork()
  if (after.run.kind !== 'active' || after.run.advance === null) throw new Error('not active')
  return {
    grant: claimed.receipt.source,
    authority: attached.authority,
    attempt: after.run.advance,
  }
}

const attemptsOf = (work: WorkSnapshot): readonly SessionAttemptRecord[] => {
  if (work.historyIndex === undefined) throw new Error('the snapshot carries no history index')
  return work.historyIndex.attempts
}

type CommitInput = Parameters<Lane['journal']['commit']>[0]

const commitInput = (
  lane: Lane,
  authority: Authority,
  name: string,
  revision: CommitInput['expected'],
): CommitInput => ({
  ...lane.access,
  execution: lane.execution,
  operation: operation(name),
  authority,
  expected: revision,
  checkpoint: lane.checkpoint,
  state: { kind: 'advancing' as const },
  events: [],
  effects: [],
  caller: { kind: 'none' as const },
  replyAdmission: null,
  handoff: null,
  finish: null,
})

for (const [kind, lane] of [
  ['the SQL provider', sqlLane],
  ['the memory double', memoryLane],
] as const) {
  describe(`${kind}: the grant of an attempt`, () => {
    it('a second attempt of the same Run has its own grant, and each grant resolves to its attempt', async () => {
      const l = await lane(`grant-two-${kind === 'the SQL provider' ? 'sql' : 'memory'}`)
      const first = await l.readWork()
      if (first.run.kind !== 'active' || first.run.advance === null) throw new Error('not active')
      const firstAttempt = first.run.advance.attempt
      const second = await takeover(l, '2')
      expect(second.attempt.attempt).not.toBe(firstAttempt)
      expect(canonical(second.grant)).not.toBe(canonical(l.grant))

      const attempts = attemptsOf(await l.readWork())
      expect(attempts.map(item => item.attempt)).toEqual([firstAttempt, second.attempt.attempt])
      for (const item of attempts) {
        expect(item.grant).toBeDefined()
        expect(canonical(item.grant)).not.toBe(canonical(item.started))
      }
      expect(attemptOfGrant(attempts, l.execution, l.grant)?.attempt).toBe(firstAttempt)
      expect(attemptOfGrant(attempts, l.execution, second.grant)?.attempt).toBe(
        second.attempt.attempt,
      )
      expect(
        attemptOfGrant(attempts, l.execution, { ...l.grant, digest: 'sha256:' + '0'.repeat(64) }),
      ).toBeUndefined()
      expect(attemptOfGrant(attempts, l.execution, attempts[0]?.started ?? null)).toBeUndefined()
    })

    it('negative control: the Authority of the previous attempt, same instance, is stale-advance; the current one commits', async () => {
      const l = await lane(`grant-stale-${kind === 'the SQL provider' ? 'sql' : 'memory'}`)
      const second = await takeover(l, '2')
      expect(second.authority.instance).toBe(l.authority.instance)
      const loaded = ok(await l.journal.load({ ...l.access, execution: l.execution }))
      expect(
        await l.journal.commit(commitInput(l, l.authority, 'former', loaded.revision)),
      ).toEqual({ failure: { kind: 'stale-advance' } })
      expect(
        ok(await l.journal.commit(commitInput(l, second.authority, 'current', loaded.revision)))
          .state,
      ).toBe('applied')
    })

    it('an input submitted under the second attempt is admitted under that attempt', async () => {
      const l = await lane(`grant-admission-${kind === 'the SQL provider' ? 'sql' : 'memory'}`)
      const second = await takeover(l, '2')
      const value = ordinaryInput('input-2')
      const accepted = ok(
        await l.commit({
          access: l.sessionAccess,
          command: {
            kind: 'accept',
            input: {
              tenant: l.access.tenant,
              session: l.access.session,
              operation: operationId('accept-2'),
              value,
            },
          },
          guards: [guard('evidence-bridge', 'ordinary-intake', value)],
        }),
      )
      const source =
        l.submitSource === 'receipt'
          ? (accepted as { source: DurableEvidence }).source
          : value.origin
      ok(
        await l.journal.submit(
          submitInput(l.access, l.execution, operation('submit-2'), {
            id: ok(decodeInputId('input-2')),
            source,
            content: value.message,
            priority: 'ordinary',
          }),
        ),
      )
      const work = await l.readWork()
      const directory = work.historyIndex?.inputs.find(item => item.input === ('input-2' as never))
      expect(directory?.members.map(item => item.attempt)).toEqual([second.attempt.attempt])
    })
  })
}

describe('the SQL provider: the Session snapshot of a write cannot be read', () => {
  it('answers unavailable to the current Authority, not stale-advance; the same commit goes through once the read answers', async () => {
    const l = await sqlLane('grant-unreadable')
    const s = scenes.at(-1) as SqlScene
    const loaded = ok(await l.journal.load({ ...l.access, execution: l.execution }))
    const input = commitInput(l, l.authority, 'during', loaded.revision)
    s.rewriteReads.current = (request, answer) =>
      request.handler.startsWith('session.work')
        ? {
            kind: 'unavailable',
            requestKey: request.requestKey,
            reason: 'queue_full',
            diagnostic: null,
          }
        : answer
    const refused = await l.journal.commit(input)
    s.rewriteReads.current = null
    expect(refused).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(ok(await l.journal.commit(input)).state).toBe('applied')
  })
})
