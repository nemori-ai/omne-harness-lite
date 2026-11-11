// session.run-live：在同一 SQL 事务里读 Session 快照的头，核对会话未归档、Run 仍在进行。
// 取消 Run 与归档都在同一笔 Session 提交里写入 Run 的终局（decide-management.ts 的 cancelsRun），
// 所以「Run 是当前进行中的 Run」同时排除了已取消与已终局。只读快照头与 run 成员，不读集合分块。
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { RunLiveGuardSchema, SESSION_RUN_LIVE_FACT, SESSION_RUN_LIVE_GUARD } from '../run-live.ts'
import { readMember } from './state-rows.ts'
import { big, oneRow, text } from './support.ts'

const conflict = (reason: string) => ({ kind: 'conflict', basis: { reason } }) as const

export default {
  participant: SESSION_RUN_LIVE_GUARD,
  protocol: '1',
  execute(facts, port) {
    const parsed = RunLiveGuardSchema.safeParse(facts)
    if (!parsed.success) return { kind: 'unsupported', basis: { reason: 'run-live-input' } }
    const { request } = parsed.data
    const state = oneRow(
      port,
      `SELECT s.snapshot AS snapshot, s.covered AS covered, j.tail AS tail
         FROM sl_journal j LEFT JOIN sl_state s ON s.tenant = j.tenant AND s.session = j.session
        WHERE j.tenant = ? AND j.session = ? LIMIT 1`,
      [request.tenant, request.session],
    )
    if (state === undefined) return conflict('session-absent')
    if (state['snapshot'] === null || big(state['covered']) !== big(state['tail']))
      return { kind: 'failed', diagnostic: 'sl_state does not cover the tail' }
    const head = text(state['snapshot'])
    if ((JSON.parse(head) as { lifecycle?: unknown }).lifecycle === 'archived')
      return conflict('session-archived')
    const run = readMember(port, request.tenant, request.session, head, 'run') as
      | { kind?: unknown; run?: unknown }
      | undefined
    if (run?.kind !== 'active' || run.run !== request.run) return conflict('run-not-live')
    port.provideFact(SESSION_RUN_LIVE_FACT, request)
    return { kind: 'participated', response: request }
  },
} satisfies ParticipantModule
