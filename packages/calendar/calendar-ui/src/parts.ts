import { definePart } from '@omne-harness/shell-contract'

export const calendarPage = definePart({
  name: 'calendar.page',
  label: '日历页',
  summary: '用哪份日历，查某一天',
  within: 'shell.workspace.page',
  depths: ['tokens', 'style'],
})

export const calendarLookup = definePart({
  name: 'calendar.lookup',
  label: '查一天',
  summary: '问某一天算不算工作日',
  within: 'calendar.page',
  depths: ['tokens', 'style'],
})

export const calendarLookupAsk = definePart({
  name: 'calendar.lookup.ask',
  label: '查的按钮',
  summary: '按填的日期去查',
  within: 'calendar.lookup',
  depths: ['tokens', 'style'],
})

export const calendarEnvironment = definePart({
  name: 'calendar.environment',
  label: '生效的日历',
  summary: '现在用哪份日历与时区',
  within: 'calendar.page',
  depths: ['tokens', 'style'],
})

export const calendarShipped = definePart({
  name: 'calendar.shipped',
  label: '供应的日历',
  summary: '部署给出的日历清单',
  within: 'calendar.page',
  depths: ['tokens', 'style'],
})

export const calendarShippedItem = definePart({
  name: 'calendar.shipped.item',
  label: '一份日历',
  summary: '清单里的一份日历',
  within: 'calendar.shipped',
  depths: ['tokens', 'style'],
  when: '清单里有日历时',
})
export const calendarParts = [
  calendarPage,
  calendarLookup,
  calendarLookupAsk,
  calendarEnvironment,
  calendarShipped,
  calendarShippedItem,
] as const
