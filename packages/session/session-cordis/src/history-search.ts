import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  SessionSearchService,
  sessionAccessCheckKey,
  sessionHistoryIndexKey,
  sessionHistoryLogKey,
  sessionSearchCursorsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import {
  createHistoryFollower,
  createHistorySearch,
  type FollowLimits,
  type HistorySearch,
  type SearchPolicy,
} from '@omne-harness/session-search'
import { diagnoser } from './diagnostics.ts'

export type SessionSearchConfig = Readonly<{
  policy: SearchPolicy
  /** `restRatio`: after a read of the log, how many times as long the follower stays off it. */
  follow: Pick<FollowLimits, 'pageBytes' | 'maxSteps'> &
    Readonly<{ intervalMs: number; compactPages: number; restRatio: number }>
}>

class SessionSearchImpl extends SessionSearchService<unknown> {
  readonly search: HistorySearch<unknown>['search']
  constructor(ctx: Context, search: HistorySearch<unknown>) {
    super(ctx)
    this.search = input => search.search(input)
  }
}

// The history search and the follower that keeps the index behind the logs. A commit only wakes
// the follower: nothing on the way of an intake or a Run reads the index, writes it or waits.
export function createSessionSearchPlugin(config: SessionSearchConfig): Plugin.Object {
  return {
    name: 'session-search',
    inject: [
      sessionAccessCheckKey,
      sessionHistoryIndexKey,
      sessionHistoryLogKey,
      sessionSearchCursorsKey,
    ],
    apply(ctx: Context) {
      const { index } = ctx[sessionHistoryIndexKey]
      const { log } = ctx[sessionHistoryLogKey]
      const { intervalMs, compactPages, restRatio: ratio, ...pages } = config.follow
      const sleep = (ms: number) => new Promise<void>(resume => setTimeout(resume, ms))
      const now = () =>
        /* wall-clock: operation-timing -- How long one read of the log took; compared with itself only. */ performance.now()
      const rest = { ratio, now, sleep }
      const follower = createHistoryFollower({
        index,
        log,
        limits: ratio > 0 ? { ...pages, rest } : pages,
        intervalMs,
        compactPages,
        report: diagnoser(ctx, 'session-search'),
      })
      ctx.on('session-cordis-contract/committed', (tenant: TenantId) => follower.poke(tenant))
      ctx.effect(() => () => follower.stop())
      const search = createHistorySearch<unknown>({
        access: ctx[sessionAccessCheckKey],
        index,
        log,
        seal: ctx[sessionSearchCursorsKey].seal,
        policy: config.policy,
        now: Date.now,
        searched: tenant => follower.poke(tenant),
      })
      new SessionSearchImpl(ctx, search)
    },
  }
}
