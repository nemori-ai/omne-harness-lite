import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button, ICONS, IconButton, InlineNotice, LoadingState } from '@omne-harness/ui-kit'
import { createAccountModel, type AccountModel, type AccountPorts } from '../model/account.ts'

const READING_TEXT = '正在读取当前租户……'

function Tenant(props: { model: AccountModel }) {
  const { model } = props
  const state = useSyncExternalStore(model.subscribe, model.current)
  if (state.kind === 'read')
    return (
      <p className="identity-account-tenant" title={state.tenant}>
        租户 {state.short}
      </p>
    )
  if (state.kind === 'failed')
    return (
      <InlineNotice
        tone={state.tone}
        role="status"
        action={{ label: '重试', onClick: () => model.retry() }}
        still
      >
        {state.text}
      </InlineNotice>
    )
  return <LoadingState label={READING_TEXT} />
}

/** The account block's model lives while one of its two looks is drawn: each finds the tenant on sign-in. */
function useAccountModel(ports: AccountPorts): AccountModel | undefined {
  const [model, setModel] = useState<AccountModel | undefined>(undefined)
  useEffect(() => {
    const live = createAccountModel(ports)
    setModel(live)
    return () => live.dispose()
  }, [ports])
  return model
}

export function AccountBlock(props: { ports: AccountPorts; logout: () => void }) {
  const model = useAccountModel(props.ports)
  return (
    <section className="identity-account" aria-label="账号">
      {model === undefined ? <LoadingState label={READING_TEXT} /> : <Tenant model={model} />}
      <Button variant="ghost" className="identity-account-logout" onClick={props.logout}>
        退出登录
      </Button>
    </section>
  )
}

/** The same glyph the shell draws for an account by name: a person. */
const AccountGlyph = ICONS['contact']

/** The account block on the rail: one round control that signs out; drawn alone, it still sets the tenant. */
export function AccountRail(props: { ports: AccountPorts; logout: () => void }) {
  useAccountModel(props.ports)
  return (
    <IconButton
      label="退出登录"
      tooltipSide="right"
      className="identity-account-rail"
      onClick={props.logout}
    >
      {AccountGlyph === undefined ? null : <AccountGlyph aria-hidden="true" />}
    </IconButton>
  )
}
