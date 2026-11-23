import { definePart } from '@omne-harness/shell-contract'

export const assetsPage = definePart({
  name: 'assets.page',
  label: '资产页',
  summary: '看这个租户有哪些能力',
  within: 'shell.workspace.page',
  depths: ['tokens', 'style'],
})

export const assetsTabs = definePart({
  name: 'assets.tabs',
  label: '类别页签',
  summary: '一排资产的类别',
  within: 'assets.page',
  depths: ['tokens', 'style'],
  when: '有类别时',
})

export const assetsTabsTab = definePart({
  name: 'assets.tabs.tab',
  label: '一个页签',
  summary: '一类资产的页签',
  within: 'assets.tabs',
  depths: ['tokens', 'style'],
  when: '有类别时',
})

export const assetsPanel = definePart({
  name: 'assets.panel',
  label: '类别内容',
  summary: '选中那一类的内容',
  within: 'assets.page',
  depths: ['tokens', 'style'],
  when: '有类别时',
})

export const assetsCategory = definePart({
  name: 'assets.category',
  label: '类别页',
  summary: '一类资产的通用页面',
  within: 'assets.panel',
  depths: ['tokens', 'style'],
  when: '这一类没有自己的页面时',
})

export const assetsCategoryHead = definePart({
  name: 'assets.category.head',
  label: '类别页头',
  summary: '这一类的名字与新建',
  within: 'assets.category',
  depths: ['tokens', 'style'],
  when: '这一类没有自己的页面时',
})

export const assetsCategoryCreate = definePart({
  name: 'assets.category.create',
  label: '新建按钮',
  summary: '展开或收起新建的表单',
  within: 'assets.category.head',
  depths: ['tokens', 'style'],
  when: '这一类可以新建时',
})

export const assetsCreate = definePart({
  name: 'assets.create',
  label: '新建表单',
  summary: '填名字与内容，建一份',
  within: 'assets.category',
  depths: ['tokens', 'style'],
  when: '点开新建之后',
})

export const assetsCreateSubmit = definePart({
  name: 'assets.create.submit',
  label: '提交新建',
  summary: '把填好的这一份建出来',
  within: 'assets.create',
  depths: ['tokens', 'style'],
  when: '点开新建之后',
})

export const assetsList = definePart({
  name: 'assets.list',
  label: '资产列表',
  summary: '这一类下的每一份',
  within: 'assets.category',
  depths: ['tokens', 'style'],
  when: '这一类有资产时',
})

export const assetsItem = definePart({
  name: 'assets.item',
  label: '一份资产',
  summary: '列表里的一行',
  within: 'assets.list',
  depths: ['tokens', 'style'],
  when: '这一类有资产时',
})

export const assetsItemDetail = definePart({
  name: 'assets.item.detail',
  label: '资产详情',
  summary: '点开一份之后的内容',
  within: 'assets.item',
  depths: ['tokens', 'style'],
  when: '点开一份之后',
})

export const assetsItemActions = definePart({
  name: 'assets.item.actions',
  label: '资产的动作',
  summary: '禁用、启用、移除',
  within: 'assets.item.detail',
  depths: ['tokens', 'style'],
  when: '点开一份之后',
})

export const assetsSetting = definePart({
  name: 'assets.setting',
  label: '一条设置',
  summary: '一项设置的说明、值与控件',
  depths: ['tokens', 'style'],
  when: '有设置时',
})

export const assetsSettingControl = definePart({
  name: 'assets.setting.control',
  label: '设置的控件',
  summary: '改这一项的地方',
  within: 'assets.setting',
  depths: ['tokens', 'style'],
  when: '这一项可以改时',
})

export const assetsSettingsPage = definePart({
  name: 'assets.settings-page',
  label: '设置页',
  summary: '这个租户的全部设置',
  within: 'shell.workspace.page',
  depths: ['tokens', 'style'],
})

export const assetsSettingsPageGroup = definePart({
  name: 'assets.settings-page.group',
  label: '设置的分组',
  summary: '带标题的一组设置',
  within: 'assets.settings-page',
  depths: ['tokens', 'style'],
  when: '有设置时',
})

export const assetsParts = [
  assetsPage,
  assetsTabs,
  assetsTabsTab,
  assetsPanel,
  assetsCategory,
  assetsCategoryHead,
  assetsCategoryCreate,
  assetsCreate,
  assetsCreateSubmit,
  assetsList,
  assetsItem,
  assetsItemDetail,
  assetsItemActions,
  assetsSetting,
  assetsSettingControl,
  assetsSettingsPage,
  assetsSettingsPageGroup,
] as const
