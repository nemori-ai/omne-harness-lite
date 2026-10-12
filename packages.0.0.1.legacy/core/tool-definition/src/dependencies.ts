import type { ToolDefinition, ToolDependency, TargetEnvironment } from './types.ts'
import { validate } from './schema.ts'

/** S19: presence follows the definition; the caller owns actual setting evaluation. */
export function toolDependencies(
  definition: ToolDefinition,
  effectiveTargetEnvironment: TargetEnvironment | undefined,
): readonly ToolDependency[] {
  const declared = definition.settings?.targetEnvironment !== undefined
  if (declared !== (effectiveTargetEnvironment !== undefined))
    throw new TypeError('effective target environment must agree with declaration presence')
  if (
    effectiveTargetEnvironment !== undefined &&
    !validate('TargetEnvironment', effectiveTargetEnvironment).valid
  )
    throw new TypeError('valid effective target environment required')
  const result: ToolDependency[] = []
  for (const name of definition.needs?.externalServices ?? [])
    result.push({ kind: 'external_service', name })
  if (definition.needs?.attachmentStorage !== undefined)
    result.push({
      kind: 'attachment_storage',
      name: definition.needs.attachmentStorage,
      readerRequired: true,
    })
  for (const modality of definition.needs?.inputModalities ?? [])
    result.push({ kind: 'input_modality', modality })
  for (const modality of definition.needs?.outputModalities ?? [])
    result.push({ kind: 'output_modality', modality })
  if (effectiveTargetEnvironment !== undefined)
    result.push({
      kind: 'target_environment',
      value: Object.freeze({
        bindingLayer: effectiveTargetEnvironment.bindingLayer,
        facilities: Object.freeze([...effectiveTargetEnvironment.facilities]),
      }),
    })
  return Object.freeze(result.map(value => Object.freeze(value)))
}
