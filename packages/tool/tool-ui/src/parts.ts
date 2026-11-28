import { definePart } from '@omne-harness/shell-contract'

export const toolCallOutput = definePart({
  name: 'tool.call-output',
  label: '调用的输出',
  summary: '一项后台调用写出的文字',
  within: 'session.side.background-call',
  depths: ['tokens', 'style'],
  when: '调用有文字输出时',
})

export const toolCallChildren = definePart({
  name: 'tool.call-children',
  label: '子调用',
  summary: '一次调用之下每个子调用的一行',
  within: 'session.side.background-call',
  depths: ['tokens', 'style'],
  when: '调用发起过子调用时',
})

export const toolCodeCard = definePart({
  name: 'tool.code-card',
  label: 'Code 的调用',
  summary: '对话里一次 Code 调用：过程行、程序与子调用',
  within: 'session.transcript',
  depths: ['tokens', 'style'],
  when: '对话里有 Code 的调用时',
})

export const toolParts = [toolCallOutput, toolCallChildren, toolCodeCard] as const
