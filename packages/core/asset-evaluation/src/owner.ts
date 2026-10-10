import {
  createParameterJudge,
  createToolBodyContract,
  type ParameterJudge,
} from '@omne-harness-lite/tool-definition'
import { createAssetModelJudge, type AssetModelJudge } from '@omne-harness-lite/asset-model'
import { captureBodyContracts } from './defaults.ts'
import {
  evaluate,
  selectEvaluationRootSource,
  evaluateWithContext,
  selectEvaluationRootSourceWithContext,
} from './evaluate.ts'
import { judgeEffectiveAssembly, judgeEffectiveAssemblyWithJudge } from './result.ts'
import { readWorkspaceCarrier } from './reader.ts'
import { readCarrier } from './workspace.ts'

export interface AssetEvaluator {
  readonly parameters: ParameterJudge
  readonly assetJudge: AssetModelJudge
  readonly evaluate: typeof evaluate
  readonly selectEvaluationRootSource: typeof selectEvaluationRootSource
  readonly judgeEffectiveAssembly: typeof judgeEffectiveAssembly
  readonly readWorkspaceCarrier: typeof readWorkspaceCarrier
}

/** Own compilation for one assembly lifetime; every operation still validates its current input. */
export function createAssetEvaluator(): AssetEvaluator {
  const parameters = createParameterJudge()
  const bodies = captureBodyContracts(createToolBodyContract(parameters))
  const assetJudge = createAssetModelJudge(bodies, { reuseDomainValidators: true })
  const context = { parameters, bodies, assetJudge }
  return Object.freeze({
    parameters,
    assetJudge,
    evaluate: (input, options) => evaluateWithContext(context, input, options),
    selectEvaluationRootSource: input => selectEvaluationRootSourceWithContext(context, input),
    judgeEffectiveAssembly: value => judgeEffectiveAssemblyWithJudge(assetJudge, value),
    readWorkspaceCarrier: (manifest, workspace) => readCarrier(manifest, workspace, assetJudge),
  } satisfies AssetEvaluator)
}
