import type { Context } from '@deepseek-ai/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ScopeBinding, ScopeRef } from '@omne-harness/runtime-context-contract'
import type { Access, EnvironmentAction } from '@omne-harness/execution-environment-contract'
import {
  ExecutionEnvironmentAuthorityService,
  ExecutionScopeBindingService,
} from '@omne-harness/execution-environment-cordis-contract/cordis'

export type PortState = {
  revision: number
  readonly bindings: Map<string, ScopeBinding>
  defaultTenant: TenantId
  readonly actions: EnvironmentAction[]
}

export function testPorts(tenant: TenantId) {
  const state: PortState = { revision: 0, bindings: new Map(), defaultTenant: tenant, actions: [] }
  class Authority extends ExecutionEnvironmentAuthorityService {
    constructor(ctx: Context) {
      super(ctx)
    }
    async authorize(access: Access<unknown>, action: EnvironmentAction) {
      state.actions.push(action)
      const issued = state.revision
      return {
        kind: 'authorized',
        principal: access.principal,
        current: () => issued === state.revision,
      } as const
    }
  }
  class Bindings extends ExecutionScopeBindingService {
    constructor(ctx: Context) {
      super(ctx)
    }
    async lookup(scope: ScopeRef): Promise<ScopeBinding> {
      return state.bindings.get(scope.ref) ?? { kind: 'bound', tenant: state.defaultTenant }
    }
  }
  return {
    Authority,
    Bindings,
    state,
    bind(scope: ScopeRef, owner: TenantId) {
      state.bindings.set(scope.ref, { kind: 'bound', tenant: owner })
    },
    revokeAll() {
      state.revision++
    },
    async load(ctx: Context) {
      await ctx.plugin(Authority)
      await ctx.plugin(Bindings)
    },
  }
}
