import {
  definePart,
  type FigureDoing,
  type FloatCorner,
  type FloatProps,
} from '@omne-harness/shell-contract'
import type { ReactNode } from 'react'
import type { SayAnswer, SayTarget } from './model/say.ts'

/** What the drawing of a message is given: who spoke, whether it is still being written, and its content drawn. */
export type MessageDrawing = Readonly<{ role: string; live: boolean; content: ReactNode }>

/** What the drawing of a bubble is given: whose words, whether they are still being written, and the words drawn. */
export type BubbleDrawing = Readonly<{ role: string; live: boolean; content: ReactNode }>

/** What the drawing of the page's backdrop is given: whether no session is open. */
export type BackdropDrawing = Readonly<{ empty: boolean }>

export type CompanionSession = Readonly<{ session: string; name: string }>

export type CompanionPort = Readonly<{
  sessions: readonly CompanionSession[] | null
  current: string | null
  say: (to: SayTarget, words: string) => Promise<SayAnswer>
  show: () => void
}>

export type CompanionFigureDrawing = Readonly<{
  doing: FigureDoing
  unfolded: boolean
  dragging: boolean
}>

export type CompanionPanelDrawing = CompanionPort & Readonly<{ close: () => void }>

export type CompanionDrawing = CompanionPort &
  Readonly<{
    doing: FigureDoing
    grip: FloatProps['grip']
    corner: FloatCorner
    dragging: boolean
  }>

export const sessionCompanion = definePart<CompanionDrawing>({
  name: 'session.companion',
  label: '随身入口',
  summary: '浮在整个应用之上、能拖到任何地方的一处，在哪一页都能对 Agent 说一句话',
  depths: ['tokens', 'style', 'render'],
  when: '登录之后',
})

export const sessionCompanionFigure = definePart<CompanionFigureDrawing>({
  name: 'session.companion.figure',
  label: '随身入口的形象',
  summary: '随身入口长什么样，按它展开小框，按住它拖；自带的是几粒墨点',
  within: 'session.companion',
  depths: ['tokens', 'style', 'render'],
  when: '登录之后',
})

export const sessionCompanionPanel = definePart<CompanionPanelDrawing>({
  name: 'session.companion.panel',
  label: '随身入口的小框',
  summary: '写一句话、选说给谁、发出去的地方',
  within: 'session.companion',
  depths: ['tokens', 'style', 'render'],
  when: '小框展开时',
})

export const sessionList = definePart({
  name: 'session.list',
  label: '会话列表',
  summary: '侧栏里的会话',
  within: 'shell.sidebar',
  depths: ['tokens', 'style'],
})

export const sessionListNew = definePart({
  name: 'session.list.new',
  label: '新建会话',
  summary: '开一段新的会话',
  within: 'session.list',
  depths: ['tokens', 'style'],
})

/** A row of the list as a drawing gets it: the name the row shows, and whether it is the session that is open. */
export type ListItemDrawing = Readonly<{ title: string; selected: boolean }>

export const sessionListItem = definePart<ListItemDrawing>({
  name: 'session.list.item',
  label: '会话的一行',
  summary: '列表里的一段会话',
  within: 'session.list',
  depths: ['tokens', 'style', 'render'],
  when: '有会话时',
})

export const sessionArchived = definePart({
  name: 'session.archived',
  label: '已归档',
  summary: '收起来的归档会话',
  within: 'shell.sidebar',
  depths: ['tokens', 'style'],
})

export const sessionArchivedItem = definePart({
  name: 'session.archived.item',
  label: '归档的一行',
  summary: '一段已归档的会话',
  within: 'session.archived',
  depths: ['tokens', 'style'],
  when: '展开已归档且有归档时',
})

/** The header as a drawing gets it: the title it shows. */
export type HeaderDrawing = Readonly<{ title: string }>

export const sessionHeader = definePart<HeaderDrawing>({
  name: 'session.header',
  label: '对话头',
  summary: '对话页顶上的一栏',
  depths: ['tokens', 'style', 'render'],
  when: '打开一段会话时',
})

export const sessionHeaderTitle = definePart({
  name: 'session.header.title',
  label: '会话标题',
  summary: '这段会话的名字',
  within: 'session.header',
  depths: ['tokens', 'style'],
  when: '打开一段会话时',
})

export const sessionHeaderModel = definePart({
  name: 'session.header.model',
  label: '模型选择',
  summary: '换这段会话用的模型',
  within: 'session.header',
  depths: ['tokens', 'style'],
  when: '对话头够宽且有模型可选时',
})

export const sessionHeaderWorkspace = definePart({
  name: 'session.header.workspace',
  label: '工作区选择',
  summary: '换这段会话的工作区',
  within: 'session.header',
  depths: ['tokens', 'style'],
  when: '对话头够宽且有工作区可选时',
})

export const sessionHeaderPermission = definePart({
  name: 'session.header.permission',
  label: '权限处理',
  summary: '选动作要不要先问你',
  within: 'session.header',
  depths: ['tokens', 'style'],
  when: '对话头够宽时',
})

export const sessionHeaderMore = definePart({
  name: 'session.header.more',
  label: '更多',
  summary: '对话头上的「⋯」菜单',
  within: 'session.header',
  depths: ['tokens', 'style'],
  when: '打开一段会话时',
})

export const sessionTranscript = definePart({
  name: 'session.transcript',
  label: '转写区',
  summary: '对话往下滚的地方',
  depths: ['tokens', 'style'],
  when: '打开一段会话时',
})

export const sessionTranscriptUserMessage = definePart<MessageDrawing>({
  name: 'session.transcript.user-message',
  label: '你的消息',
  summary: '你说的一条话',
  within: 'session.transcript',
  depths: ['tokens', 'style', 'render'],
  when: '有消息时',
})

export const sessionTranscriptAgentMessage = definePart<MessageDrawing>({
  name: 'session.transcript.agent-message',
  label: 'Agent 的回复',
  summary: 'Agent 说的一条话',
  within: 'session.transcript',
  depths: ['tokens', 'style', 'render'],
  when: '有回复时',
})

export const sessionTranscriptBubble = definePart<BubbleDrawing>({
  name: 'session.transcript.bubble',
  label: '气泡',
  summary: '一条消息里连着的一段话',
  within: 'session.transcript',
  depths: ['tokens', 'style', 'render'],
  when: '有消息时',
})

export const sessionBackdrop = definePart<BackdropDrawing>({
  name: 'session.backdrop',
  label: '对话页的背景',
  summary: '垫在对话页一切之下的一层，自带的什么都不画',
  depths: ['render'],
  when: '有画法放在它上面时',
})

export const sessionTranscriptToolCall = definePart({
  name: 'session.transcript.tool-call',
  label: '工具调用行',
  summary: '一次工具调用的过程行',
  within: 'session.transcript',
  depths: ['tokens', 'style'],
  when: '有工具调用时',
})

export const sessionTranscriptReasoning = definePart({
  name: 'session.transcript.reasoning',
  label: '推理行',
  summary: 'Agent 想的过程',
  within: 'session.transcript',
  depths: ['tokens', 'style'],
  when: '有推理内容时',
})

export const sessionTranscriptFailure = definePart({
  name: 'session.transcript.failure',
  label: '失败的通知',
  summary: '一轮失败了，可以重试',
  within: 'session.transcript',
  depths: ['tokens', 'style'],
  when: '一轮失败时',
})

export const sessionQueue = definePart({
  name: 'session.queue',
  label: '排队的话',
  summary: '说了还没被处理的话',
  depths: ['tokens', 'style'],
  when: '有排队的输入时',
})

/** The composer as a drawing gets it: whether a turn runs, and whether nothing is written yet. */
export type ComposerDrawing = Readonly<{ running: boolean; empty: boolean }>

export const sessionComposer = definePart<ComposerDrawing>({
  name: 'session.composer',
  label: '输入区',
  summary: '底部写消息的地方',
  depths: ['tokens', 'style', 'render'],
  when: '打开一段会话时',
})

export const sessionComposerInput = definePart({
  name: 'session.composer.input',
  label: '输入框',
  summary: '写消息的框',
  within: 'session.composer',
  depths: ['tokens', 'style'],
  when: '打开一段会话时',
})

export const sessionComposerSend = definePart({
  name: 'session.composer.send',
  label: '发送按钮',
  summary: '发出这条消息；一轮在跑时是停止',
  within: 'session.composer',
  depths: ['tokens', 'style'],
  when: '打开一段会话时',
})

export const sessionSide = definePart({
  name: 'session.side',
  label: '侧边区',
  summary: '对话旁边的面板',
  depths: ['tokens', 'style'],
  when: '打开一段会话且有内容时',
})

export const sessionSideBackgroundCall = definePart({
  name: 'session.side.background-call',
  label: '后台调用',
  summary: '一项在后台跑的调用',
  within: 'session.side',
  depths: ['tokens', 'style'],
  when: '后台有调用时',
})

export const sessionSearch = definePart({
  name: 'session.search',
  label: '搜索页',
  summary: '在以前的会话里找',
  within: 'shell.workspace.page',
  depths: ['tokens', 'style'],
})

export const sessionSearchHit = definePart({
  name: 'session.search.hit',
  label: '搜到的一条',
  summary: '搜到的一段记录',
  within: 'session.search',
  depths: ['tokens', 'style'],
  when: '搜到东西时',
})
export const sessionParts = [
  sessionCompanion,
  sessionCompanionFigure,
  sessionCompanionPanel,
  sessionList,
  sessionListNew,
  sessionListItem,
  sessionArchived,
  sessionArchivedItem,
  sessionHeader,
  sessionHeaderTitle,
  sessionHeaderModel,
  sessionHeaderWorkspace,
  sessionHeaderPermission,
  sessionHeaderMore,
  sessionTranscript,
  sessionTranscriptUserMessage,
  sessionTranscriptAgentMessage,
  sessionTranscriptBubble,
  sessionBackdrop,
  sessionTranscriptToolCall,
  sessionTranscriptReasoning,
  sessionTranscriptFailure,
  sessionQueue,
  sessionComposer,
  sessionComposerInput,
  sessionComposerSend,
  sessionSide,
  sessionSideBackgroundCall,
  sessionSearch,
  sessionSearchHit,
] as const
