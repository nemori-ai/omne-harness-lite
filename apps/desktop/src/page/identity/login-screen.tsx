// The login gate's screen (RFC-0015 §10「登录」): register and sign in. Registering goes through
// the ordinary call channel (`identity/v1` `register-and-activate`), signing in through the
// bridge's `login`; the page never sees a login proof. The form is cleared as soon as the
// credentials are handed over, and every failure is said plainly.
import { useState, type FormEvent } from 'react'
import type { IdentityProtocol } from '@omne-harness/identity-protocol'
import { ClientRequestError, type ClientOf } from '@omne-harness/sdk/core'
import type { HostBridge, LoginCredentials, LoginResult } from '../../shared/host-bridge.ts'

type Mode = 'sign-in' | 'register'

export type LoginScreenProps = Readonly<{
  identity: ClientOf<IdentityProtocol>
  login: HostBridge['login']
}>

const LOGIN_TEXT: Readonly<Record<Exclude<LoginResult, 'signed-in'>, string>> = {
  'auth-failed': '登录名或密码不对。',
  unknown: '不知道登录有没有成功：没有收到可信的答复。请再试一次。',
  unavailable: '现在登录不了：服务暂时不可用。请稍后再试。',
}

/** What a register answer means to the person; `undefined` when it succeeded. */
function registerText(outcome: string): string | undefined {
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

export function LoginScreen(props: LoginScreenProps) {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [loginIdentifier, setLoginIdentifier] = useState('')
  const [credential, setCredential] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  async function signIn(credentials: LoginCredentials): Promise<void> {
    const result = await props.login(credentials)
    if (result !== 'signed-in') setError(LOGIN_TEXT[result])
  }

  async function register(credentials: LoginCredentials): Promise<void> {
    let outcome: string
    try {
      outcome = (await props.identity['register-and-activate'](credentials)).outcome
    } catch (failure) {
      if (!(failure instanceof ClientRequestError)) throw failure
      outcome = 'protocol-rejected'
    }
    const text = registerText(outcome)
    if (text !== undefined) return setError(text)
    // First use: registered, now sign in with the same credentials.
    await signIn(credentials)
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const credentials = { loginIdentifier: loginIdentifier.trim(), credential }
    // Handed over: the form keeps nothing.
    setLoginIdentifier('')
    setCredential('')
    setError(undefined)
    setPending(true)
    try {
      await (mode === 'register' ? register(credentials) : signIn(credentials))
    } finally {
      setPending(false)
    }
  }

  const ready = loginIdentifier.trim() !== '' && credential !== '' && !pending
  return (
    <section className="card login" aria-labelledby="login-title">
      <h1 id="login-title" className="card-title">
        {mode === 'register' ? '注册并登录' : '登录'}
      </h1>
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'sign-in'}
          className="tab"
          onClick={() => setMode('sign-in')}
        >
          登录
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          className="tab"
          onClick={() => setMode('register')}
        >
          第一次使用
        </button>
      </div>
      <form className="form" onSubmit={event => void submit(event)} autoComplete="off">
        <label className="field">
          <span className="field-label">登录名</span>
          <input
            name="loginIdentifier"
            value={loginIdentifier}
            onChange={event => setLoginIdentifier(event.target.value)}
            autoComplete="username"
            disabled={pending}
          />
        </label>
        <label className="field">
          <span className="field-label">密码</span>
          <input
            name="credential"
            type="password"
            value={credential}
            onChange={event => setCredential(event.target.value)}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            disabled={pending}
          />
        </label>
        {error !== undefined ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="button button-primary" disabled={!ready}>
          {pending ? '请稍候……' : mode === 'register' ? '注册并登录' : '登录'}
        </button>
      </form>
    </section>
  )
}
