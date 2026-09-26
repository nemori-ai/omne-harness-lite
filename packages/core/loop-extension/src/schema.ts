import schema from '@omne-harness-lite/loop-extension/schema' with { type: 'json' }
import retainedContentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import identitySchema from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import expirySchema from '@omne-harness-lite/offer-expiry/schema/v1' with { type: 'json' }
import assetSchema from '@omne-harness-lite/asset-model/schema' with { type: 'json' }
import accountsSchema from '@omne-harness-lite/call-accounts/schema' with { type: 'json' }
import profileSchema from '@omne-harness-lite/model-profile/schema' with { type: 'json' }
import messageSchema from '@omne-harness-lite/messages/schema' with { type: 'json' }
import toolSchema from '@omne-harness-lite/tool-definition/schema' with { type: 'json' }
import {
  createSchemaRuntime,
  type SchemaDocument,
} from '@omne-harness-lite/content-blocks/schema-runtime'
import type { JsonObject, JsonValue } from '@omne-harness-lite/content-blocks'
import { object, snapshot } from './json.ts'

export const schemaId = schema.$id
export const SCHEMA_DEF_NAMES = Object.freeze([
  'LoopPosition',
  'Dimension',
  'Power',
  'ErrorPolicy',
  'UnavailabilityPolicy',
  'LoopExtensionDefinition',
  'ExtensionImplementation',
  'LogHandle',
  'EnvironmentHandle',
  'FailureCause',
  'TerminalFact',
  'CompactionPlan',
  'ModelRequest',
  'ToolDefinitionRef',
  'AttemptStartedSubject',
  'BeforePersistMessageSubject',
  'AfterPersistMessageSubject',
  'BeforeCompactionSubject',
  'AfterCompactionSubject',
  'BeforeModelCallSubject',
  'AfterModelCallCompleteReplySubject',
  'AfterModelCallFailureSubject',
  'BeforeActionSubject',
  'AfterActionEachSubject',
  'AfterActionBatchSubject',
  'BeforeTerminalSubject',
  'AfterTerminalSubject',
  'Subject',
  'ExtensionInput',
  'ObservedOutput',
  'InjectOutput',
  'RewriteOutput',
  'SelectModelOutput',
  'VetoOutput',
  'StopOutput',
  'RetryPlan',
  'RetryOutput',
  'CardOption',
  'DecisionCardDraft',
  'AskOutput',
  'ExtensionOutput',
  'Conclusion',
] as const)
export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]
const resources = [
  identitySchema,
  expirySchema,
  contentSchema,
  retainedContentSchema,
  assetSchema,
  accountsSchema,
  profileSchema,
  messageSchema,
  toolSchema,
  schema,
]
const runtime = createSchemaRuntime(resources)
const validators = SCHEMA_DEF_NAMES.map(name =>
  Object.freeze({ name, validator: runtime.compile({ $ref: `${schemaId}#/$defs/${name}` }) }),
)
export function validate(definition: SchemaDefName, value: unknown): { readonly valid: boolean } {
  const entry = validators.find(item => item.name === definition)
  if (entry === undefined) throw new TypeError(`unknown loop Schema definition: ${definition}`)
  const copied = snapshot(value)
  return Object.freeze({ valid: copied !== undefined && entry.validator.validate(copied) })
}

// Stage 1 owns only ordinary shape errors. This private view defers the named
// S-37 predicates; it never edits the exported frozen resource or the input.
const earlyId = schemaId.replace(
  'loop-extension.schema.json',
  'loop-extension.stage-one.schema.json',
)
function ownedDefinition(name: SchemaDefName): JsonObject {
  const source = snapshot(schema)
  if (!object(source) || !object(source.$defs) || !object(source.$defs[name]))
    throw new Error('owned Schema graph mismatch')
  return source.$defs[name]
}
function absoluteRefs(value: JsonValue, base: string): JsonValue {
  if (Array.isArray(value)) return value.map(item => absoluteRefs(item, base))
  if (!object(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === '$ref' && typeof item === 'string'
        ? new URL(item, base).href
        : absoluteRefs(item, base),
    ]),
  )
}
function injectMessageShape(): JsonObject {
  const source = snapshot(messageSchema)
  if (!object(source) || !object(source.$defs) || !object(source.$defs.SystemReminderMessage))
    throw new Error('message Schema graph mismatch')
  const resolved = absoluteRefs(source.$defs.SystemReminderMessage, messageSchema.$id)
  if (!object(resolved) || !object(resolved.properties))
    throw new Error('reminder Schema properties missing')
  return {
    ...resolved,
    properties: {
      ...resolved.properties,
      source: {
        type: 'object',
        properties: { kind: { type: 'string' } },
        required: ['kind'],
        if: { properties: { kind: { const: 'extension' } }, required: ['kind'] },
        then: {
          allOf: [
            { $ref: `${messageSchema.$id}#/$defs/ExtensionSource` },
            { properties: { extension: { $ref: `${assetSchema.$id}#/$defs/CapabilityName` } } },
          ],
        },
      },
    },
  }
}
function guardedDimensionSelector(condition: JsonValue): JsonValue {
  if (
    !object(condition) ||
    !object(condition.if) ||
    !object(condition.if.properties) ||
    !object(condition.if.properties.dimension)
  )
    return condition
  // The frozen graph closes Dimension separately. Once that predicate is
  // deferred, subject/card selectors must still require a legal dimension.
  return {
    ...condition,
    if: {
      ...condition.if,
      properties: {
        ...condition.if.properties,
        dimension: {
          allOf: [ownedDefinition('Dimension'), condition.if.properties.dimension],
        },
      },
    },
  }
}
function guardedCallIdentity(condition: JsonValue): JsonValue {
  return {
    if: {
      properties: { position: { const: 'after_action' } },
      required: ['position'],
      not: {
        properties: {
          dimension: {
            allOf: [ownedDefinition('Dimension'), { required: ['scope'] }],
          },
        },
        required: ['dimension'],
      },
    },
    then: {},
    else: condition,
  }
}
function earlyResource(): SchemaDocument {
  const source = snapshot(schema)
  if (!object(source) || !object(source.$defs)) throw new Error('owned Schema is not an object')
  const defs: Record<string, JsonValue> = { ...source.$defs }
  defs.LoopPosition = {}
  defs.Power = {}
  defs.Dimension = {}
  const definition = ownedDefinition('LoopExtensionDefinition')
  if (!Array.isArray(definition.allOf)) throw new Error('definition conditions missing')
  defs.LoopExtensionDefinition = { ...definition, allOf: definition.allOf.slice(3) }
  const input = ownedDefinition('ExtensionInput')
  if (!Array.isArray(input.allOf)) throw new Error('input conditions missing')
  defs.ExtensionInput = {
    ...input,
    allOf: input.allOf.slice(3).map(guardedDimensionSelector),
  }
  const conclusion = ownedDefinition('Conclusion')
  if (!Array.isArray(conclusion.allOf)) throw new Error('conclusion conditions missing')
  defs.Conclusion = {
    ...conclusion,
    allOf: conclusion.allOf.flatMap((item, index) => {
      if (index === 3) return [guardedCallIdentity(item)]
      return [4, 5, 22, 27, 28].includes(index) ? [guardedDimensionSelector(item)] : []
    }),
  }
  const inject = ownedDefinition('InjectOutput')
  if (!object(inject.properties)) throw new Error('inject properties missing')
  defs.InjectOutput = {
    ...inject,
    properties: {
      ...inject.properties,
      message: injectMessageShape(),
    },
  }
  return { ...source, $id: earlyId, $defs: defs }
}
const early = earlyResource()
const earlyRuntime = createSchemaRuntime([...resources.slice(0, -1), early])
const earlyValidators = SCHEMA_DEF_NAMES.map(name =>
  Object.freeze({ name, validator: earlyRuntime.compile({ $ref: `${earlyId}#/$defs/${name}` }) }),
)
export function ordinaryShape(definition: SchemaDefName, value: unknown): boolean {
  const entry = earlyValidators.find(item => item.name === definition)
  if (entry === undefined) throw new TypeError(`unknown loop Schema definition: ${definition}`)
  const copied = snapshot(value)
  return copied !== undefined && entry.validator.validate(copied)
}
