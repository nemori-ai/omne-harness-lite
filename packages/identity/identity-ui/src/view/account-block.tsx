import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ICONS,
  IconButton,
  InlineNotice,
  LoadingIndicator,
} from '@omne-harness/ui-kit'
import {
  createAccountModel,
  type AccountModel,
  type AccountPorts,
  type AccountState,
} from '../model/account.ts'
import { identityAccount, identityAccountControl, identityAccountRail } from '../parts.ts'

const READING_TEXT = '正在读取当前租户……'

/** The same glyph the shell draws for an account by name: a person. */
const AccountGlyph = ICONS['contact']

const glyph = AccountGlyph === undefined ? null : <AccountGlyph aria-hidden="true" />

const READING: AccountState = { kind: 'reading' }

/** Before the model is made, the block looks as it does while it reads. */
const NOT_YET: Pick<AccountModel, 'current' | 'subscribe'> = {
  current: () => READING,
  subscribe: () => () => undefined,
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

function useAccountState(model: AccountModel | undefined): AccountState {
  const source = model ?? NOT_YET
  return useSyncExternalStore(source.subscribe, source.current)
}

/** The control's hint: the tenant in full once read, the reason when it could not be read, else that it is reading. */
function hintOf(state: AccountState): string {
  if (state.kind === 'read') return state.tenant
  if (state.kind === 'failed') return state.text
  return READING_TEXT
}

function AccountMenu(props: { side: 'top' | 'right'; logout: () => void }) {
  return (
    <DropdownMenuContent side={props.side} align={props.side === 'top' ? 'start' : 'end'}>
      <DropdownMenuItem onSelect={props.logout}>退出登录</DropdownMenuItem>
    </DropdownMenuContent>
  )
}

/** The left of the sidebar foot's last row: the glyph and the organisation's short name; a notice above it grows up. */
export function AccountBlock(props: { ports: AccountPorts; logout: () => void }) {
  const model = useAccountModel(props.ports)
  const state = useAccountState(model)
  return (
    <div className="identity-account" {...identityAccount.props}>
      {state.kind === 'failed' ? (
        <InlineNotice
          tone={state.tone}
          role="status"
          action={{ label: '重试', onClick: () => model?.retry() }}
          still
        >
          {state.text}
        </InlineNotice>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            label={hintOf(state)}
            tooltipSide="top"
            size="default"
            className="identity-account-control"
            {...identityAccountControl.props}
          >
            {glyph}
            {state.kind === 'read' ? (
              <span className="identity-account-short">{state.short}</span>
            ) : state.kind === 'failed' ? null : (
              <LoadingIndicator size="sm" />
            )}
          </IconButton>
        </DropdownMenuTrigger>
        <AccountMenu side="top" logout={props.logout} />
      </DropdownMenu>
    </div>
  )
}

/** The account block on the rail: one circle with the glyph and the same menu; drawn alone, it still sets the tenant. */
export function AccountRail(props: { ports: AccountPorts; logout: () => void }) {
  const state = useAccountState(useAccountModel(props.ports))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          label={hintOf(state)}
          tooltipSide="right"
          className="identity-account-rail"
          {...identityAccountRail.props}
        >
          {glyph}
        </IconButton>
      </DropdownMenuTrigger>
      <AccountMenu side="right" logout={props.logout} />
    </DropdownMenu>
  )
}
