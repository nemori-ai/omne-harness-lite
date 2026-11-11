// The recovery of an active Run whose execution was handed over (contract PM-14, PM-05; SPEC C2
// 顺序：恢复与接管, the recovery path). S3 hands an active Run to the recovery. It reads the execution
// record: an active attachment is left to the Agent; a suspended execution is claimed with its
// handover evidence as the continuity and resumed under the grant of the new attempt. The claim of
// one handover is recognized when the recovery comes back, so a failed resume is tried again with
// the same grant.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deriveDriveOperation,
  type AgentDrivePort,
  type ExecutionStatus,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence, succeeded } from '@omne-harness/session-contract/testing'
import { acceptedRun as acceptedRunOf } from '../src/recover.ts'
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

const status = (state: ExecutionStatus['state']): ExecutionStatus => ({
  revision: 'revision-7',
  state,
  attachment: state === 'suspended' ? 'detached' : state === 'open' ? 'active' : null,
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
