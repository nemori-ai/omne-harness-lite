import { fail } from '@omne-harness/operation-result'
import { runtimeContextKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import {
  createSessionContextInputPlugin,
  type SessionContextInputPluginInput,
} from '@omne-harness/session-adapters/cordis'
import { sessionContextInputKey } from '@omne-harness/session-cordis-contract/cordis'
import { adoptedContextDefinitions } from '../../assembly/context-definitions.ts'
import { defineRow } from '../../row.ts'

const COORDINATOR_SOURCE = 'sessionWorkPrincipals'

const noCoordinatorSource: SessionContextInputPluginInput<unknown>['coordinator'] = () =>
  Promise.resolve(
    fail({
      kind: 'unavailable' as const,
      owner: COORDINATOR_SOURCE,
      diagnostic:
        'the assembly hands the Context input no coordinator principal source; a registration change cannot be prepared',
    }),
  )

export const sessionAd12Row = defineRow({
  row: 'session-ad12',
  implementation: 'real',
  manifest: {
    provides: [sessionContextInputKey],
    injects: [runtimeContextKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: createSessionContextInputPlugin<unknown>({
    coordinator: noCoordinatorSource,
    definitions: adoptedContextDefinitions,
  }),
})
