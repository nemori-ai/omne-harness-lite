import { describe, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  ControlProgress,
  SessionCallControl,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { memoryAccess, operationId } from '@omne-harness/session-contract/testing'
import { createDirectControl } from '../src/direct-control.ts'
import { defaultSchedulingPolicy } from '../src/policy.ts'
import { Lifecycle } from '../src/lifecycle.ts'
import type { Scheduling } from '../src/scheduling.ts'

const access = memoryAccess('tester', 'direct-control')
const ref = { tenant: access.tenant, session: access.session }
const producer = { kind: 'tool', call: 'call-bg' } as const
const snapshot = {
  backgroundPlaceholders: ['c1'],
  consumptions: [{ id: 'c1', binding: { producer } }],
} as unknown as WorkSnapshot
const stop = {
  operation: operationId('stop'),
  target: { kind: 'producer', producer },
  intent: { kind: 'control', value: { kind: 'stop-call', producer } },
  state: 'propagating',
  pending: [producer],
} as ControlProgress

function frame(port: SessionCallControl | null, maxReplays = 3) {
  const holder = { port }
  const waits: (() => void)[] = []
  const scheduling = {
    wait: () => new Promise(resolve => waits.push(() => resolve('elapsed'))),
  } as unknown as Scheduling<string>
  const direct = createDirectControl({
    port: { current: () => holder.port },
    lifecycle: new Lifecycle(),
    policy: { ...defaultSchedulingPolicy, controlReplay: { intervalMs: 1, maxReplays } },
    scheduling,
  })
  const elapse = async () => {
    for (const resolve of waits.splice(0)) resolve()
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  return { holder, direct, elapse }
}

describe('the direct sender of backgrounded-call controls', () => {
  it('waits while the port is away and sends once it is present', async () => {
    const sent = vi.fn<SessionCallControl['control']>(async () => succeed('recorded' as const))
    const f = frame(null)
    f.direct.launch(ref, snapshot, stop)
    await f.elapse()
    expect(sent).not.toHaveBeenCalled()
    f.holder.port = { control: sent }
    await f.elapse()
    expect(sent).toHaveBeenCalledTimes(1)
  })

  it('does not send again once recorded; after forget the same control is sent anew', async () => {
    const sent = vi.fn<SessionCallControl['control']>(async () => succeed('recorded' as const))
    const f = frame({ control: sent })
    f.direct.launch(ref, snapshot, stop)
    await f.elapse()
    f.direct.launch(ref, snapshot, stop)
    await f.elapse()
    expect(sent).toHaveBeenCalledTimes(1)
    f.direct.forget({ ...ref, session: 'other' as typeof ref.session }, stop.operation)
    f.direct.launch(ref, snapshot, stop)
    await f.elapse()
    expect(sent).toHaveBeenCalledTimes(1)
    f.direct.forget(ref, stop.operation)
    f.direct.launch(ref, snapshot, stop)
    await f.elapse()
    expect(sent).toHaveBeenCalledTimes(2)
  })

  it('a definite refusal ends the sends; a throw and an unknown commit are asked again within the budget', async () => {
    const refused = vi.fn<SessionCallControl['control']>(async () => fail({ kind: 'unsupported' }))
    const f = frame({ control: refused })
    f.direct.launch(ref, snapshot, stop)
    await f.elapse()
    await f.elapse()
    expect(refused).toHaveBeenCalledTimes(1)
    const flaky = vi
      .fn<SessionCallControl['control']>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(fail({ kind: 'commit-unknown', operation: stop.operation }))
      .mockResolvedValue(succeed('recorded'))
    const g = frame({ control: flaky })
    g.direct.launch(ref, snapshot, stop)
    for (let i = 0; i < 4; i += 1) await g.elapse()
    expect(flaky).toHaveBeenCalledTimes(3)
    const away = vi.fn<SessionCallControl['control']>(async () =>
      fail({ kind: 'unavailable', owner: 'tool', diagnostic: 'away' }),
    )
    const h = frame({ control: away }, 2)
    h.direct.launch(ref, snapshot, stop)
    for (let i = 0; i < 4; i += 1) await h.elapse()
    h.direct.launch(ref, snapshot, stop)
    for (let i = 0; i < 2; i += 1) await h.elapse()
    expect(away).toHaveBeenCalledTimes(2)
  })

  it('a control that is not propagating sends nothing', async () => {
    const sent = vi.fn<SessionCallControl['control']>(async () => succeed('recorded' as const))
    const f = frame({ control: sent })
    f.direct.launch(ref, snapshot, { ...stop, state: 'reconciled' })
    await f.elapse()
    expect(sent).not.toHaveBeenCalled()
  })
})
