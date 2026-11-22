import { definePart } from '@omne-harness/shell-contract'

export const scheduleRefresh = definePart({
  name: 'schedule.refresh',
  label: '刷新日程',
  summary: '重读列表与打开的日程',
  within: 'schedule.page',
  depths: ['tokens', 'style'],
})

export const scheduleFilter = definePart({
  name: 'schedule.filter',
  label: '日程的筛选',
  summary: '只看当前的，或看全部',
  within: 'schedule.list',
  depths: ['tokens', 'style'],
})

export const scheduleTitle = definePart({
  name: 'schedule.title',
  label: '日程的名字',
  summary: '打开的这条日程叫什么',
  within: 'schedule.reading',
  depths: ['tokens', 'style'],
  when: '打开一条日程且读到时',
})

export const scheduleUpcoming = definePart({
  name: 'schedule.upcoming',
  label: '接下来几次',
  summary: '这条日程之后几次的时间',
  within: 'schedule.reading',
  depths: ['tokens', 'style'],
  when: '打开一条日程且读到预览时',
})

export const scheduleActivation = definePart({
  name: 'schedule.activation',
  label: '要启用的日程',
  summary: '放行卡里写明将启用什么',
  within: 'human-intervention.paper.card.detail',
  depths: ['tokens', 'style'],
  when: '放行卡是启用日程的调用时',
})

export const schedulePage = definePart({
  name: 'schedule.page',
  label: '日程页',
  summary: '定好的时间与它们的下一次',
  within: 'shell.workspace.page',
  depths: ['tokens', 'style'],
})

export const scheduleList = definePart({
  name: 'schedule.list',
  label: '日程列表',
  summary: '左边的一列日程',
  within: 'schedule.page',
  depths: ['tokens', 'style'],
})

export const scheduleListRow = definePart({
  name: 'schedule.list.row',
  label: '日程的一行',
  summary: '列表里的一条日程',
  within: 'schedule.list',
  depths: ['tokens', 'style'],
  when: '有日程时',
})

export const scheduleReading = definePart({
  name: 'schedule.reading',
  label: '日程的阅读面',
  summary: '右边看一条日程的地方',
  within: 'schedule.page',
  depths: ['tokens', 'style'],
})
export const scheduleParts = [
  scheduleRefresh,
  scheduleFilter,
  scheduleTitle,
  scheduleUpcoming,
  scheduleActivation,
  schedulePage,
  scheduleList,
  scheduleListRow,
  scheduleReading,
] as const
