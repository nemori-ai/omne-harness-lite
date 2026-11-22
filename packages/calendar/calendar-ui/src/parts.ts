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

export const calendarParts = [calendarPage, calendarLookup, calendarLookupAsk] as const
