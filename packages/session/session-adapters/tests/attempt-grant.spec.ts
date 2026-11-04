// R2-D348 and R2-D349: an Authority is resolved to its Session attempt through the grant of the
// attachment it names. The Agent records only the grant (`exec.attached.grant`), the Session
// records the grant it issued for each attempt (`SessionAttemptRecord.grant`), and nothing is
// guessed from the current advance. Both the SQL provider (`sl_attempt_grant` through the history
// index) and the memory double (`session-sources.ts`) are checked, the same way:
// 1. a second attempt of the same Run (claim, then attach with the claim's receipt) gives two
//    grants, each resolving to its own attempt; the grant is not the evidence of the SE15 row;
// 2. the negative control: the Authority of the previous attempt, same instance, commits after the
//    takeover and answers stale-advance; the Authority of the current attempt commits;
// 3. the admission of an input submitted under the second attempt names that attempt.
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

/** What the two scenes share: the Session port, the Journal, the execution and its first Authority. */
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
  /** The SE11 source basis a submit of the accepted input must carry (AD-14 for the SQL scene). */
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

/** The claim of a second attempt of the active Run by the same instance, then the attach under its grant. */
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
          // The same instance as the open: the attempt changes, the instance does not.
          instance: { owner: 'agent', id: 'instance-1' },
          continuity: evidence(`continuity-${label}`),
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
      // The grant is what the Session handed out, which is not the evidence of the SE15 row.
      for (const item of attempts) {
        expect(item.grant).toBeDefined()
        expect(canonical(item.grant)).not.toBe(canonical(item.started))
      }
      expect(attemptOfGrant(attempts, l.execution, l.grant)?.attempt).toBe(firstAttempt)
      expect(attemptOfGrant(attempts, l.execution, second.grant)?.attempt).toBe(
        second.attempt.attempt,
      )
      // A grant the Session issued no attempt for names none: no fallback to the single or
      // current attempt.
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
