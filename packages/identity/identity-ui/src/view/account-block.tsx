import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button, InlineNotice, LoadingState } from '@omne-harness/ui-kit'
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
        tone="caution"
        role="status"
        action={{ label: '重试', onClick: () => model.retry() }}
        still
      >
        {state.text}
      </InlineNotice>
    )
  return <LoadingState label={READING_TEXT} />
}

export function AccountBlock(props: { ports: AccountPorts; logout: () => void }) {
  const [model, setModel] = useState<AccountModel | undefined>(undefined)
  useEffect(() => {
    const live = createAccountModel(props.ports)
    setModel(live)
    return () => live.dispose()
  }, [props.ports])
  return (
    <section className="identity-account" aria-label="账号">
      {model === undefined ? <LoadingState label={READING_TEXT} /> : <Tenant model={model} />}
      <Button variant="ghost" className="identity-account-logout" onClick={props.logout}>
        退出登录
      </Button>
    </section>
  )
}
