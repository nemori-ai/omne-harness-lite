import { definePart } from '@omne-harness/shell-contract'
import {
  FIGURE_FRAME_PART,
  FIGURE_LABEL_PART,
  FIGURE_NOTE_PART,
  FIGURE_PART,
  FIGURE_TOLD_PART,
} from '../surface/parts.ts'

export const shellApp = definePart({
  name: 'shell.app',
  label: '整个应用',
  summary: '窗口里的一切。换主题、换品牌色，就是给它放令牌。',
  depths: ['tokens', 'style'],
})

export const shellSidebar = definePart({
  name: 'shell.sidebar',
  label: '侧栏',
  summary: '左边放家、导航与账号的一列',
  within: 'shell.app',
  depths: ['tokens', 'style'],
  when: '登录之后',
})

export const shellSidebarHome = definePart({
  name: 'shell.sidebar.home',
  label: '家',
  summary: 'Agent 的形平时在的地方，点了回对话',
  within: 'shell.sidebar',
  depths: ['tokens', 'style'],
  when: '登录之后',
})

export const shellSidebarNav = definePart({
  name: 'shell.sidebar.nav',
  label: '导航',
  summary: '各个页面的入口',
  within: 'shell.sidebar',
  depths: ['tokens', 'style'],
  when: '登录之后',
})

export const shellSidebarNavRow = definePart({
  name: 'shell.sidebar.nav.row',
  label: '导航的一行',
  summary: '一个页面的入口',
  within: 'shell.sidebar.nav',
  depths: ['tokens', 'style'],
  when: '登录之后',
})

export const shellSidebarUtility = definePart({
  name: 'shell.sidebar.utility',
  label: '靠下的导航',
  summary: '不常去的页面的入口',
  within: 'shell.sidebar',
  depths: ['tokens', 'style'],
  when: '有这样的页面时',
})

export const shellSidebarFooter = definePart({
  name: 'shell.sidebar.footer',
  label: '侧栏底栏',
  summary: '账号与外观所在的一行',
  within: 'shell.sidebar',
  depths: ['tokens', 'style'],
  when: '登录之后',
})

export const shellSidebarAppearance = definePart({
  name: 'shell.sidebar.appearance',
  label: '外观钮',
  summary: '换主题与字号',
  within: 'shell.sidebar.footer',
  depths: ['tokens', 'style'],
  when: '登录之后',
})

export const shellSidebarFold = definePart({
  name: 'shell.sidebar.fold',
  label: '侧栏折叠钮',
  summary: '把侧栏收成窄条或展开',
  within: 'shell.sidebar',
  depths: ['tokens', 'style'],
  when: '宽窗口时',
})

export const shellSidebarMenu = definePart({
  name: 'shell.sidebar.menu',
  label: '导航开关',
  summary: '窄窗口里打开导航',
  within: 'shell.sidebar',
  depths: ['tokens', 'style'],
  when: '窄窗口时',
})

export const shellWorkspace = definePart({
  name: 'shell.workspace',
  label: '主区',
  summary: '右边放页面的地方',
  within: 'shell.app',
  depths: ['tokens', 'style'],
  when: '登录之后',
})

export const shellWorkspacePage = definePart({
  name: 'shell.workspace.page',
  label: '一页',
  summary: '主区里一个页面的容器',
  within: 'shell.workspace',
  depths: ['tokens', 'style'],
  when: '登录之后',
})

export const shellGate = definePart({
  name: 'shell.gate',
  label: '登录门',
  summary: '没登录时屏幕中间的一块',
  within: 'shell.app',
  depths: ['tokens', 'style'],
  when: '没登录时',
})

export const shellFigure = definePart({
  name: FIGURE_PART,
  label: '形',
  summary: 'Agent 的形：在窗口里，也在拿出窗口之后的桌面上',
  within: 'shell.app',
  depths: ['tokens', 'style'],
})

export const shellFigureLabel = definePart({
  name: FIGURE_LABEL_PART,
  label: '签',
  summary: '拿着形时写在旁边的一两行：松手会去哪，按着 ⌘ 看的是哪个窗口',
  within: 'shell.app',
  depths: ['tokens', 'style'],
  when: '形在桌面上被拿着时',
})

export const shellFigureNote = definePart({
  name: FIGURE_NOTE_PART,
  label: '说话笺',
  summary: '对 Agent 说一句话的笺：桌面上单击形打开的那一块，与窗口里随身入口展开的小框',
  within: 'shell.app',
  depths: ['tokens', 'style'],
  when: '单击桌面上的形之后',
})

export const shellFigureTold = definePart({
  name: FIGURE_TOLD_PART,
  label: '告知笺',
  summary: '形在家里说给人听的一句：一个模块的提示',
  within: 'shell.sidebar',
  depths: ['tokens', 'style'],
  when: '有提示时',
})

export const shellFigureFrame = definePart({
  name: FIGURE_FRAME_PART,
  label: '观测框',
  summary: '按着 ⌘ 拿着形时，圈住手下那个窗口的框',
  within: 'shell.app',
  depths: ['tokens', 'style'],
  when: '按着 ⌘ 拿着形经过一个窗口时',
})

export const shellBack = definePart({
  name: 'shell.back',
  label: '反面',
  summary: '应用翻过来的一面的外框，里面是放在反面的那一样',
  within: 'shell.app',
  depths: ['tokens', 'style'],
  when: '有反面时',
})

export const shellSidebarTurn = definePart({
  name: 'shell.sidebar.turn',
  label: '翻面的记号',
  summary: '侧栏底栏里「翻到反面」的钮',
  within: 'shell.sidebar.footer',
  depths: ['tokens', 'style'],
  when: '有反面时',
})

export const shellParts = [
  shellApp,
  shellSidebar,
  shellSidebarHome,
  shellSidebarNav,
  shellSidebarNavRow,
  shellSidebarUtility,
  shellSidebarFooter,
  shellSidebarAppearance,
  shellSidebarTurn,
  shellSidebarFold,
  shellSidebarMenu,
  shellWorkspace,
  shellWorkspacePage,
  shellGate,
  shellFigure,
  shellFigureLabel,
  shellFigureNote,
  shellFigureTold,
  shellFigureFrame,
  shellBack,
] as const
