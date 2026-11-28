import { Button, Disclosure, Field, InlineNotice, Input, Segmented } from '@omne-harness/ui-kit'
import { useEffect, useId, useState, useSyncExternalStore, type JSX } from 'react'
import {
  advance,
  bodyOf,
  ITEM_LABEL,
  placingsOf,
  problemsOf,
  type Auth,
  type Entered,
  type Phase,
} from './create-steps.ts'
import { MCP_CATEGORY } from './mcp-page.tsx'
import { mcpCreate } from './parts.ts'
import type { McpGovernance, McpSnapshot, McpView } from './port.ts'

const AUTHS = [
  { value: 'none', label: '不用' },
  { value: 'static', label: '密钥' },
  { value: 'oauth', label: 'OAuth 登录' },
] as const

const EMPTY: Entered = {
  name: '',
  target: '',
  auth: 'none',
  key: '',
  clientId: '',
  clientSecret: '',
}
const EDITING: Phase = { kind: 'editing' }

export type McpCreateFormProps = Readonly<{ governance: McpGovernance; tenant: string }>

/** The 新建 of an MCP endpoint: name, address and how it signs in, at once; the address and the key are written right after it is made. */
export function McpCreateForm({ governance, tenant }: McpCreateFormProps): JSX.Element | null {
  const [view, setView] = useState<McpView | null>(null)
  useEffect(() => {
    const opened = governance.open(tenant, MCP_CATEGORY)
    setView(opened)
    return opened.close
  }, [governance, tenant])
  return view === null ? null : <CreateBody view={view} />
}

const listedIn = (snapshot: McpSnapshot) => (name: string) =>
  snapshot.kind === 'read' && snapshot.holdings.some(each => each.name === name)

function CreateBody({ view }: { readonly view: McpView }): JSX.Element {
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot)
  const [entered, setEntered] = useState<Entered>(EMPTY)
  const [phase, setPhase] = useState<Phase>(EDITING)
  const [checked, setChecked] = useState(false)
  const id = useId()
  useEffect(() => {
    const next = advance(phase, snapshot)
    if (next.act !== undefined) {
      const { key, placing } = next.act
      if (placing.secret) view.setSecret(key, placing.value)
      else view.setValue(key, { kind: 'string', value: placing.value })
    }
    if (next.phase !== phase) setPhase(next.phase)
    if (next.phase.kind === 'placed' && phase.kind !== 'placed') setEntered(EMPTY)
  }, [phase, snapshot, view])
  const busy = phase.kind === 'creating' || phase.kind === 'placing'
  const problems = problemsOf(entered, listedIn(snapshot))
  const set = (field: keyof Entered) => (value: string) =>
    setEntered(before => ({ ...before, [field]: value }))
  const submit = (): void => {
    if (busy || snapshot.kind !== 'read') return
    setChecked(true)
    if (problems.name !== undefined || problems.target !== undefined) return
    const name = entered.name.trim()
    view.createFromData(name, bodyOf(entered))
    setPhase({ kind: 'creating', name, placings: placingsOf(entered), before: snapshot.creating })
  }
  return (
    <form
      className="mcp-create"
      aria-label="新建 MCP 接入点"
      {...mcpCreate.props}
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      <Field
        id={`${id}-name`}
        label="名字（必填）"
        hint={
          (checked ? problems.name : undefined) ?? '小写字母、数字和短横。agent 用这个名字叫它。'
        }
      >
        <Input
          id={`${id}-name`}
          className="mcp-create-mono"
          value={entered.name}
          autoComplete="off"
          aria-invalid={checked && problems.name !== undefined}
          onChange={event => set('name')(event.target.value)}
        />
      </Field>
      <Field
        id={`${id}-target`}
        label="地址（必填）"
        hint={(checked ? problems.target : undefined) ?? '服务的 MCP 地址，一般以 /mcp 结尾。'}
      >
        <Input
          id={`${id}-target`}
          className="mcp-create-mono"
          value={entered.target}
          autoComplete="off"
          placeholder="https://"
          aria-invalid={checked && problems.target !== undefined}
          onChange={event => set('target')(event.target.value)}
        />
      </Field>
      <div className="mcp-create-auth">
        <span className="mcp-create-label">认证</span>
        <Segmented
          label="认证"
          value={entered.auth}
          options={AUTHS}
          onValueChange={value => set('auth')(value as Auth)}
        />
      </div>
      <AuthFields id={id} entered={entered} set={set} />
      <div className="mcp-create-actions">
        <Button type="submit" disabled={busy}>
          添加
        </Button>
      </div>
      <PhaseLine phase={phase} snapshot={snapshot} confirm={view.confirmCreate} />
    </form>
  )
}

function AuthFields({
  id,
  entered,
  set,
}: {
  readonly id: string
  readonly entered: Entered
  readonly set: (field: keyof Entered) => (value: string) => void
}): JSX.Element | null {
  if (entered.auth === 'none')
    return <p className="mcp-create-hint">对方不要求登录，例如 DeepWiki。</p>
  if (entered.auth === 'static')
    return (
      <Field id={`${id}-key`} label="密钥" hint="只存进秘密保管，界面、日志和 agent 都看不到它。">
        <Input
          id={`${id}-key`}
          type="password"
          autoComplete="off"
          value={entered.key}
          onChange={event => set('key')(event.target.value)}
        />
      </Field>
    )
  return (
    <>
      <p className="mcp-create-hint">
        建好之后在下面它那一段点「连接」，在浏览器里同意一次，过期了会自己续。
      </p>
      <Disclosure
        label="对方要求先登记一个应用？（例如 GitHub）"
        contentClassName="mcp-create-register"
      >
        <p className="mcp-create-hint">
          在对方那里登记一个应用，回跳地址在建好之后它那一段里写着；登记得到的标识填在这里。
        </p>
        <Field id={`${id}-client`} label="客户端标识">
          <Input
            id={`${id}-client`}
            className="mcp-create-mono"
            autoComplete="off"
            value={entered.clientId}
            onChange={event => set('clientId')(event.target.value)}
          />
        </Field>
        <Field id={`${id}-client-secret`} label="客户端密钥（对方给了才填）">
          <Input
            id={`${id}-client-secret`}
            type="password"
            autoComplete="off"
            value={entered.clientSecret}
            onChange={event => set('clientSecret')(event.target.value)}
          />
        </Field>
      </Disclosure>
    </>
  )
}

function PhaseLine({
  phase,
  snapshot,
  confirm,
}: {
  readonly phase: Phase
  readonly snapshot: McpSnapshot
  readonly confirm: () => void
}): JSX.Element | null {
  const creating = snapshot.kind === 'read' ? snapshot.creating : undefined
  switch (phase.kind) {
    case 'editing':
      return phase.notice === undefined ? null : (
        <InlineNotice tone="danger" role="alert">
          <p>{phase.notice.text}</p>
        </InlineNotice>
      )
    case 'creating':
      return creating?.kind === 'unknown' && creating !== phase.before ? (
        <InlineNotice
          tone="neutral"
          role="status"
          {...(creating.confirming ? {} : { action: { label: '再确认一次', onClick: confirm } })}
        >
          <p>{creating.notice.text}</p>
        </InlineNotice>
      ) : (
        <p className="mcp-create-progress" role="status">{`正在加 ${phase.name}……`}</p>
      )
    case 'placing':
      return <p className="mcp-create-progress" role="status">{`正在设 ${phase.name} 的地址……`}</p>
    case 'placed':
      return (
        <p
          className="mcp-create-receipt"
          role="status"
        >{`已加上 ${phase.name}。它在下面，连上之后列出它的动作。`}</p>
      )
    case 'stopped':
      return (
        <InlineNotice tone="danger" role="alert">
          <p>{`${phase.name} 已经加上，${ITEM_LABEL[phase.item] ?? phase.item}没设上：${phase.notice.text} 在下面 ${phase.name} 那一段里改。`}</p>
        </InlineNotice>
      )
  }
}
