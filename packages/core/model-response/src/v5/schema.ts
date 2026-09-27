import schema from '../../schema/v5/model-response.schema.json' with { type: 'json' }
import accountsSchema from '@omne-harness-lite/call-accounts/schema' with { type: 'json' }
import retainedContentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import identitySchema from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import loopSchema from '@omne-harness-lite/loop-extension/schema/v3' with { type: 'json' }
import retainedMessagesSchema from '@omne-harness-lite/messages/schema/v3' with { type: 'json' }
import retainedProfileSchema from '@omne-harness-lite/model-profile/schema/v2' with { type: 'json' }
import messagesSchema from '@omne-harness-lite/messages/schema' with { type: 'json' }
import profileSchema from '@omne-harness-lite/model-profile/schema' with { type: 'json' }
import expirySchema from '@omne-harness-lite/offer-expiry/schema/v1' with { type: 'json' }
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import { snapshot } from '../json.ts'

export const schemaId = schema.$id
export const SCHEMA_DEF_NAMES = Object.freeze([
  'ResponseId',
  'RunId',
  'AttemptId',
  'ModelCallId',
  'ReplyDisposition',
  'ModelCallRef',
  'SelectedBy',
  'CredentialScope',
  'Route',
  'ParameterAdjustment',
  'ResponseOutcome',
  'UpstreamError',
  'Failure',
  'Timing',
  'RawHeaders',
  'RawResponse',
  'ModelResponse',
] as const)
export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]
export interface SchemaValidation {
  readonly valid: boolean
}

// S-27 partitions member shape from owned cross-member predicates. These two clauses
// are delayed only in this private view; public validate uses the complete frozen resource.
const { allOf: responseConditions, ...responseMembers } = schema.$defs.ModelResponse
const { dependentRequired: failureCondition, ...failureMembers } = schema.$defs.Failure
const memberId = `${schemaId}?stage=members`
const memberSchema = {
  ...schema,
  $id: memberId,
  $defs: { ...schema.$defs, ModelResponse: responseMembers, Failure: failureMembers },
}
// Only the fixed resource graph and seventeen compiled definitions are retained.
const runtime = createSchemaRuntime([
  identitySchema,
  expirySchema,
  contentSchema,
  retainedContentSchema,
  accountsSchema,
  profileSchema,
  retainedProfileSchema,
  retainedMessagesSchema,
  messagesSchema,
  loopSchema,
  schema,
  memberSchema,
])
const validators = SCHEMA_DEF_NAMES.map(name =>
  Object.freeze({ name, validator: runtime.compile({ $ref: `${schemaId}#/$defs/${name}` }) }),
)
const memberValidator = runtime.compile({ $ref: `${memberId}#/$defs/ModelResponse` })

/** Full frozen shape, including all conditional constraints. Not an ordered rejection API. */
export function validate(defName: SchemaDefName, value: unknown): SchemaValidation {
  const entry = validators.find(item => item.name === defName)
  if (entry === undefined)
    throw new TypeError(`unknown model-response Schema definition: ${defName}`)
  const copied = snapshot(value)
  return Object.freeze({ valid: copied !== undefined && entry.validator.validate(copied) })
}
export function membersValid(value: JsonValue): boolean {
  return memberValidator.validate(value)
}
export function responseValid(value: JsonValue): boolean {
  const entry = validators.find(item => item.name === 'ModelResponse')
  if (entry === undefined) throw new Error('fixed ModelResponse validator missing')
  return entry.validator.validate(value)
}
