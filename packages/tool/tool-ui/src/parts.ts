import { definePart } from '@omne-harness/shell-contract'

export const toolCallOutput = definePart({
  name: 'tool.call-output',
  label: '调用的输出',
  summary: '一项后台调用写出的文字',
  within: 'session.side.background-call',
  depths: ['tokens', 'style'],
  when: '调用有文字输出时',
})

export const toolParts = [toolCallOutput] as const
