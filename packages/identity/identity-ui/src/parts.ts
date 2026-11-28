import { definePart } from '@omne-harness/shell-contract'

export const identityLogin = definePart({
  name: 'identity.login',
  label: '登录的卡',
  summary: '登录门里的那张卡',
  within: 'shell.gate',
  depths: ['tokens', 'style'],
  when: '没登录时',
})

export const identityLoginForm = definePart({
  name: 'identity.login.form',
  label: '登录的表单',
  summary: '填登录名与密码',
  within: 'identity.login',
  depths: ['tokens', 'style'],
  when: '没登录时',
})

export const identityLoginSubmit = definePart({
  name: 'identity.login.submit',
  label: '登录按钮',
  summary: '提交登录或注册',
  within: 'identity.login.form',
  depths: ['tokens', 'style'],
  when: '没登录时',
})

export const identityAccount = definePart({
  name: 'identity.account',
  label: '账号',
  summary: '侧栏底下的账号',
  within: 'shell.sidebar.footer',
  depths: ['tokens', 'style'],
  when: '侧栏展开时',
})

export const identityAccountControl = definePart({
  name: 'identity.account.control',
  label: '账号钮',
  summary: '点开退出的菜单',
  within: 'identity.account',
  depths: ['tokens', 'style'],
  when: '侧栏展开时',
})

export const identityAccountRail = definePart({
  name: 'identity.account.rail',
  label: '窄条里的账号钮',
  summary: '侧栏收成窄条时的账号',
  within: 'shell.sidebar.footer',
  depths: ['tokens', 'style'],
  when: '侧栏收成窄条时',
})

export const identityParts = [
  identityLogin,
  identityLoginForm,
  identityLoginSubmit,
  identityAccount,
  identityAccountControl,
  identityAccountRail,
] as const
