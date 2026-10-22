import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { tenantEquals } from '@omne-harness/legal-identity'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ContextNeed, NeedBinding } from './need.js'
import type { DescriptorCatalog } from './descriptor.js'
import type { ContextBlockKey } from './shared.js'
import type { Registration, RegistrationChange } from './registration.js'
import type { TenantId } from '@omne-harness/legal-identity'
import { declarationDigest } from './descriptor.js'
import { decodeContextBlockKey } from './decode.js'
import { record, schema, validate, SynchronousSchemaRequired } from './validation.js'
export type NeedRejection = Readonly<{
  path: readonly string[]
  reason:
    | 'type'
    | 'unknown-key'
    | 'name'
    | 'shape'
    | 'consumer'
    | 'purpose'
    | 'necessity'
    | 'schema-not-synchronous'
}>
const classes = ['model', 'tool', 'extension', 'coordinator'] as const
export function judgeNeed(value: unknown): Outcome<ContextNeed, NeedRejection> {
  if (!record(value)) return fail({ path: [], reason: 'type' })
  const unknown = Object.keys(value).find(
    key => !['name', 'shape', 'consumer', 'purpose', 'necessity'].includes(key),
  )
  if (unknown !== undefined) return fail({ path: [unknown], reason: 'unknown-key' })
  if (typeof value.name !== 'string' || !value.name.trim())
    return fail({ path: ['name'], reason: 'name' })
  const shape = judgeNeedShape(value.shape)
  if ('failure' in shape) return shape
  const consumer = classes.find(consumer => consumer === value.consumer)
  if (consumer === undefined) return fail({ path: ['consumer'], reason: 'consumer' })
  if (typeof value.purpose !== 'string' || !value.purpose.trim())
    return fail({ path: ['purpose'], reason: 'purpose' })
  if (value.necessity !== 'required' && value.necessity !== 'optional')
    return fail({ path: ['necessity'], reason: 'necessity' })
  return succeed({
    name: value.name,
    shape: shape.ok,
    consumer,
    purpose: value.purpose,
    necessity: value.necessity,
  })
}
function judgeNeedShape(value: unknown): Outcome<StandardSchemaV1, NeedRejection> {
  if (!schema(value)) return fail({ path: ['shape'], reason: 'shape' })
  try {
    validate(value, undefined)
  } catch (error) {
    if (error instanceof SynchronousSchemaRequired)
      return fail({ path: ['shape'], reason: 'schema-not-synchronous' })
    throw error
  }
  return succeed(value)
}
export type BindingRejection = Readonly<{
  need: string
  key: ContextBlockKey
  reason:
    | 'declaration-missing'
    | 'required-on-optional'
    | 'shape-mismatch'
    | 'integrator-not-allowed'
}>
export function judgeBinding(
  binding: NeedBinding,
  context: Readonly<{ descriptors: DescriptorCatalog; registrationRequired: boolean }>,
): Outcome<NeedBinding, BindingRejection> {
  const descriptor = context.descriptors.get(binding.key)
  const reject = (reason: BindingRejection['reason']) =>
    fail({ need: binding.need.name, key: binding.key, reason })
  if (!descriptor) return reject('declaration-missing')
  if (binding.need.necessity === 'required' && !context.registrationRequired)
    return reject('required-on-optional')
  if (!binding.translate && binding.need.shape !== descriptor.schema)
    return reject('shape-mismatch')
  if (binding.translate && !descriptor.consumers.includes(binding.integrator))
    return reject('integrator-not-allowed')
  return succeed(binding)
}
export type RegistrationRejection = Readonly<{ path: readonly (string | number)[] }> &
  (
    | Readonly<{
        reason:
          | 'key'
          | 'tenant-mismatch'
          | 'declaration-mismatch'
          | 'parameters-not-declared'
          | 'required-removed'
          | 'required-downgraded'
          | 'required-after-creation'
          | 'identity-changed'
          | 'schema-not-synchronous'
      }>
    | Readonly<{ reason: 'parameters-shape'; issues: readonly StandardSchemaV1.Issue[] }>
    | Readonly<{ reason: 'binding'; rejections: readonly BindingRejection[] }>
  )
export type JudgeRegistrationContext = Readonly<{
  descriptors: DescriptorCatalog
  scopeTenant: TenantId | null
  existing: Registration | null
  creating: boolean
}>
export type JudgedRegistration = Readonly<{
  change: RegistrationChange
  coverage: 'full' | 'declaration-independent'
}>
export function judgeRegistration(
  change: RegistrationChange,
  context: JudgeRegistrationContext,
): Outcome<JudgedRegistration, readonly RegistrationRejection[]> {
  const errors: RegistrationRejection[] = []
  checkRegistrationIdentity(change, context, errors)
  const descriptor =
    context.descriptors.get(change.key) ?? (change.kind === 'add' ? change.declaration : undefined)
  if (change.kind === 'add' && change.declaration) {
    const current = context.descriptors.get(change.key)
    if (current && !sameDeclaration(current, change.declaration))
      errors.push({ path: [], reason: 'declaration-mismatch' })
  }
  if (change.kind !== 'remove') {
    if (descriptor) {
      checkParameters(change.parameters, descriptor, errors)
      checkDeclaredBindings(change, context, descriptor, errors)
    } else {
      checkIndependentBindings(change, errors)
    }
  }
  return errors.length
    ? fail(errors)
    : succeed({ change, coverage: descriptor ? 'full' : 'declaration-independent' })
}

function checkRegistrationIdentity(
  change: RegistrationChange,
  context: JudgeRegistrationContext,
  errors: RegistrationRejection[],
) {
  const add = (
    reason:
      | 'key'
      | 'tenant-mismatch'
      | 'declaration-mismatch'
      | 'parameters-not-declared'
      | 'required-removed'
      | 'required-downgraded'
      | 'required-after-creation'
      | 'identity-changed',
  ) => errors.push({ path: [], reason })
  if ('failure' in decodeContextBlockKey(change.key)) add('key')
  if (context.scopeTenant && !tenantEquals(context.scopeTenant, change.tenant))
    add('tenant-mismatch')
  if (!Number.isSafeInteger(change.basedOn) || change.basedOn < 0) add('identity-changed')
  if (change.kind !== 'add' && !context.existing) add('identity-changed')
  if (
    context.existing &&
    (context.existing.scope.ref !== change.scope.ref || context.existing.key !== change.key)
  )
    add('identity-changed')
  if (change.kind === 'add' && context.existing) add('identity-changed')
  checkRegistrationNecessity(change, context, errors)
}
function checkRegistrationNecessity(
  change: RegistrationChange,
  context: JudgeRegistrationContext,
  errors: RegistrationRejection[],
) {
  if (change.kind === 'remove' && context.existing?.required)
    errors.push({ path: [], reason: 'required-removed' })
  if (change.kind === 'add' && change.required && (!context.creating || !change.creating))
    errors.push({ path: [], reason: 'required-after-creation' })
  if (
    change.kind === 'update' &&
    'required' in change &&
    change.required !== context.existing?.required
  )
    errors.push({ path: [], reason: 'required-downgraded' })
}
function checkParameters(
  parameters: unknown,
  descriptor: NonNullable<ReturnType<DescriptorCatalog['get']>>,
  errors: RegistrationRejection[],
) {
  if (parameters !== undefined && !descriptor.parameterSchema)
    errors.push({ path: [], reason: 'parameters-not-declared' })
  if (descriptor.parameterSchema) {
    try {
      const issues = validate(descriptor.parameterSchema, parameters)
      if (issues.length) errors.push({ path: ['parameters'], reason: 'parameters-shape', issues })
    } catch (error) {
      if (error instanceof SynchronousSchemaRequired)
        errors.push({ path: ['parameters'], reason: 'schema-not-synchronous' })
      else throw error
    }
  }
}
function checkDeclaredBindings(
  change: Exclude<RegistrationChange, { kind: 'remove' }>,
  context: JudgeRegistrationContext,
  descriptor: NonNullable<ReturnType<DescriptorCatalog['get']>>,
  errors: RegistrationRejection[],
) {
  const bindingContext = {
    descriptors: {
      get: (key: ContextBlockKey) =>
        key === change.key ? descriptor : context.descriptors.get(key),
    },
  }
  for (const [index, binding] of change.bindings.entries()) {
    const judgedNeed = judgeNeed(binding.need)
    if ('failure' in judgedNeed && judgedNeed.failure.reason === 'schema-not-synchronous')
      errors.push({
        path: ['bindings', index, 'need', ...judgedNeed.failure.path],
        reason: 'schema-not-synchronous',
      })
    else if (binding.key !== change.key || 'failure' in judgedNeed)
      errors.push({ path: ['bindings', index], reason: 'key' })
  }
  const bindings = change.bindings.flatMap(binding => {
    const r = judgeBinding(binding, {
      descriptors: bindingContext.descriptors,
      registrationRequired:
        change.kind === 'add' ? change.required : (context.existing?.required ?? false),
    })
    return 'failure' in r ? [r.failure] : []
  })
  if (bindings.length) errors.push({ path: ['bindings'], reason: 'binding', rejections: bindings })
}
function checkIndependentBindings(
  change: Exclude<RegistrationChange, { kind: 'remove' }>,
  errors: RegistrationRejection[],
) {
  for (const [index, binding] of change.bindings.entries())
    if (
      'failure' in judgeNeed(binding.need) ||
      binding.key !== change.key ||
      (binding.translate && !classes.includes(binding.integrator))
    )
      errors.push({ path: ['bindings', index], reason: 'key' })
}
export function sameDeclaration(
  a: import('./descriptor.js').ContextBlockDescriptor<ContextBlockKey, unknown, unknown>,
  b: import('./descriptor.js').ContextBlockDescriptor<ContextBlockKey, unknown, unknown>,
): boolean {
  return declarationDigest(a) === declarationDigest(b)
}
