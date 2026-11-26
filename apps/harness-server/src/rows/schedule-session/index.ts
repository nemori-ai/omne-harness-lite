import { scheduleExecutorsKey } from '@omne-harness/schedule-cordis-contract/cordis'
import { createNewSessionExecutor } from '@omne-harness/schedule-session'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { SCHEDULE_PRINCIPAL_KEY } from '../../entry/schedule-principal.ts'
import { defineRow } from '../../row.ts'
import { definitionMappingsKey } from '../agent-adoptions/definition-mappings.ts'
import { SCHEDULE_COMPONENT } from '../authorization/grants.ts'
import { installRowGrant } from '../authorization/row-grants.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { executorCallsOf } from './calls.ts'

/** Schedule's side that knows Session and Goal: the executor of agent work in a new session, registered for as long as this row lives. */
export const scheduleSessionRow = defineRow({
  row: 'schedule-session',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [sessionKey, definitionMappingsKey, scheduleExecutorsKey, SCHEDULE_PRINCIPAL_KEY],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  async body(ctx) {
    installRowGrant(ctx, SCHEDULE_COMPONENT)
    const calls = executorCallsOf(ctx, {
      system: ctx.get(SCHEDULE_PRINCIPAL_KEY) as unknown,
      workPrincipals: () => toolRuntimeHolder(ctx).workPrincipals(),
    })
    const withdraw = ctx
      .get(scheduleExecutorsKey)
      ?.register('agent.new', createNewSessionExecutor(calls))
    return {
      async stop() {
        withdraw?.()
        return { kind: 'settled' }
      },
    }
  },
})
