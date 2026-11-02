// The `agent-model-selection` row (application assembly, AG-11): the application member's adapter
// that implements the Agent's `ModelSelection`. It injects `modelProfiles` and provides
// `agentModelSelection`. The Session read face is not an `inject`: it is taken from the tree on
// every call, as a `maintainer`, so a missing or replaced Session shows as `unavailable` of that
// call and the row stays ACTIVE. Wave 1 does not enable this row in the `serve` tree (DP1-C18): its
// provider `model-profiles` is still an S0 double there.
import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { ModelSelection } from '@omne-harness/agent-contract'
import {
  ModelSelectionService,
  agentModelSelectionKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { modelProfilesKey } from '@omne-harness/model-cordis-contract/cordis'
import { fail } from '@omne-harness/operation-result'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { defineRow } from '../../row.ts'
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

/**
 * The default bindings. They fail closed: `select` carries no session, and no contract port maps an
 * execution to one yet, so the row cannot tell which saved selection applies. The text-only
 * requirement is the safe floor: Model checks the real modalities again when it accepts a request.
 */
export const defaultBindings: SelectionBindings = {
  sessionOf: () =>
    fail({
      kind: 'unavailable',
      owner: 'agent-model-selection',
      diagnostic: 'no binding from the execution to a session is installed',
    }),
  requirementOf: input => ({ modalities: ['text'], source: input.history }),
}

/** The row over given bindings. A test or an integration passes the session binding it owns. */
export function createAgentModelSelectionRow(bindings: Partial<SelectionBindings> = {}) {
  const complete: SelectionBindings = { ...defaultBindings, ...bindings }
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
        bindings: complete,
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
