import { definePart } from '@omne-harness/shell-contract'

export const modelProviderModels = definePart({
  name: 'model.provider.models',
  label: '模型',
  summary: '这家供应商适配的模型：开哪些，平时用哪一档推理强度',
  within: 'assets.asset',
  depths: ['tokens', 'style'],
  when: '点进一份模型供应商之后',
})

export const modelProviderModelsRow = definePart({
  name: 'model.provider.models.row',
  label: '一个模型',
  summary: '一个型号的事实、开关与缺省推理强度',
  within: 'model.provider.models',
  depths: ['tokens', 'style'],
  when: '点进一份模型供应商之后',
})

export const modelParts = [modelProviderModels, modelProviderModelsRow] as const
