import { scheduleExecutorsKey } from '@omne-harness/schedule-cordis-contract/cordis'
import {
  createExistingSessionExecutor,
  createNewSessionExecutor,
} from '@omne-harness/schedule-session'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { SCHEDULE_PRINCIPAL_KEY } from '../../entry/schedule-principal.ts'
import { defineRow } from '../../row.ts'
import { definitionMappingsKey } from '../agent-adoptions/definition-mappings.ts'
import { SCHEDULE_COMPONENT } from '../authorization/grants.ts'
import { installRowGrant } from '../authorization/row-grants.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { executorCallsOf } from './calls.ts'

/** Schedule's side that knows Session and Goal: the two executors of agent work, in a new session and in one that exists, registered for as long as this row lives. */
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
    const executors = ctx.get(scheduleExecutorsKey)
    const withdrawn = [
      executors?.register('agent.new', createNewSessionExecutor(calls)),
      executors?.register('agent.existing', createExistingSessionExecutor(calls)),
    ]
    return {
      async stop() {
        for (const withdraw of withdrawn) withdraw?.()
        return { kind: 'settled' }
      },
    }
  },
})
