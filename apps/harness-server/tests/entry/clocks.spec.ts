// 两个时钟入口对象（验收 6）：`sessionClock` 按 session-contract 的 `SessionClock` 形状（`sample`、`waitUntil`），
// `agentClock` 按 agent-contract 的 `AgentClock` 形状（`now`、`waitUntil`）。它们读宿主系统时间，经服务键调用。
import { describe, expect, it } from 'vitest'
import { parseInstant } from '@omne-harness/utc-instant'
import { AgentClockService, agentClockKey } from '@omne-harness/agent-cordis-contract/cordis'
import { SessionClockService, sessionClockKey } from '@omne-harness/session-cordis-contract/cordis'
import { agentClock } from '../../src/entry/agent-clock.ts'
import { sessionClock } from '../../src/entry/session-clock.ts'
import { fixtureEnv, got } from './support.ts'

const soon = (ms: number): string =>
  new Date(
    /* wall-clock: operation-timing -- the test picks a target a little ahead of now. */ Date.now() +
      ms,
  ).toISOString()

async function installedClocks() {
  const fixture = fixtureEnv([])
  await fixture.install(sessionClock)
  await fixture.install(agentClock)
  const session = got(fixture.root.get(sessionClockKey), 'sessionClock')
  const agent = got(fixture.root.get(agentClockKey), 'agentClock')
  return { fixture, session, agent }
}

describe('sessionClock (SessionClock shape)', () => {
  it('is the session-contract definition and samples a parseable UTC instant with protocol and source', async () => {
    const { session } = await installedClocks()
    expect(session).toBeInstanceOf(SessionClockService)
    expect(sessionClock).toMatchObject({ name: 'sessionClock', implementation: 'real' })
    const sample = await session.sample()
    if ('failure' in sample) throw new Error(`sample failed: ${sample.failure.kind}`)
    expect(parseInstant(sample.ok.at).ok).toBe(true)
    expect(sample.ok.protocol).toMatchObject({ owner: 'harness-server', name: 'system-clock' })
    expect(sample.ok.source).toMatchObject({ owner: 'harness-server' })
    expect(sample.ok.source.digest.length).toBeGreaterThan(0)
    const later = await session.sample()
    if ('failure' in later) throw new Error('second sample failed')
    expect(later.ok.at >= sample.ok.at).toBe(true)
    expect(later.ok.source.record).not.toBe(sample.ok.source.record)
  })

  it('waits until a near instant elapses, answers elapsed at once for the past, and cancelled on abort', async () => {
    const { session } = await installedClocks()
    await expect(session.waitUntil(soon(-1000), new AbortController().signal)).resolves.toBe(
      'elapsed',
    )
    await expect(session.waitUntil(soon(20), new AbortController().signal)).resolves.toBe('elapsed')
    const controller = new AbortController()
    const pending = session.waitUntil(soon(60_000), controller.signal)
    controller.abort()
    await expect(pending).resolves.toBe('cancelled')
    const aborted = new AbortController()
    aborted.abort()
    await expect(session.waitUntil(soon(-1), aborted.signal)).resolves.toBe('cancelled')
  })

  it('refuses an instant text that utc-instant does not accept instead of waiting for ever', async () => {
    const { session } = await installedClocks()
    await expect(session.waitUntil('yesterday', new AbortController().signal)).rejects.toThrow(
      TypeError,
    )
    await expect(
      session.waitUntil('2026-01-01T00:00:00+08:00', new AbortController().signal),
    ).rejects.toThrow(TypeError)
  })
})

describe('agentClock (AgentClock shape)', () => {
  it('is the agent-cordis-contract definition and reads a parseable UTC instant', async () => {
    const { agent } = await installedClocks()
    expect(agent).toBeInstanceOf(AgentClockService)
    expect(agentClock).toMatchObject({ name: 'agentClock', implementation: 'real' })
    const now = await agent.now()
    if ('failure' in now) throw new Error(`now failed: ${now.failure.kind}`)
    expect(parseInstant(now.ok).ok).toBe(true)
  })

  it('waits, elapses and cancels through the Reply channel, and refuses an invalid instant as a failure', async () => {
    const { agent } = await installedClocks()
    await expect(agent.waitUntil(soon(-1000), new AbortController().signal)).resolves.toEqual({
      ok: 'elapsed',
    })
    await expect(agent.waitUntil(soon(20), new AbortController().signal)).resolves.toEqual({
      ok: 'elapsed',
    })
    const controller = new AbortController()
    const pending = agent.waitUntil(soon(60_000), controller.signal)
    controller.abort()
    await expect(pending).resolves.toEqual({ ok: 'cancelled' })
    await expect(agent.waitUntil('yesterday', new AbortController().signal)).resolves.toEqual({
      failure: { kind: 'invalid', field: 'instant', reason: 'syntax' },
    })
    await expect(
      agent.waitUntil('2026-01-01T00:00:00+08:00', new AbortController().signal),
    ).resolves.toEqual({
      failure: { kind: 'invalid', field: 'instant', reason: 'offset' },
    })
  })
})
