import { definePart } from '@omne-harness/shell-contract'

export const notificationPage = definePart({
  name: 'notification.page',
  label: '通知页',
  summary: '各处发来的通知',
  within: 'shell.workspace.page',
  depths: ['tokens', 'style'],
})

export const notificationPageFilter = definePart({
  name: 'notification.page.filter',
  label: '通知的筛选',
  summary: '只看没了结的，或看全部',
  within: 'notification.page',
  depths: ['tokens', 'style'],
})

export const notificationPageGroup = definePart({
  name: 'notification.page.group',
  label: '通知的分组',
  summary: '没了结的一组，或已了结的一组',
  within: 'notification.page',
  depths: ['tokens', 'style'],
  when: '这一组有通知时',
})

export const notificationRow = definePart({
  name: 'notification.row',
  label: '一条通知',
  summary: '列表里的一条',
  within: 'notification.page.group',
  depths: ['tokens', 'style'],
  when: '有通知时',
})

export const notificationRowTitle = definePart({
  name: 'notification.row.title',
  label: '通知的标题',
  summary: '点一下展开正文',
  within: 'notification.row',
  depths: ['tokens', 'style'],
  when: '有通知时',
})

export const notificationRowActions = definePart({
  name: 'notification.row.actions',
  label: '通知的动作',
  summary: '办完、划掉、恢复',
  within: 'notification.row',
  depths: ['tokens', 'style'],
  when: '有通知时',
})

export const notificationRowDetail = definePart({
  name: 'notification.row.detail',
  label: '通知的正文',
  summary: '点开之后的内容',
  within: 'notification.row',
  depths: ['tokens', 'style'],
  when: '点开一条之后',
})

export const notificationParts = [
  notificationPage,
  notificationPageFilter,
  notificationPageGroup,
  notificationRow,
  notificationRowTitle,
  notificationRowActions,
  notificationRowDetail,
] as const
