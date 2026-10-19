import { judgeContentBlock } from '@omne-harness/content-block'
import { judgeMessage } from '@omne-harness/message'
import { judgeJsonValue } from '@omne-harness/json-text'
import {
  decodeCredentialId,
  type Adoption,
  type FixedModelRequest,
  type ModelFailure,
} from '@omne-harness/model-contract'
import { decimal, digest, invalid } from './value.ts'

function array(value: unknown): boolean {
  return Array.isArray(value)
}
function adoption(value: Adoption): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    [value.owner, value.name, value.revision].every(v => typeof v === 'string' && v.length > 0) &&
    typeof value.digest === 'string' &&
    /^[0-9a-f]{64}$/u.test(value.digest)
  )
}
export function validateRequest(request: FixedModelRequest): ModelFailure | null {
  if (
    !request ||
    typeof request !== 'object' ||
    !array(request.suppliers) ||
    request.suppliers.length === 0 ||
    !array(request.parameters) ||
    !array(request.system) ||
    !array(request.messages) ||
    !array(request.tools) ||
    !array(request.parameterAdoptions)
  )
    return invalid('request', 'shape')
  if (
    ![request.profile, request.retryPolicy, request.representation, request.source].every(adoption)
  )
    return invalid('request', 'adoption')
  if (typeof request.fallback !== 'boolean') return invalid('fallback', 'type')
  for (const supplier of request.suppliers) {
    if (
      !supplier ||
      !adoption(supplier.adoption) ||
      typeof supplier.recipient !== 'string' ||
      !supplier.recipient ||
      typeof supplier.model !== 'string' ||
      !supplier.model ||
      !supplier.credential ||
      !['tenant', 'factory'].includes(supplier.credential.kind)
    )
      return invalid('supplier', 'shape')
    if (
      supplier.credential.kind === 'tenant' &&
      'failure' in decodeCredentialId(supplier.credential.id)
    )
      return invalid('supplier.credential.id', 'identity')
  }
  if (new Set(request.suppliers.map(digest)).size !== request.suppliers.length)
    return invalid('suppliers', 'duplicate')
  if (
    request.system.some(block => 'rejected' in judgeContentBlock(block)) ||
    request.messages.some(message => 'rejected' in judgeMessage(message))
  )
    return invalid('request', 'content')
  const names = new Set<string>()
  for (const tool of request.tools) {
    if (
      !tool ||
      !tool.name ||
      typeof tool.description !== 'string' ||
      names.has(tool.name) ||
      'rejected' in judgeJsonValue(tool.argumentsSchema)
    )
      return invalid('tools', 'declaration')
    names.add(tool.name)
  }
  if (
    typeof request.toolChoice === 'string'
      ? !['none', 'auto', 'required'].includes(request.toolChoice)
      : !request.toolChoice || !names.has(request.toolChoice.name)
  )
    return invalid('toolChoice', 'selection')
  const parameters = new Set<string>()
  for (const parameter of request.parameters) {
    if (!parameter || typeof parameter !== 'object') return invalid('parameters', 'shape')
    const id =
      parameter.kind === 'extension' ? `extension:${digest(parameter.definition)}` : parameter.kind
    if (parameters.has(id)) return invalid('parameters', 'duplicate')
    parameters.add(id)
    switch (parameter.kind) {
      case 'temperature':
        if (!Number.isFinite(parameter.value) || parameter.value < 0 || parameter.value > 2)
          return invalid('temperature', 'range')
        break
      case 'top-p':
        if (!Number.isFinite(parameter.value) || parameter.value <= 0 || parameter.value > 1)
          return invalid('top-p', 'range')
        break
      case 'frequency-penalty':
      case 'presence-penalty':
        if (!Number.isFinite(parameter.value) || parameter.value < -2 || parameter.value > 2)
          return invalid(parameter.kind, 'range')
        break
      case 'max-output-tokens':
        if (!decimal(parameter.value, true)) return invalid(parameter.kind, 'integer')
        break
      case 'seed':
        if (!decimal(parameter.value)) return invalid(parameter.kind, 'integer')
        break
      case 'stop':
        if (
          !array(parameter.value) ||
          parameter.value.length === 0 ||
          parameter.value.some(v => typeof v !== 'string' || !v) ||
          new Set(parameter.value).size !== parameter.value.length
        )
          return invalid('stop', 'sequence')
        break
      case 'reasoning-effort':
        if (!['none', 'low', 'medium', 'high', 'max'].includes(parameter.value))
          return invalid(parameter.kind, 'value')
        break
      case 'extension':
        if (!adoption(parameter.definition) || 'rejected' in judgeJsonValue(parameter.value))
          return invalid('extension', 'definition-or-value')
        break
      default: {
        const _unreachable: never = parameter
        return invalid('parameters', 'unknown')
      }
    }
  }
  return null
}
