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

class ModelSelectionImpl extends ModelSelectionService<unknown> {
  readonly select: ModelSelection<unknown>['select']
  constructor(ctx: Context, ports: SelectionPorts) {
    super(ctx)
    this.select = input => selectModel(ports, input)
  }
}

export const SELECTION_OWNER = 'agent-model-selection'

export const defaultRequirementOf: SelectionBindings['requirementOf'] = input => ({
  modalities: ['text'],
  source: input.history,
})

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

export function createAgentModelSelectionRow(bindings: Partial<SelectionBindings> = {}) {
  const plugin: Plugin.Object = {
    name: 'agent-model-selection',
    inject: [modelProfilesKey],
    apply(ctx: Context) {
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
