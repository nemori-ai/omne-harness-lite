import { definePart } from '@omne-harness/shell-contract'

export const goalPanel = definePart({
  name: 'goal.panel',
  label: '目标面板',
  summary: '这段会话的目标：差多少、正文、进展与来历',
  within: 'session.side',
  depths: ['tokens', 'style'],
  when: '打开一段会话时',
})

export const goalParts = [goalPanel] as const
