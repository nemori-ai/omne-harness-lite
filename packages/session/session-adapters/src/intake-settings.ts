import { independentSettingsPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { DEFAULT_SESSION_INTAKE_LIMITS } from '@omne-harness/session-contract'
import {
  evaluateSettings,
  SettingDefinitionsSchema,
  type SettingDefinitions,
} from '@omne-harness/settings'

/** The item a tenant sets to bound how many ordinary inputs of a session may wait at once. */
export const sessionIntakeItems = { pendingLimit: 'pending-limit' } as const

export const sessionIntakeSettings: SettingDefinitions = SettingDefinitionsSchema.parse({
  providerId: 'session',
  definitionId: 'intake',
  version: '1',
  groups: [
    {
      id: 'intake',
      parentId: null,
      title: '输入排队',
      description: '一个会话里还没处理的输入最多排多少条。',
      order: 0,
    },
  ],
  items: [
    {
      id: sessionIntakeItems.pendingLimit,
      groupId: 'intake',
      category: 'preference',
      presentation: {
        title: '待处理输入的上限',
        description: '一个会话里同时排着、还没被处理的输入最多有多少条。',
        impact: '之后送来的输入按这个上限判断收不收；已经收下的不受影响。',
        clear: `回到声明的默认值 ${DEFAULT_SESSION_INTAKE_LIMITS.maxPendingInputs} 条。`,
        adoption: 'next-read',
        unit: '条',
      },
      valueSchema: { type: 'integer', minimum: 1, maximum: 4096 },
      default: { kind: 'value', value: DEFAULT_SESSION_INTAKE_LIMITS.maxPendingInputs },
      merge: 'override',
      sensitivity: 'ordinary',
    },
  ],
})

/** Session brings its own intake settings; the row that owns the budget block loads it. */
export const sessionIntakeSettingsPlugin = independentSettingsPlugin(
  'session-intake-settings',
  sessionIntakeSettings,
)

type View = Readonly<{ definition: unknown; state: Readonly<{ sources: unknown }> }>

function onlyView(basis: unknown): View | null {
  const views = (basis as { views?: unknown } | null)?.views
  return Array.isArray(views) && views.length === 1 ? (views[0] as View) : null
}

function wholeLimit(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : null
}

/** The pending limit a settings read gives. Null: the read does not carry a value of it. */
export function pendingLimitOf(basis: unknown): number | null {
  const view = onlyView(basis)
  if (view === null) return null
  const evaluated = evaluateSettings({ definition: view.definition, sources: view.state?.sources })
  if (evaluated.kind !== 'complete') return null
  const entry = evaluated.entries.find(item => item.itemId === sessionIntakeItems.pendingLimit)
  return entry?.value.kind === 'value' ? wholeLimit(entry.value.value) : null
}
