// The `agent-model-selection` row (application assembly, AG-11): the application member's adapter
// that implements the Agent's `ModelSelection`. It injects `modelProfiles` and provides
// `agentModelSelection`. The Session read face is not an `inject`: it is taken from the tree on
// every call, as a `maintainer`, so a missing or replaced Session shows as `unavailable` of that
// call and the row stays ACTIVE.
//
// The session of a call is located from its execution (`advance.execution`) by
// `runOfExecution`: the execution index of the tenant, read through the trusted `storage` and
// `tenantDomainLookup`, then the Session snapshot read with the caller's own principal as a
// `maintainer`. The two trusted services are also taken on every call, not injected: while the
// trusted table does not show them to this row, each call is `unavailable` with that diagnostic and
// the row stays ACTIVE.
import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { ModelSelection } from '@omne-harness/agent-contract'
import {
  ModelSelectionService,
  agentModelSelectionKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { modelProfilesKey } from '@omne-harness/model-cordis-contract/cordis'
import { succeed } from '@omne-harness/operation-result'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { defineRow } from '../../row.ts'
import { runOfExecution } from '../session-adapters/run-of-execution.ts'
import { selectModel, type SelectionBindings, type SelectionPorts } from './select.ts'

export type { SelectionBindings } from './select.ts'

// The service keeps a closure only: no `#` private field, because a method reached through a caller
// proxy has a `this` that is not the instance (docs/real-mode.md).
class ModelSelectionImpl extends ModelSelectionService<unknown> {
  readonly select: ModelSelection<unknown>['select']
  constructor(ctx: Context, ports: SelectionPorts) {
    super(ctx)
    this.select = input => selectModel(ports, input)
  }
}

/** The owner that the location failures of this row name. */
export const SELECTION_OWNER = 'agent-model-selection'

/**
 * The default modality requirement. The text-only requirement is the safe floor: Model checks the
 * real modalities again when it accepts a request.
 */
export const defaultRequirementOf: SelectionBindings['requirementOf'] = input => ({
  modalities: ['text'],
  source: input.history,
})

/**
 * The default session binding of a row context: the session whose active Run holds the execution
 * of the call. Every service is read on each call; see the head comment.
 */
export function sessionOfExecution(ctx: Context): SelectionBindings['sessionOf'] {
  const sessionWork = () =>
    ctx.intercept(sessionKey, { caller: 'maintainer' }).get(sessionKey, false)?.work
  return async input => {
    const located = await runOfExecution(
      {
        storage: ctx.get(storageKey, false) ?? undefined,
        tenantDomainLookup: ctx.get(tenantDomainLookupKey, false) ?? undefined,
        readWork: session =>
          sessionWork()?.readWork({ principal: input.principal, tenant: input.tenant, session }),
      },
      {
        tenant: input.tenant,
        execution: input.advance.execution,
        action: 'select',
        owner: SELECTION_OWNER,
      },
    )
    return 'failure' in located ? located : succeed(located.ok.session)
  }
}

/** The row over given bindings. A binding that is not given is the default one. */
export function createAgentModelSelectionRow(bindings: Partial<SelectionBindings> = {}) {
  const plugin: Plugin.Object = {
    name: 'agent-model-selection',
    inject: [modelProfilesKey],
    apply(ctx: Context) {
      // Both services are read again on every call. The Session face comes from an intercept
      // context that carries the caller class, and its absence is a value, not a throw.
      const ports: SelectionPorts = {
        readSelection: access =>
          ctx
            .intercept(sessionKey, { caller: 'maintainer' })
            .get(sessionKey, false)
            ?.work.readModelSelection(access),
        resolveProfile: input => ctx.get(modelProfilesKey, false)?.resolve(input),
        bindings: {
          sessionOf: bindings.sessionOf ?? sessionOfExecution(ctx),
          requirementOf: bindings.requirementOf ?? defaultRequirementOf,
        },
      }
      new ModelSelectionImpl(ctx, ports)
    },
  }
  return defineRow({
    row: 'agent-model-selection',
    implementation: 'real',
    manifest: {
      provides: [agentModelSelectionKey],
      injects: [modelProfilesKey],
      sameProviderGroup: null,
    },
    lifecycle: { kind: 'none' },
    plugin,
  })
}

export const agentModelSelectionRow = createAgentModelSelectionRow()
