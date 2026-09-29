import schema from '@omne-harness-lite/messages/schema' with { type: 'json' }
import retainedContentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import identitySchema from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import expirySchema from '@omne-harness-lite/offer-expiry/schema/v1' with { type: 'json' }
import accountsSchema from '@omne-harness-lite/call-accounts/schema' with { type: 'json' }
import profileSchema from '@omne-harness-lite/model-profile/schema' with { type: 'json' }
import accountsV2Schema from '@omne-harness-lite/call-accounts/schema/v2' with { type: 'json' }
import profileV6Schema from '@omne-harness-lite/model-profile/schema/v6' with { type: 'json' }
import profileV2Schema from '@omne-harness-lite/model-profile/schema/v2' with { type: 'json' }
import toolsSchema from '@omne-harness-lite/tool-definition/schema' with { type: 'json' }
import toolsV2Schema from '@omne-harness-lite/tool-definition/schema/v2' with { type: 'json' }
import assetsSchema from '@omne-harness-lite/asset-model/schema' with { type: 'json' }
import assetsV2Schema from '@omne-harness-lite/asset-model/schema/v2' with { type: 'json' }
import loopV3Schema from '@omne-harness-lite/loop-extension/schema/v3' with { type: 'json' }
import loopV2Schema from '@omne-harness-lite/loop-extension/schema/v2' with { type: 'json' }
import messagesV3Schema from '@omne-harness-lite/messages/schema/v3' with { type: 'json' }
import messagesV2Schema from '@omne-harness-lite/messages/schema/v2' with { type: 'json' }
import skillsV2Schema from '@omne-harness-lite/skill-package/schema/v2' with { type: 'json' }
import mcpSchema from '@omne-harness-lite/mcp-endpoint/schema' with { type: 'json' }
import slashSchema from '@omne-harness-lite/slash-command/schema' with { type: 'json' }
import connectorV2Schema from '@omne-harness-lite/asset-model/schema/connector/v2' with { type: 'json' }
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'
import { snapshot } from './json.ts'

export const schemaId = schema.$id
export const SCHEMA_DEF_NAMES = Object.freeze([
  'MessageId',
  'ResponseId',
  'CardId',
  'SessionRef',
  'AgentRef',
  'ScheduleRef',
  'RuntimeContextBlockId',
  'MessageBase',
  'SystemMessage',
  'UserMessage',
  'AssistantEnding',
  'AssistantMessage',
  'ToolMessage',
  'ToolInternalEnding',
  'ToolInternalMessage',
  'ReminderNature',
  'SystemReminderMessage',
  'ReminderSource',
  'BackgroundExecutionFinishedSource',
  'BackgroundExecutionInterruptedSource',
  'AttemptStartedSource',
  'InterruptedSource',
  'CardAnswer',
  'SystemWaitAnsweredSource',
  'LoopGuardSource',
  'PeerSessionNoteSource',
  'ScheduledTriggerSource',
  'RuntimeContextChangedSource',
  'RuntimeContextSnapshotSource',
  'ExtensionSource',
  'LoopExtensionName',
  'SilencedBlockRef',
  'CompactionMessage',
  'ModelCallDispatchedRecord',
  'SelectedBy',
  'ParameterAdjustment',
  'CredentialScope',
  'ModelCallOpenedRecord',
  'ModelCallInterruptIntentRecord',
  'ModelCallEndedRecord',
  'ModelSelectionChangedRecord',
  'ModelInvocationRecord',
  'Message',
  'CreationKey',
  'CallKey',
  'ModelCallPayloadRef',
  'ModelCallCreationInput',
  'ModelCallCreatedPayload',
  'ModelCallCreatedRecord',
  'ModelCallReplyReadyRecord',
] as const)
export type SchemaDefName = (typeof SCHEMA_DEF_NAMES)[number]
export interface SchemaValidation {
  readonly valid: boolean
}
// Only this fixed, owned resource graph is retained. No caller-schema cache or remote resolution.
const runtime = createSchemaRuntime([
  identitySchema,
  expirySchema,
  contentSchema,
  retainedContentSchema,
  accountsSchema,
  profileSchema,
  accountsV2Schema,
  profileV6Schema,
  profileV2Schema,
  toolsSchema,
  toolsV2Schema,
  assetsSchema,
  assetsV2Schema,
  loopV3Schema,
  loopV2Schema,
  messagesV3Schema,
  messagesV2Schema,
  skillsV2Schema,
  mcpSchema,
  slashSchema,
  connectorV2Schema,
  schema,
])
const validators = SCHEMA_DEF_NAMES.map(name =>
  Object.freeze({ name, validator: runtime.compile({ $ref: `${schemaId}#/$defs/${name}` }) }),
)
/** Shape only; the judge functions additionally implement contract cross-member predicates. */
export function validate(defName: SchemaDefName, value: unknown): SchemaValidation {
  const entry = validators.find(item => item.name === defName)
  if (entry === undefined) throw new TypeError(`unknown messages Schema definition: ${defName}`)
  const copied = snapshot(value)
  return Object.freeze({ valid: copied !== undefined && entry.validator.validate(copied) })
}
