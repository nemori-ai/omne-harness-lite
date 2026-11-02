// Shared fixtures of the `session-ad12` row tests and of the `session-provider` create test: the
// `runtimeContext` contract double, which is the memory double of runtime-context-contract behind
// the service definition of runtime-context-cordis-contract, over the test authority ports. It
// does not import vitest.
import type { Context } from '@deepseek-ai/cordis'
import {
  createMemoryRuntimeContext,
  createTestAuthorityPorts,
} from '@omne-harness/runtime-context-contract/testing'
import {
  RuntimeContextService,
  runtimeContextKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import type { RowSpec } from '../../../src/loader.ts'
import { defineRow } from '../../../src/row.ts'
import { declared } from '../session-fixtures/tree.ts'

/** A contract-double row `runtime-context` that provides `runtimeContext` over the memory double. */
export function runtimeContextDoubleRow(): RowSpec {
  const ports = createTestAuthorityPorts<unknown>()
  class RuntimeContextDouble extends RuntimeContextService<unknown> {
    readonly memory = createMemoryRuntimeContext<unknown>({
      authority: ports.authority,
      bindings: ports.bindings,
    })
    constructor(ctx: Context) {
      super(ctx)
      ctx.effect(() => () => void this.memory.close())
    }
    readonly registerProducer: RuntimeContextService<unknown>['registerProducer'] = (...args) =>
      this.memory.registerProducer(...args)
    readonly prepareRegistration: RuntimeContextService<unknown>['prepareRegistration'] = (
      ...args
    ) => this.memory.prepareRegistration(...args)
    readonly issueEligibility: RuntimeContextService<unknown>['issueEligibility'] = (...args) =>
      this.memory.issueEligibility(...args)
    readonly revokeEligibility: RuntimeContextService<unknown>['revokeEligibility'] = (...args) =>
      this.memory.revokeEligibility(...args)
    readonly applyCommit: RuntimeContextService<unknown>['applyCommit'] = (...args) =>
      this.memory.applyCommit(...args)
    readonly beginReplay: RuntimeContextService<unknown>['beginReplay'] = (...args) =>
      this.memory.beginReplay(...args)
    readonly finishReplay: RuntimeContextService<unknown>['finishReplay'] = (...args) =>
      this.memory.finishReplay(...args)
    readonly bind: RuntimeContextService<unknown>['bind'] = id => this.memory.bind(id)
  }
  return declared(
    defineRow({
      row: 'runtime-context',
      implementation: 'contract-double',
      manifest: { provides: [runtimeContextKey], injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: {
        name: 'runtime-context-double',
        apply(ctx: Context) {
          new RuntimeContextDouble(ctx)
        },
      },
    }),
  )
}
