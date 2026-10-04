import schema from '@omne-harness-lite/model-response/schema' with { type: 'json' }
import accountsSchema from '@omne-harness-lite/call-accounts/schema' with { type: 'json' }
import retainedContentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import identitySchema from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import loopSchema from '@omne-harness-lite/loop-extension/schema' with { type: 'json' }
import messagesSchema from '@omne-harness-lite/messages/schema' with { type: 'json' }
import profileSchema from '@omne-harness-lite/model-profile/schema' with { type: 'json' }
import expirySchema from '@omne-harness-lite/offer-expiry/schema/v1' with { type: 'json' }
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
  'ResponseFactsConstraints',
  'PendingModelResponse',
  'CountingBasis',
  'RequestInputEvidence',
  'ObservationProvenance',
  'ObservedInput',
  'OutputGroupEvidence',
  'InputCalibration',
] as const)
// S-27 partitions member shape from owned cross-member predicates. These two clauses
// are delayed only in this private view; public validate uses the complete frozen resource.
const { allOf: responseConditions, ...responseMembers } = schema.$defs.ModelResponse
const { allOf: pendingConditions, ...pendingResponseMembers } = schema.$defs.PendingModelResponse
const { dependentRequired: failureCondition, ...failureMembers } = schema.$defs.Failure
const memberId = `${schemaId}?stage=members`
const memberSchema = {
  ...schema,
  $id: memberId,
  $defs: {
    ...schema.$defs,
    ModelResponse: responseMembers,
    PendingModelResponse: pendingResponseMembers,
    Failure: failureMembers,
  },
}
// Exact resource closure of the 25 public definitions and the two private member validators.
// The frozen normative graph is separate from the existing members-stage view.
export const normativeSchemaResources = Object.freeze([
  identitySchema,
  expirySchema,
  contentSchema,
  retainedContentSchema,
  accountsSchema,
  profileSchema,
  messagesSchema,
  loopSchema,
  schema,
])

export const schemaGraphs = [
  {
    name: 'exact',
    kind: 'exact',
    resources: [...normativeSchemaResources, memberSchema],
    resourceSpecifiers: [
      '@omne-harness-lite/model-response/schema',
      '@omne-harness-lite/call-accounts/schema',
      '@omne-harness-lite/content-blocks/schema/v2',
      '@omne-harness-lite/content-blocks/schema',
      '@omne-harness-lite/identity-values/schema',
      '@omne-harness-lite/loop-extension/schema',
      '@omne-harness-lite/messages/schema',
      '@omne-harness-lite/model-profile/schema',
      '@omne-harness-lite/offer-expiry/schema/v1',
    ],
    sourceFiles: ['src/schema-inputs.ts'],
    definitions: [
      ...SCHEMA_DEF_NAMES.map(name => ({
        name,
        method: 'compile',
        schema: { $ref: `${schemaId}#/$defs/${name}` },
      })),
      {
        name: 'ResponseMembers',
        method: 'compile',
        schema: { $ref: `${memberId}#/$defs/ModelResponse` },
      },
      {
        name: 'PendingResponseMembers',
        method: 'compile',
        schema: { $ref: `${memberId}#/$defs/PendingModelResponse` },
      },
    ],
  },
] as const
