import { SESSION_PUBLICATION } from '@omne-harness/schedule-contract'
import {
  scheduleCarriersKey,
  scheduleExecutorsKey,
} from '@omne-harness/schedule-cordis-contract/cordis'
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
import { scheduleSessionSide } from '../schedule/session-side.ts'
import { sessionModesInstallationKey } from '../session-ad03/modes.ts'
import { executorCallsOf } from './calls.ts'
import { definitionDefaultsOf, sessionDefaultsOf } from './defaults.ts'

/** Schedule's side that knows Session and Goal: the two executors of agent work, in a new session and in one that exists, and the session as the carrier of what such work delivers (read through the Job), registered for as long as this row lives. */
export const scheduleSessionRow = defineRow({
  row: 'schedule-session',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [
      sessionKey,
      definitionMappingsKey,
      scheduleExecutorsKey,
      scheduleCarriersKey,
      sessionModesInstallationKey,
      SCHEDULE_PRINCIPAL_KEY,
    ],
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
      ctx.get(scheduleCarriersKey)?.register({ kind: 'publication', ref: SESSION_PUBLICATION }),
    ]
    const side = scheduleSessionSide(ctx)
    const ofSession: typeof side.ofSession = (tenant, session) =>
      sessionDefaultsOf(ctx, tenant, session)
    const ofDefinition: typeof side.ofDefinition = (tenant, definition) =>
      definitionDefaultsOf(ctx, tenant, definition)
    Object.assign(side, { ofSession, ofDefinition })
    return {
      async stop() {
        if (side.ofSession === ofSession) side.ofSession = null
        if (side.ofDefinition === ofDefinition) side.ofDefinition = null
        for (const withdraw of withdrawn) withdraw?.()
        return { kind: 'settled' }
      },
    }
  },
})
