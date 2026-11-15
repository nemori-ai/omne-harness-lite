import { useState, useSyncExternalStore, type FormEvent } from 'react'
import {
  Button,
  Field,
  InlineNotice,
  Input,
  PageColumn,
  PageHeader,
  Segmented,
} from '@omne-harness/ui-kit'
import type { LoginMode, LoginModel } from '../model/login.ts'

const MODES = [
  { value: 'sign-in', label: '登录' },
  { value: 'register', label: '第一次使用' },
] as const

const TITLE: Readonly<Record<LoginMode, string>> = {
  'sign-in': '登录',
  register: '注册并登录',
}

export function LoginCard(props: { model: LoginModel }) {
  const { model } = props
  const form = useSyncExternalStore(model.subscribe, model.current)
  const [loginIdentifier, setLoginIdentifier] = useState('')
  const [credential, setCredential] = useState('')

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const credentials = { loginIdentifier: loginIdentifier.trim(), credential }
    setLoginIdentifier('')
    setCredential('')
    void model.submit(credentials)
  }

  const ready = loginIdentifier.trim() !== '' && credential !== '' && !form.pending
  return (
    <PageColumn className="identity-login" aria-labelledby="identity-login-title">
      <PageHeader title={TITLE[form.mode]} titleId="identity-login-title" />
      <Segmented
        label="登录方式"
        value={form.mode}
        onValueChange={mode => model.choose(mode)}
        options={MODES}
      />
      <form className="identity-login-form" onSubmit={submit} autoComplete="off">
        <Field id="identity-login-identifier" label="登录名">
          <Input
            id="identity-login-identifier"
            name="loginIdentifier"
            value={loginIdentifier}
            onChange={event => setLoginIdentifier(event.target.value)}
            autoComplete="username"
            disabled={form.pending}
          />
        </Field>
        <Field id="identity-login-credential" label="密码">
          <Input
            id="identity-login-credential"
            name="credential"
            type="password"
            value={credential}
            onChange={event => setCredential(event.target.value)}
            autoComplete={form.mode === 'register' ? 'new-password' : 'current-password'}
            disabled={form.pending}
          />
        </Field>
        {form.error !== undefined ? (
          <InlineNotice tone="danger" role="alert" still>
            {form.error}
          </InlineNotice>
        ) : null}
        <Button type="submit" size="large" disabled={!ready}>
          {form.pending ? '请稍候……' : TITLE[form.mode]}
        </Button>
      </form>
    </PageColumn>
  )
}
