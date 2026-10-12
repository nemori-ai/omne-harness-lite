import type { AssetModelJudge, NonConnectorBodyContracts } from '@omne-harness-lite/asset-model'
import type { ParameterJudge } from '@omne-harness-lite/tool-definition'
import { defaultBodyContracts, getAssetJudge } from './defaults.ts'

export interface EvaluationContext {
  readonly assetJudge: AssetModelJudge
  readonly bodies: NonConnectorBodyContracts
  readonly parameters?: ParameterJudge
}

export function defaultEvaluationContext(): EvaluationContext {
  return {
    get assetJudge() {
      return getAssetJudge()
    },
    bodies: defaultBodyContracts,
  }
}
