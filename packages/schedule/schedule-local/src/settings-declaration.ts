import { SettingDefinitionsSchema, type SettingDefinitions } from '@omne-harness/settings'

/** What an agent's schedule change needs from the owner: nothing more, or the owner's confirmation. */
export const agentScheduleConsentValues = ['auto', 'draft'] as const
export type AgentScheduleConsent = (typeof agentScheduleConsentValues)[number]
export const agentScheduleConsentItem = 'agentScheduleConsent'

/** Declared with the default the owner decided: agent-created schedules take effect. */
export const scheduleAgentAuthoringSettings: SettingDefinitions = SettingDefinitionsSchema.parse({
  providerId: 'schedule',
  definitionId: 'agent-authoring',
  version: '1',
  groups: [
    {
      id: 'agent-authoring',
      parentId: null,
      title: 'agent 管理日程',
      description: 'agent 替你建、改日程时要不要先经过你。',
      order: 0,
    },
  ],
  items: [
    {
      id: agentScheduleConsentItem,
      groupId: 'agent-authoring',
      category: 'preference',
      presentation: {
        title: 'agent 建日程的方式',
        description: 'agent 建的日程直接生效，还是先存草稿、由你确认后生效。',
        impact:
          '只影响之后的决定；已经生效的日程不受影响。先存草稿时，agent 要让日程生效或改动生效中的日程，会在会话里出一张问询卡。',
        clear: '回到默认：自动生效。',
        adoption: 'next-read',
        enumLabels: [
          { value: 'auto', title: '自动生效', description: 'agent 建的日程直接生效。' },
          {
            value: 'draft',
            title: '先存草稿',
            description: 'agent 要让日程生效或改动生效中的日程，先在会话里问你。',
          },
        ],
      },
      valueSchema: { type: 'string', enum: [...agentScheduleConsentValues] },
      default: { kind: 'value', value: 'auto' },
      merge: 'override',
      sensitivity: 'ordinary',
    },
  ],
})
