import { definePart } from '@omne-harness/shell-contract'

export const workspacePage = definePart({
  name: 'workspace.page',
  label: '工作区页',
  summary: '登记与管理工作区',
  within: 'shell.workspace.page',
  depths: ['tokens', 'style'],
})

export const workspaceItem = definePart({
  name: 'workspace.item',
  label: '一个工作区',
  summary: '列表里的一行',
  within: 'workspace.list',
  depths: ['tokens', 'style'],
  when: '有工作区时',
})

export const workspaceInstance = definePart({
  name: 'workspace.instance',
  label: '一个实例',
  summary: '工作区的一个实例与它能不能用',
  within: 'workspace.detail',
  depths: ['tokens', 'style'],
  when: '点开一个工作区之后',
})

export const workspaceRegister = definePart({
  name: 'workspace.register',
  label: '登记工作区',
  summary: '填一个目录，登记成工作区',
  within: 'workspace.page',
  depths: ['tokens', 'style'],
})

export const workspaceList = definePart({
  name: 'workspace.list',
  label: '工作区列表',
  summary: '这个租户的工作区',
  within: 'workspace.page',
  depths: ['tokens', 'style'],
})

export const workspaceDetail = definePart({
  name: 'workspace.detail',
  label: '工作区的详情',
  summary: '一个工作区的实例与授权',
  within: 'workspace.page',
  depths: ['tokens', 'style'],
  when: '点开一个工作区之后',
})
export const workspaceParts = [
  workspacePage,
  workspaceItem,
  workspaceInstance,
  workspaceRegister,
  workspaceList,
  workspaceDetail,
] as const
