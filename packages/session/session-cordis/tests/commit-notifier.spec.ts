// The notifier of commit notices on real Cordis (SPEC「提交通知」, #1230): the function that the
// session storage row registers on its storage. Each batch it is told it dispatches once as
// `session-cordis-contract/committed`, with the five values of the batch and nothing else; it hands
// the same batch to `sessionNotifier` when there is one. It does not wait for listeners, and no
// failure of a listener or of `sessionNotifier` leaves it: they are recorded as diagnostics.
import { Context } from '@deepseek-ai/cordis'
import type { SessionNotifier } from '@omne-harness/session-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import { SessionNotifierService } from '@omne-harness/session-cordis-contract/cordis'
import { describe, expect, it } from 'vitest'
import { createSessionCommitNotifier } from '../src/cordis.ts'
import { serviceOf } from './fixtures/assembly.ts'
import { TENANT_A } from './fixtures/tenants.ts'

type Notice = Parameters<SessionNotifier['committed']>[0]

const COMMITTED = 'session-cordis-contract/committed'

const notice: Notice = {
  tenant: TENANT_A,
  session: 'session-1' as Notice['session'],
  revision: '7' as Notice['revision'],
  source: evidence('batch/7'),
  kinds: ['message.assistant', 'history.annotated'],
}

function root() {
  const ctx = new Context()
  const events: unknown[][] = []
  ctx.on(COMMITTED, (...payload: unknown[]) => {
    events.push(payload)
  })
  const diagnostics = () =>
    ctx.logger.buffer.filter(m => m.name === 'session-notifier').map(m => String(m.args[0]))
  return { ctx, events, diagnostics }
}

describe('the commit notifier', () => {
  it('dispatches each batch once, with its five values in order', async () => {
    const { ctx, events } = root()
    await createSessionCommitNotifier(ctx).committed(notice)
    await expect.poll(() => events.length).toBe(1)
    expect(events[0]).toEqual([
      notice.tenant,
      notice.session,
      notice.revision,
      notice.source,
      notice.kinds,
    ])
  })

  it('a listener that throws is recorded and changes nothing for the caller', async () => {
    const { ctx, diagnostics } = root()
    ctx.on(COMMITTED, () => {
      throw new Error('listener exploded')
    })
    await expect(createSessionCommitNotifier(ctx).committed(notice)).resolves.toBeUndefined()
    await expect
      .poll(() => diagnostics().some(text => text.includes('listener exploded')))
      .toBe(true)
  })

  it('does not wait for a listener that never ends', async () => {
    const { ctx } = root()
    ctx.on(COMMITTED, () => new Promise<void>(() => undefined))
    await expect(createSessionCommitNotifier(ctx).committed(notice)).resolves.toBeUndefined()
  })

  it('hands the same batch to sessionNotifier when there is one', async () => {
    const { ctx, events } = root()
    const handed: Notice[] = []
    await ctx.plugin(
      serviceOf(
        SessionNotifierService,
        {
          committed: (value: Notice) => {
            handed.push(value)
            return Promise.resolve()
          },
        },
        'Relay',
      ) as never,
      {} as never,
    )
    await createSessionCommitNotifier(ctx).committed(notice)
    expect(handed).toEqual([notice])
    await expect.poll(() => events.length).toBe(1)
  })

  it('a sessionNotifier that fails is recorded, and the dispatch is not lost', async () => {
    const { ctx, events, diagnostics } = root()
    await ctx.plugin(
      serviceOf(
        SessionNotifierService,
        { committed: () => Promise.reject(new Error('relay is down')) },
        'Relay',
      ) as never,
      {} as never,
    )
    await expect(createSessionCommitNotifier(ctx).committed(notice)).resolves.toBeUndefined()
    await expect.poll(() => events.length).toBe(1)
    expect(diagnostics().some(text => text.includes('relay is down'))).toBe(true)
  })

  it('goes on without sessionNotifier, and records nothing for its absence', async () => {
    const { ctx, events, diagnostics } = root()
    await expect(createSessionCommitNotifier(ctx).committed(notice)).resolves.toBeUndefined()
    await expect.poll(() => events.length).toBe(1)
    expect(diagnostics()).toEqual([])
  })
})
