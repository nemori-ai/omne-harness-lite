// The `session-ad12` row: the Context input of Session (AD-12). The plugin is
// `createSessionContextInputPlugin` of `@omne-harness/session-adapters/cordis` over the assembly's
// adopted definitions (`assembly/context-definitions.ts`). It injects `runtimeContext` and provides
// `sessionContextInput`. It has no configuration and no shutdown phase. With Runtime Context absent
// the row stays `PENDING`.
//
// The plugin also takes the coordinator principal source of one session (the port AD-03 and AD-14
// take too; the assembly page answers it with `SessionWorkPrincipals.forSession({ actor:
// 'coordinator' })`). This assembly has no source the row may read: `sessionWorkPrincipals` is a
// trusted name that only the `session-provider` row sees, and the page gives `session-ad12` no other
// inject. The row therefore answers the port `unavailable` and names it. Only a registration
// `change` asks the port; `create`, `startRun`, `reload` and a step commit do not. The row does not
// sign a principal of its own and does not put the Session-internal coordinator in its place.
import { fail } from '@omne-harness/operation-result'
import { runtimeContextKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import {
  createSessionContextInputPlugin,
  type SessionContextInputPluginInput,
} from '@omne-harness/session-adapters/cordis'
import { sessionContextInputKey } from '@omne-harness/session-cordis-contract/cordis'
import { adoptedContextDefinitions } from '../../assembly/context-definitions.ts'
import { defineRow } from '../../row.ts'

/** The trusted name that would answer the port, and that this row cannot see. */
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
