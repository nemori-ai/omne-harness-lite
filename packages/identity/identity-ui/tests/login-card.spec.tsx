// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ClientRequestError } from '@omne-harness/sdk/core'
import type { LoginCredentials, LoginResult } from '@omne-harness/shell-contract'
import { LOGIN_TEXT, createLoginModel, registerText, type Register } from '../src/model/login.ts'
import { LoginCard } from '../src/view/login-card.tsx'

afterEach(() => cleanup())

function setup(options: { login?: LoginResult; register?: () => Promise<unknown> } = {}) {
  const handedOver: LoginCredentials[] = []
  const registered: LoginCredentials[] = []
  const register = {
    'register-and-activate': async (credentials: LoginCredentials) => {
      registered.push(credentials)
      return options.register === undefined
        ? { outcome: 'succeeded', body: {} }
        : options.register()
    },
  } as unknown as Register
  const model = createLoginModel({
    register,
    login: async credentials => {
      handedOver.push(credentials)
      return options.login ?? 'signed-in'
    },
  })
  render(<LoginCard model={model} />)
  return { handedOver, registered, model }
}

const input = (name: string) => document.querySelector(`input[name="${name}"]`) as HTMLInputElement

async function fillAndSubmit(identifier: string, secret: string): Promise<void> {
  fireEvent.change(input('loginIdentifier'), { target: { value: identifier } })
  fireEvent.change(input('credential'), { target: { value: secret } })
  await act(async () => {
    fireEvent.submit(input('credential').closest('form')!)
  })
}

const alert = () => screen.queryByRole('alert')?.textContent ?? null

describe('登录门', () => {
  it('P0 每个部位都在自己的元素上', () => {
    setup()
    const on = (name: string) => document.querySelectorAll(`[data-omne-part="${name}"]`)
    expect(on('identity.login')).toHaveLength(1)
    expect(on('identity.login')[0]?.classList.contains('identity-login')).toBe(true)
    expect(on('identity.login.form')[0]?.tagName).toBe('FORM')
    expect(on('identity.login.submit')[0]?.getAttribute('type')).toBe('submit')
    expect(
      on('identity.login.submit')[0]?.closest('[data-omne-part="identity.login.form"]'),
    ).not.toBeNull()
  })

  it('登录：凭据经外壳交出，交出之后表单立刻清空', async () => {
    const t = setup()
    fireEvent.change(input('loginIdentifier'), { target: { value: ' alice ' } })
    fireEvent.change(input('credential'), { target: { value: 'secret-pw' } })
    fireEvent.submit(input('credential').closest('form')!)
    expect(input('loginIdentifier').value).toBe('')
    expect(input('credential').value).toBe('')
    await act(async () => {})
    expect(t.handedOver).toEqual([{ loginIdentifier: 'alice', credential: 'secret-pw' }])
    expect(t.registered).toEqual([])
    expect(alert()).toBeNull()
  })

  it.each(['auth-failed', 'unknown', 'unavailable'] as const)(
    '登录的结果 %s 如实显示',
    async result => {
      setup({ login: result })
      await fillAndSubmit('alice', 'pw')
      expect(alert()).toBe(LOGIN_TEXT[result])
    },
  )

  it('第一次使用：注册成功后接着登录', async () => {
    const t = setup()
    fireEvent.click(screen.getByRole('button', { name: '第一次使用' }))
    expect(screen.getByRole('heading', { name: '注册并登录' })).toBeTruthy()
    await fillAndSubmit('bob', 'pw')
    expect(t.registered).toEqual([{ loginIdentifier: 'bob', credential: 'pw' }])
    expect(t.handedOver).toEqual([{ loginIdentifier: 'bob', credential: 'pw' }])
  })

  it.each([
    'not-loginable',
    'stage-not-provided',
    'unknown',
    'uncertain',
    'unavailable',
    'not-sent',
  ])('注册的结果 %s 如实显示，不接着登录，表单同样清空', async outcome => {
    const t = setup({ register: async () => ({ outcome, body: {} }) })
    fireEvent.click(screen.getByRole('button', { name: '第一次使用' }))
    await fillAndSubmit('bob', 'pw')
    expect(alert()).toBe(registerText(outcome))
    expect(t.handedOver).toEqual([])
    expect(input('credential').value).toBe('')
  })

  it('注册的请求被协议拒绝时说填写的内容不合规则', async () => {
    setup({
      register: () => Promise.reject(new ClientRequestError('register-and-activate')),
    })
    fireEvent.click(screen.getByRole('button', { name: '第一次使用' }))
    await fillAndSubmit('bob', 'pw')
    expect(alert()).toBe('填写的内容不合规则。')
  })

  it('五种注册文案各不相同，成功没有文案', () => {
    const texts = [
      'not-loginable',
      'stage-not-provided',
      'protocol-rejected',
      'uncertain',
      'x',
    ].map(registerText)
    expect(new Set(texts).size).toBe(5)
    expect(registerText('succeeded')).toBeUndefined()
    expect(registerText('unknown')).toBe(registerText('uncertain'))
  })

  it('等着答复时不再交第二次', async () => {
    let release: (result: LoginResult) => void = () => {}
    const handedOver: LoginCredentials[] = []
    const model = createLoginModel({
      register: {} as Register,
      login: credentials => {
        handedOver.push(credentials)
        return new Promise(resolve => {
          release = resolve
        })
      },
    })
    const first = model.submit({ loginIdentifier: 'a', credential: 'b' })
    expect(model.current().pending).toBe(true)
    await model.submit({ loginIdentifier: 'a', credential: 'b' })
    expect(handedOver).toHaveLength(1)
    release('signed-in')
    await first
    expect(model.current()).toEqual({ mode: 'sign-in', pending: false, error: undefined })
  })
})
