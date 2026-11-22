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
  within: 'workspace.page',
  depths: ['tokens', 'style'],
  when: '有工作区时',
})

export const workspaceInstance = definePart({
  name: 'workspace.instance',
  label: '一个实例',
  summary: '工作区的一个实例与它能不能用',
  within: 'workspace.page',
  depths: ['tokens', 'style'],
  when: '点开一个工作区之后',
})

export const workspaceParts = [workspacePage, workspaceItem, workspaceInstance] as const
