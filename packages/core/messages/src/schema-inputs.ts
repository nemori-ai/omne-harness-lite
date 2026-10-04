import schema from '@omne-harness-lite/messages/schema' with { type: 'json' }
import retainedContentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import identitySchema from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import expirySchema from '@omne-harness-lite/offer-expiry/schema/v1' with { type: 'json' }
import accountsSchema from '@omne-harness-lite/call-accounts/schema' with { type: 'json' }
import profileSchema from '@omne-harness-lite/model-profile/schema' with { type: 'json' }
import profileV6Schema from '@omne-harness-lite/model-profile/schema/v6' with { type: 'json' }
import toolsSchema from '@omne-harness-lite/tool-definition/schema' with { type: 'json' }

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
  'ModelCallSemanticDigest',
  'ModelCallOrigin',
  'ModelCallAccountingWitness',
  'ModelCallAcknowledgedRecord',
] as const)

export const schemaGraphs = [
  {
    name: 'exact',
    kind: 'exact',
    resources: [
      identitySchema,
      expirySchema,
      contentSchema,
      retainedContentSchema,
      accountsSchema,
      profileSchema,
      profileV6Schema,
      toolsSchema,
      schema,
    ],
    sourceFiles: ['src/schema-inputs.ts'],
    resourceSpecifiers: [
      '@omne-harness-lite/identity-values/schema',
      '@omne-harness-lite/offer-expiry/schema/v1',
      '@omne-harness-lite/content-blocks/schema',
      '@omne-harness-lite/content-blocks/schema/v2',
      '@omne-harness-lite/call-accounts/schema',
      '@omne-harness-lite/model-profile/schema',
      '@omne-harness-lite/model-profile/schema/v6',
      '@omne-harness-lite/tool-definition/schema',
      '@omne-harness-lite/messages/schema',
    ],
    definitions: SCHEMA_DEF_NAMES.map(name => ({
      name,
      method: 'compile',
      schema: { $ref: `${schemaId}#/$defs/${name}` },
    })),
  },
] as const
