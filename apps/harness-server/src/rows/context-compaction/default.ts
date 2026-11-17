import { createDefaultCompactionExecutor } from '@omne-harness/context-compaction'
import type { PrincipalIssuer } from '@omne-harness/identity'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { ModelPreparationResources, ModelRuntime } from '@omne-harness/model-contract'
import type { ModelRequestPreparation } from '@omne-harness/model-contract/provider'
import {
  modelPreparationResourcesKey,
  modelRequestPreparationKey,
  modelRuntimeKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  CompactionModelEvidence,
  compactionModelEvidenceKey,
} from '../../model/compaction-evidence.ts'
import { COMPACTION_COMPONENT, COMPACTION_WORK_OWNER } from '../../model/principals.ts'
import { createContextCompactionRow } from './index.ts'
import { DEFAULT_COMPACTION_BINDING } from '../../assembly/compaction-provider.ts'

export const contextCompactionRow = createContextCompactionRow({
  binding: DEFAULT_COMPACTION_BINDING,
  inject: [
    principalIssuerKey,
    modelRuntimeKey,
    modelPreparationResourcesKey,
    modelRequestPreparationKey,
  ],
  provides: [compactionModelEvidenceKey],
  executor(ctx, store) {
    const issuer = ctx.get(principalIssuerKey) as PrincipalIssuer
    const actor = issuer.issueSystem({ component: COMPACTION_COMPONENT })
    if ('failure' in actor) throw new Error('context-compaction: cannot issue provider principal')
    const executor = createDefaultCompactionExecutor({
      store,
      model: ctx.get(modelRuntimeKey) as ModelRuntime<unknown>,
      resources: ctx.get(modelPreparationResourcesKey) as ModelPreparationResources<unknown>,
      requests: ctx.get(modelRequestPreparationKey) as ModelRequestPreparation<unknown>,
      async access(request) {
        const issued = issuer.issueActingForTenant({
          actor: actor.ok,
          tenant: request.ref.tenant,
          work: { owner: COMPACTION_WORK_OWNER, work: request.ref.task },
        })
        return 'failure' in issued
          ? fail({
              kind: 'unavailable',
              dependency: 'principal-issuer',
              diagnostic: issued.failure.reason,
            })
          : succeed({ principal: issued.ok, tenant: request.ref.tenant })
      },
    })
    new CompactionModelEvidence(ctx, executor)
    return executor
  },
})
