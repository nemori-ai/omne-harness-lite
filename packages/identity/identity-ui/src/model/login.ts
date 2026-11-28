import type { IdentityProtocol } from '@omne-harness/identity-protocol'
import { ClientRequestError, type ClientOf } from '@omne-harness/sdk/core'
import type { LoginCredentials, LoginResult } from '@omne-harness/shell-contract'

export type LoginMode = 'sign-in' | 'register'

export type LoginForm = Readonly<{
  mode: LoginMode
  pending: boolean
  error: string | undefined
}>

export type Register = Pick<ClientOf<IdentityProtocol>, 'register-and-activate'>

export type LoginPorts = Readonly<{
  register: Register
  login(credentials: LoginCredentials): Promise<LoginResult>
}>

export const LOGIN_TEXT: Readonly<Record<Exclude<LoginResult, 'signed-in'>, string>> = {
  'auth-failed': '登录名或密码不对。',
  rejected: '填写的内容不合规则。',
  unknown: '不知道登录有没有成功：没有收到可信的答复。请再试一次。',
  unavailable: '现在登录不了：服务暂时不可用。请稍后再试。',
}

export function registerText(outcome: string): string | undefined {
  switch (outcome) {
    case 'succeeded':
      return undefined
    case 'not-loginable':
      return '这个登录名不能注册：可能已经有人用了，或者不合规则。'
    case 'stage-not-provided':
      return '这个服务现在不开放注册。'
    case 'protocol-rejected':
      return '填写的内容不合规则。'
    case 'unknown':
    case 'uncertain':
      return '不知道注册有没有成功：没有收到可信的答复。可以直接试着登录。'
    default:
      return '现在注册不了：服务暂时不可用。请稍后再试。'
  }
}

async function registerOutcome(register: Register, credentials: LoginCredentials) {
  try {
    return (await register['register-and-activate'](credentials)).outcome
  } catch (failure) {
    if (!(failure instanceof ClientRequestError)) throw failure
    return 'protocol-rejected'
  }
}

export interface LoginModel {
  current(): LoginForm
  subscribe(listener: () => void): () => void
  choose(mode: LoginMode): void
  submit(credentials: LoginCredentials): Promise<void>
}

export function createLoginModel(ports: LoginPorts): LoginModel {
  let form: LoginForm = { mode: 'sign-in', pending: false, error: undefined }
  const listeners = new Set<() => void>()
  const update = (next: Partial<LoginForm>): void => {
    form = { ...form, ...next }
    for (const listener of Array.from(listeners)) listener()
  }

  async function signIn(credentials: LoginCredentials): Promise<string | undefined> {
    const result = await ports.login(credentials)
    return result === 'signed-in' ? undefined : LOGIN_TEXT[result]
  }

  async function attempt(mode: LoginMode, credentials: LoginCredentials) {
    if (mode === 'sign-in') return signIn(credentials)
    const text = registerText(await registerOutcome(ports.register, credentials))
    return text ?? signIn(credentials)
  }

  return {
    current: () => form,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    choose(mode) {
      if (mode !== form.mode) update({ mode, error: undefined })
    },
    async submit(credentials) {
      if (form.pending) return
      update({ pending: true, error: undefined })
      try {
        update({ error: await attempt(form.mode, credentials) })
      } finally {
        update({ pending: false })
      }
    },
  }
}
