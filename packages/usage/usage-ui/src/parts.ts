import { definePart } from '@omne-harness/shell-contract'

export const usagePage = definePart({
  name: 'usage.page',
  label: '用量页',
  summary: '这个租户用了多少',
  within: 'shell.workspace.page',
  depths: ['tokens', 'style'],
})

export const usagePanel = definePart({
  name: 'usage.panel',
  label: '用量面板',
  summary: '一块用量，页里与会话旁是同一种',
  depths: ['tokens', 'style'],
})

export const usagePanelBar = definePart({
  name: 'usage.panel.bar',
  label: '面板的顶栏',
  summary: '时间段与更多',
  within: 'usage.panel',
  depths: ['tokens', 'style'],
  when: '面板不在对话头上时',
})

export const usagePanelMenu = definePart({
  name: 'usage.panel.menu',
  label: '面板的更多',
  summary: '编辑面板、刷新',
  within: 'usage.panel.bar',
  depths: ['tokens', 'style'],
  when: '面板不在对话头上时',
})

export const usageCard = definePart({
  name: 'usage.card',
  label: '用量的卡',
  summary: '面板里的一张图或一组数',
  within: 'usage.panel',
  depths: ['tokens', 'style'],
  when: '面板里有卡时',
})

export const usageOccupancy = definePart({
  name: 'usage.occupancy',
  label: '上下文占用',
  summary: '这段会话的上下文用了百分之几',
  depths: ['tokens', 'style'],
  when: '读到占用时',
})

export const usageParts = [
  usagePage,
  usagePanel,
  usagePanelBar,
  usagePanelMenu,
  usageCard,
  usageOccupancy,
] as const
