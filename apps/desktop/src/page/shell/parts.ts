import { definePart } from '@omne-harness/shell-contract'

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

export const shellParts = [
  shellApp,
  shellSidebar,
  shellSidebarHome,
  shellSidebarNav,
  shellSidebarNavRow,
  shellSidebarUtility,
  shellSidebarFooter,
  shellSidebarAppearance,
  shellSidebarFold,
  shellSidebarMenu,
  shellWorkspace,
  shellWorkspacePage,
  shellGate,
] as const
