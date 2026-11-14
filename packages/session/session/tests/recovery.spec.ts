// The recovery of an active Run whose execution was handed over (contract PM-14, PM-05; SPEC C2
// 顺序：恢复与接管, the recovery path). S3 hands an active Run to the recovery. It reads the execution
// record: an active attachment is left to the Agent; a suspended execution is claimed with its
// handover evidence as the continuity and resumed under the grant of the new attempt. The claim of
// one handover is recognized when the recovery comes back, so a failed resume is tried again with
// the same grant.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deriveDriveOperation,
  deriveSessionOperation,
  expectedRevision,
  type AgentDrivePort,
  type ExecutionStatus,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence, succeeded } from '@omne-harness/session-contract/testing'
import { acceptedRun as acceptedRunOf, handsBack } from '../src/recover.ts'
import { sessionSlotReference } from '../src/slot-reference.ts'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, TENANT_A, type Harness } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

type ActiveRun = Extract<WorkSnapshot['run'], { kind: 'active' }>

const read = async (h: Harness): Promise<WorkSnapshot> =>
  succeeded(await h.backend.transactions.readWork(h.access()), 'read')

async function activeRun(h: Harness): Promise<ActiveRun> {
  const { run } = await read(h)
  if (run.kind !== 'active') throw new Error('no active Run')
  return run
}

/** The attempt ordinal of a Run, which the snapshot carries as a decimal text. */
const ordinalOf = (run: ActiveRun): number => Number(run.ordinal)

/** A session whose Run the Agent accepted: the first input is handed over. */
async function acceptedRun(): Promise<Readonly<{ h: Harness; run: ActiveRun }>> {
  const h = await harness({ backend: memoryBackend, advance: true })
  open.push(h)
  await h.create()
  await h.accept('input-1')
  await vi.waitFor(async () => expect((await read(h)).handed).toEqual(['input-1']))
  return { h, run: await activeRun(h) }
}

const status = (
  state: ExecutionStatus['state'],
  lost: ExecutionStatus['lost'] = null,
): ExecutionStatus => ({
  revision: 'revision-7',
  state,
  attachment: state === 'suspended' ? 'detached' : state === 'open' ? 'active' : null,
  lost,
  conclusion: null,
  evidence: evidence('history'),
})

/** The Agent side of a Run whose execution was handed over with the evidence `handover`. */
function handedOver(h: Harness, handover = evidence('handover')) {
  const detach = vi.fn<AgentDrivePort['detach']>(async () => ({ ok: handover }))
  const resume = vi.fn<AgentDrivePort['resume']>(async () => ({
    ok: { revision: 'revision-8', evidence: evidence('resumed') },
  }))
  h.drive.inspect = async () => ({ ok: status('suspended') })
  h.drive.detach = detach
  h.drive.resume = resume
  return { detach, resume, handover }
}

/** The session of the harness, as the recovery names it to the Agent. */
const sessionRef = (h: Harness) => ({ tenant: TENANT_A, session: h.access().session })

/** One startup scan of the tenant: a new scanner reads the union of reasons once. */
async function scan(h: Harness): Promise<void> {
  const handle = succeeded(await h.instance.maintain(TENANT_A), 'maintain')
  await handle.release()
}

describe('the recovery of an active Run (PM-14)', () => {
  it('claims a new attempt for an execution that was handed over and resumes it under that grant', async () => {
    const { h, run } = await acceptedRun()
    const agent = handedOver(h)

    await scan(h)
    await vi.waitFor(() => expect(agent.resume).toHaveBeenCalledTimes(1))

    const after = await activeRun(h)
    expect(after.run).toBe(run.run)
    expect(ordinalOf(after)).toBe(ordinalOf(run) + 1)
    expect(after.advance?.attempt).not.toBe(run.advance?.attempt)
    // The same slot reference: the Run keeps its adoption (CAP-SW02).
    expect(after.advance?.instance).toEqual(sessionSlotReference(h.access().session, run.adoption))
    const execution = run.execution.execution
    const sent = agent.resume.mock.calls[0]![0]
    expect(sent).toMatchObject({ execution, recovery: agent.handover })
    expect(sent.operation).toBe(
      deriveDriveOperation({ kind: 'resume', execution, grant: sent.grant }),
    )
    expect(agent.detach.mock.calls[0]![0]).toMatchObject({ execution, advance: run.advance })
  })

  it('asks about a Run that C2 came to by a replay although its hand-over is not recorded: an execution whose runtime is out of contact is handed back and resumed', async () => {
    const h = await harness({ backend: memoryBackend, advance: true })
    open.push(h)
    await h.create()
    // The first invoke gets no acceptance: the Run stays granted with its first input pending.
    h.drive.invoke = async () => ({ failure: { kind: 'denied' } })
    await h.accept('input-1')
    await vi.waitFor(async () => expect((await read(h)).run.kind).toBe('active'))
    const run = await activeRun(h)
    // The replay is accepted, by a runtime that is out of contact; the hand-over cannot be recorded.
    const bridge = h.evidence as { prepare: Harness['evidence']['prepare'] }
    const prepare = bridge.prepare
    bridge.prepare = async (command, access) =>
      command.kind === 'receive'
        ? { failure: { kind: 'unavailable', owner: 'evidence', diagnostic: 'no source' } }
        : prepare(command, access)
    h.drive.invoke = async () => ({
      ok: { revision: 'revision-1', evidence: evidence('accepted') },
    })
    const agent = handedOver(h)
    h.drive.inspect = async () => ({ ok: status('open', evidence('lost')) })

    await scan(h)
    await vi.waitFor(() => expect(agent.resume).toHaveBeenCalledTimes(1))

    expect((await read(h)).handed).toEqual([])
    expect(ordinalOf(await activeRun(h))).toBe(ordinalOf(run) + 1)
    const execution = run.execution.execution
    expect(agent.detach.mock.calls[0]![0]).toMatchObject({ execution, advance: run.advance })
  })

  it('takes up a granted Run that a later attempt holds although its hand-over is not recorded: the claim is recalled and the execution is resumed', async () => {
    const h = await harness({ backend: memoryBackend, advance: true })
    open.push(h)
    await h.create()
    // No acceptance reaches this instance, as after a restart: the first input stays pending.
    h.drive.invoke = async () => ({ failure: { kind: 'denied' } })
    await h.accept('input-1')
    await vi.waitFor(async () => expect((await read(h)).run.kind).toBe('active'))
    const run = await activeRun(h)
    // A recovery before the restart claimed the Run for the handover and did not resume it.
    const agent = handedOver(h)
    const instance = sessionSlotReference(h.access().session, run.adoption)
    succeeded(
      await h.faces('coordinator').work.claim({
        principal: 'system:coordinator',
        ...sessionRef(h),
        operation: deriveSessionOperation({
          kind: 'claim',
          run: run.run,
          instance,
          continuity: agent.handover,
        }),
        run: run.run,
        instance,
        continuity: agent.handover,
        expected: expectedRevision(await read(h), 'claim'),
      }),
      'the claim before the restart',
    )

    await scan(h)
    await vi.waitFor(() => expect(agent.resume).toHaveBeenCalledTimes(1))

    expect((await read(h)).handed).toEqual([])
    expect(ordinalOf(await activeRun(h))).toBe(ordinalOf(run) + 1)
    expect(agent.resume.mock.calls[0]![0]).toMatchObject({ recovery: agent.handover })
  })

  it('leaves the Run to the Agent while the attachment is active', async () => {
    const { h, run } = await acceptedRun()
    const agent = handedOver(h)
    const inspect = vi.fn<AgentDrivePort['inspect']>(async () => ({ ok: status('open') }))
    h.drive.inspect = inspect

    await scan(h)
    await vi.waitFor(() => expect(inspect).toHaveBeenCalled())
    await new Promise(resolve => setImmediate(resolve))

    expect(agent.detach).not.toHaveBeenCalled()
    expect(agent.resume).not.toHaveBeenCalled()
    expect((await activeRun(h)).advance).toEqual(run.advance)
  })

  it('takes up an active attachment whose runtime the host judges out of contact: the attachment is handed back in its place, then claimed and resumed', async () => {
    const { h, run } = await acceptedRun()
    const agent = handedOver(h)
    // For example the runtime of a process that ended: the record still says active.
    h.drive.inspect = async () => ({ ok: status('open', evidence('host-lock')) })

    await scan(h)
    await vi.waitFor(() => expect(agent.resume).toHaveBeenCalledTimes(1))

    const execution = run.execution.execution
    expect(agent.detach.mock.calls[0]![0]).toMatchObject({ execution, advance: run.advance })
    const after = await activeRun(h)
    expect(ordinalOf(after)).toBe(ordinalOf(run) + 1)
    expect(agent.resume.mock.calls[0]![0]).toMatchObject({ execution, recovery: agent.handover })
  })

  it.each([
    ['an execution that has no attachment', { ...status('open'), attachment: null }],
    [
      'a judgment that came with a record that is not open',
      { ...status('ended'), lost: evidence('host-lock') },
    ],
  ] as const)('does not hand back %s', (_name, given) => {
    expect(handsBack(given)).toBe(false)
  })

  it('recognizes its claim after a resume that failed: the next scan resumes with the same grant and no new attempt', async () => {
    const { h, run } = await acceptedRun()
    const agent = handedOver(h)
    agent.resume.mockImplementationOnce(async () => ({
      failure: { kind: 'unavailable', diagnostic: 'the Agent host is not ready' },
    }))

    await scan(h)
    await vi.waitFor(() => expect(agent.resume).toHaveBeenCalledTimes(1))
    const claimed = await activeRun(h)
    expect(ordinalOf(claimed)).toBe(ordinalOf(run) + 1)

    await scan(h)
    await vi.waitFor(() => expect(agent.resume).toHaveBeenCalledTimes(2))

    expect((await activeRun(h)).ordinal).toBe(claimed.ordinal)
    const [first, second] = agent.resume.mock.calls.map(call => call[0])
    expect(second!.grant).toEqual(first!.grant)
    expect(second!.operation).toBe(first!.operation)
  })

  it('claims again after the resumed execution was handed over a second time', async () => {
    const { h, run } = await acceptedRun()
    const agent = handedOver(h, evidence('handover-1'))
    await scan(h)
    await vi.waitFor(() => expect(agent.resume).toHaveBeenCalledTimes(1))

    agent.detach.mockImplementation(async () => ({ ok: evidence('handover-2') }))
    await scan(h)
    await vi.waitFor(() => expect(agent.resume).toHaveBeenCalledTimes(2))

    expect(ordinalOf(await activeRun(h))).toBe(ordinalOf(run) + 2)
    const [first, second] = agent.resume.mock.calls.map(call => call[0])
    expect(second!.grant).not.toEqual(first!.grant)
  })

  it('does nothing when the execution record cannot be read', async () => {
    const { h, run } = await acceptedRun()
    const agent = handedOver(h)
    const inspect = vi.fn<AgentDrivePort['inspect']>(async () => ({
      failure: { kind: 'unavailable', diagnostic: 'offline' },
    }))
    h.drive.inspect = inspect

    await scan(h)
    await vi.waitFor(() => expect(inspect).toHaveBeenCalled())
    await new Promise(resolve => setImmediate(resolve))

    expect(agent.resume).not.toHaveBeenCalled()
    expect((await activeRun(h)).advance).toEqual(run.advance)
  })
})

describe('what a step of the recovery leaves when it fails (PM-05)', () => {
  /** The C2 diagnostics of the recovery steps, as (step, reason). */
  const reported = (h: Harness) =>
    h
      .diagnostics()
      .filter(d => d.owner === 'C2' && ['detach', 'claim', 'resume'].includes(d.step))
      .map(d => [d.step, d.reason])
  const settle = () => new Promise(resolve => setTimeout(resolve, 20))

  it('asks the Agent for the record of the execution of the session, and derives the detach from the advance', async () => {
    const { h, run } = await acceptedRun()
    const agent = handedOver(h)
    const inspect = vi.fn<AgentDrivePort['inspect']>(async () => ({ ok: status('suspended') }))
    h.drive.inspect = inspect

    await scan(h)
    await vi.waitFor(() => expect(agent.resume).toHaveBeenCalledTimes(1))

    const execution = run.execution.execution
    expect(inspect.mock.calls[0]![0]).toEqual({ ...sessionRef(h), execution })
    expect(agent.detach.mock.calls[0]![0].operation).toBe(
      deriveDriveOperation({ kind: 'detach', execution, advance: run.advance! }),
    )
    expect(reported(h)).toEqual([])
  })

  it('a resume that the Agent refuses for good is reported, and the claim stays', async () => {
    const { h, run } = await acceptedRun()
    const agent = handedOver(h)
    agent.resume.mockImplementation(async () => ({ failure: { kind: 'denied' } }))

    await scan(h)
    await vi.waitFor(() => expect(reported(h)).toEqual([['resume', 'denied']]))
    expect(ordinalOf(await activeRun(h))).toBe(ordinalOf(run) + 1)
  })

  it.each(['unavailable', 'busy', 'commit-unknown'] as const)(
    'a resume that answers %s is left to the next scan without a report',
    async kind => {
      const { h } = await acceptedRun()
      const agent = handedOver(h)
      agent.resume.mockImplementation(
        async () =>
          ({
            failure:
              kind === 'commit-unknown'
                ? { kind, operation: 'op' }
                : kind === 'busy'
                  ? { kind }
                  : { kind, diagnostic: 'later' },
          }) as never,
      )

      await scan(h)
      await vi.waitFor(() => expect(agent.resume).toHaveBeenCalledTimes(1))
      await settle()
      expect(reported(h)).toEqual([])
    },
  )

  it('a detach that fails for good is reported and nothing is claimed; an unavailable one is not reported', async () => {
    const { h, run } = await acceptedRun()
    const agent = handedOver(h)
    agent.detach.mockImplementationOnce(async () => ({ failure: { kind: 'denied' } }))

    await scan(h)
    await vi.waitFor(() => expect(reported(h)).toEqual([['detach', 'denied']]))
    expect(agent.resume).not.toHaveBeenCalled()
    expect((await activeRun(h)).advance).toEqual(run.advance)

    agent.detach.mockImplementationOnce(async () => ({
      failure: { kind: 'unavailable', diagnostic: 'later' },
    }))
    await scan(h)
    await vi.waitFor(() => expect(agent.detach).toHaveBeenCalledTimes(2))
    await settle()
    expect(reported(h)).toEqual([['detach', 'denied']])
    expect(agent.resume).not.toHaveBeenCalled()
  })

  it('a port that throws is an unavailable port: nothing is reported, and the next scan goes on', async () => {
    const { h, run } = await acceptedRun()
    const agent = handedOver(h)
    const inspect = vi.fn<AgentDrivePort['inspect']>(async () => {
      throw new Error('inspect crashed')
    })
    h.drive.inspect = inspect
    await scan(h)
    await vi.waitFor(() => expect(inspect).toHaveBeenCalledTimes(1))
    await settle()
    expect(agent.detach).not.toHaveBeenCalled()

    h.drive.inspect = async () => ({ ok: status('suspended') })
    agent.resume.mockImplementationOnce(async () => {
      throw new Error('resume crashed')
    })
    await scan(h)
    await vi.waitFor(() => expect(agent.resume).toHaveBeenCalledTimes(1))
    await settle()
    expect(reported(h)).toEqual([])
    // The claim of the crashed resume is recognized: the next scan resumes under the same attempt.
    await scan(h)
    await vi.waitFor(() => expect(agent.resume).toHaveBeenCalledTimes(2))
    expect(ordinalOf(await activeRun(h))).toBe(ordinalOf(run) + 1)
  })

  it('without the Agent drive port the recovery asks nothing', async () => {
    const { h, run } = await acceptedRun()
    const agent = handedOver(h)
    const inspect = vi.fn<AgentDrivePort['inspect']>(async () => ({ ok: status('suspended') }))
    h.drive.inspect = inspect
    h.setDrive(false)

    await scan(h)
    await settle()
    expect(inspect).not.toHaveBeenCalled()
    expect(agent.resume).not.toHaveBeenCalled()
    expect((await activeRun(h)).advance).toEqual(run.advance)
  })

  it('a query of the claim that does not answer claims nothing: the next scan asks again', async () => {
    const { h, run } = await acceptedRun()
    const agent = handedOver(h)
    // The check of the query, which follows the detach, answers unavailable once.
    agent.detach.mockImplementationOnce(async () => {
      h.checks.script({ kind: 'unavailable', diagnostic: 'the access check is offline' })
      return { ok: agent.handover }
    })

    await scan(h)
    await vi.waitFor(() => expect(agent.detach).toHaveBeenCalledTimes(1))
    await settle()
    expect(agent.resume).not.toHaveBeenCalled()
    expect((await activeRun(h)).advance).toEqual(run.advance)
    expect(reported(h)).toEqual([])

    await scan(h)
    await vi.waitFor(() => expect(agent.resume).toHaveBeenCalledTimes(1))
    expect(ordinalOf(await activeRun(h))).toBe(ordinalOf(run) + 1)
  })

  it('a claim that is refused for good is reported and nothing is resumed', async () => {
    const { h, run } = await acceptedRun()
    const agent = handedOver(h)
    // After the detach come the check of the query, which passes, and the check of the claim.
    agent.detach.mockImplementationOnce(async () => {
      h.checks.script(
        { kind: 'allowed', evidence: evidence('access/queryOperation') },
        { kind: 'denied' },
      )
      return { ok: agent.handover }
    })

    await scan(h)
    await vi.waitFor(() => expect(reported(h)).toEqual([['claim', 'denied']]))
    expect(agent.resume).not.toHaveBeenCalled()
    expect((await activeRun(h)).advance).toEqual(run.advance)
  })

  it('another recovery that claims first makes this claim fail without a report, and nothing is resumed here', async () => {
    const { h, run } = await acceptedRun()
    const agent = handedOver(h)
    // Between the snapshot this recovery read and its claim, another recovery claims the Run
    // for a handover of its own: the Run layer moved, so the claim here does not commit.
    agent.detach.mockImplementationOnce(async () => {
      const snapshot = await read(h)
      const instance = sessionSlotReference(h.access().session, run.adoption)
      const continuity = evidence('handover-of-another-recovery')
      succeeded(
        await h.faces('coordinator').work.claim({
          principal: 'system:coordinator',
          ...sessionRef(h),
          operation: deriveSessionOperation({ kind: 'claim', run: run.run, instance, continuity }),
          run: run.run,
          instance,
          continuity,
          expected: expectedRevision(snapshot, 'claim'),
        }),
        'the claim of the other recovery',
      )
      return { ok: agent.handover }
    })

    await scan(h)
    await vi.waitFor(() => expect(agent.detach).toHaveBeenCalledTimes(1))
    await settle()
    expect(agent.resume).not.toHaveBeenCalled()
    expect(reported(h)).toEqual([])
    // The other recovery holds the advance: one attempt more, not two.
    expect(ordinalOf(await activeRun(h))).toBe(ordinalOf(run) + 1)
  })

  it('triggers that arrive while a check is in flight are absorbed into one more check', async () => {
    const { h } = await acceptedRun()
    handedOver(h)
    let release = () => {}
    const held = new Promise<void>(resolve => (release = resolve))
    const inspect = vi.fn<AgentDrivePort['inspect']>(async () => {
      if (inspect.mock.calls.length === 1) await held
      return { ok: status('open') }
    })
    h.drive.inspect = inspect

    await scan(h)
    await vi.waitFor(() => expect(inspect).toHaveBeenCalledTimes(1))
    await scan(h)
    await scan(h)
    await settle()
    expect(inspect).toHaveBeenCalledTimes(1)
    release()
    await vi.waitFor(() => expect(inspect).toHaveBeenCalledTimes(2))
    await settle()
    expect(inspect).toHaveBeenCalledTimes(2)
  })
})

describe('the Run that the Agent accepted (PM-14, PA-06 item 2)', () => {
  /** The snapshot of the harness with these inputs pending and handed over. */
  const shaped = async (pending: readonly string[], handed: readonly string[]) => {
    const { h } = await acceptedRun()
    return { ...(await read(h)), pending, handed } as unknown as WorkSnapshot
  }

  it('a first input that is still pending without a hand-over is not accepted: C2 replays the invoke', async () => {
    expect(acceptedRunOf(await shaped(['input-1'], []))).toBe(null)
  })

  it('a first input with a hand-over is accepted', async () => {
    expect(acceptedRunOf(await shaped(['input-1'], ['input-1']))?.first).toBe('input-1')
    expect(acceptedRunOf(await shaped([], ['input-1']))?.first).toBe('input-1')
  })

  it('a first input that the Agent took in a batch is accepted, also when no hand-over was recorded', async () => {
    // The hand-over needs the production evidence source; a deployment without it records none,
    // and the batch the Agent took is then the only fact that says the Run was accepted.
    expect(acceptedRunOf(await shaped([], []))?.first).toBe('input-1')
  })

  it('a Run that is not active is not one', async () => {
    const terminal = { ...(await shaped([], [])), run: { kind: 'none' } } as unknown as WorkSnapshot
    expect(acceptedRunOf(terminal)).toBe(null)
  })
})
