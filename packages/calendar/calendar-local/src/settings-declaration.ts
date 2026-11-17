import { shippedCalendarSupplyPolicies } from '@omne-harness/calendar'
import { SettingDefinitionsSchema, type SettingDefinitions } from '@omne-harness/settings'

const calendarTitles: Readonly<Record<string, Readonly<{ title: string; description: string }>>> = {
  'cn-legal-holidays': {
    title: '中国法定节假日',
    description: '按国务院公布的放假与调休安排，含补班日。',
  },
  'jp-legal-holidays': { title: '日本法定节假日', description: '按日本的国民祝日。' },
  'us-federal-holidays': { title: '美国联邦假日', description: '按美国联邦政府的公共假日。' },
}
const calendarIds = shippedCalendarSupplyPolicies.map(policy => policy.calendarId)

/** The items a person sets to choose the calendar and time zone that date questions follow. */
export const calendarEnvironmentItems = { timezone: 'timezone', calendar: 'calendar' } as const

/** Declared with the defaults of a local single-user deployment: Chinese legal calendar, Asia/Shanghai. */
export const calendarEnvironmentSettings: SettingDefinitions = SettingDefinitionsSchema.parse({
  providerId: 'calendar',
  definitionId: 'environment',
  version: '1',
  groups: [
    {
      id: 'environment',
      parentId: null,
      title: '日历与时区',
      description: '日期计算与日程按哪套日历、哪个时区。',
      order: 0,
    },
  ],
  items: [
    {
      id: calendarEnvironmentItems.timezone,
      groupId: 'environment',
      category: 'preference',
      presentation: {
        title: '时区',
        description: 'IANA 时区名，例如 Asia/Shanghai。',
        impact: '之后的日期计算与日程按这个时区换算时刻。',
        clear: '回到声明的默认时区 Asia/Shanghai。',
        adoption: 'next-read',
      },
      valueSchema: { type: 'string', minLength: 1, maxLength: 64 },
      default: { kind: 'value', value: 'Asia/Shanghai' },
      merge: 'override',
      sensitivity: 'ordinary',
    },
    {
      id: calendarEnvironmentItems.calendar,
      groupId: 'environment',
      category: 'preference',
      presentation: {
        title: '生效日历',
        description: '工作日与假日按哪份日历判断。',
        impact: '之后的日期计算与按工作日计算的日程用这份日历；已经算出的结果不变。',
        clear: '回到声明的默认日历：中国法定节假日。',
        adoption: 'next-read',
        enumLabels: calendarIds.map(value => ({
          value,
          title: calendarTitles[value]?.title ?? value,
          description: calendarTitles[value]?.description ?? value,
        })),
      },
      valueSchema: { type: 'string', enum: calendarIds },
      default: { kind: 'value', value: 'cn-legal-holidays' },
      merge: 'override',
      sensitivity: 'ordinary',
    },
  ],
})
