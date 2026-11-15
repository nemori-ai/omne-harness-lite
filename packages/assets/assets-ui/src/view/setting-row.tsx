import type { SettingView } from '@omne-harness/assets-protocol'
import {
  Button,
  FactList,
  InlineNotice,
  Input,
  LoadingState,
  RadioGroup,
  RadioGroupItem,
} from '@omne-harness/ui-kit'
import { useId, useState, type JSX } from 'react'
import type { SettingsDriver } from '../model/settings-driver.ts'
import type { Row } from '../model/settings-machine.ts'
import { NoticeLine } from './notice.tsx'
import { Facts, hasOwn } from './setting-facts.tsx'

type Props = { readonly row: Row; readonly driver: SettingsDriver }
type Permission = Extract<SettingView, { kind: 'permission' }>

export function RowView({ row, driver }: Props): JSX.Element {
  const view = row.view
  const { title, purpose } = view.declaration
  const reading = row.read.kind === 'reading'
  return (
    <li className="assets-setting" data-kind={view.kind}>
      <div className="assets-setting-main">
        <div className="assets-setting-head">
          <h3 className="assets-setting-title">{title}</h3>
          <span className="assets-setting-asset">
            {view.asset.category}/{view.asset.name}
          </span>
        </div>
        <p className="assets-setting-purpose">{purpose}</p>
        {row.read.kind === 'failed' ? null : (
          <FactList aria-busy={reading}>
            <Facts view={view} />
          </FactList>
        )}
      </div>
      {row.read.kind === 'failed' ? null : (
        <div className="assets-setting-control">
          <Controls key={view.revision} row={row} driver={driver} />
        </div>
      )}
      <div className="assets-setting-notice">
        {row.read.kind === 'failed' ? (
          <NoticeLine
            notice={row.read.notice}
            action={{ label: '重试', onClick: () => driver.retryRow(row.key) }}
          />
        ) : null}
        {reading ? <LoadingState label="正在读取这一项……" /> : null}
        <WriteLine row={row} driver={driver} />
      </div>
    </li>
  )
}

function Choices({
  view,
  pick,
  onPick,
  busy,
}: {
  readonly view: Permission
  readonly pick: string | null
  readonly onPick: (value: string) => void
  readonly busy: boolean
}): JSX.Element {
  const group = useId()
  return (
    <fieldset className="assets-setting-choices" disabled={busy}>
      <legend>{view.declaration.title}：挑一档</legend>
      <RadioGroup name={group} value={pick ?? ''} onValueChange={onPick} disabled={busy}>
        {view.choices.map(choice => (
          <label key={choice.value} className="assets-setting-choice">
            <RadioGroupItem value={choice.value} />
            <span className="assets-setting-choice-label">{choice.label}</span>
            <span className="assets-setting-choice-text">{choice.description}</span>
          </label>
        ))}
      </RadioGroup>
    </fieldset>
  )
}

function SecretInput({
  title,
  busy,
  onSubmit,
}: {
  readonly title: string
  readonly busy: boolean
  readonly onSubmit: (secret: string) => void
}): JSX.Element {
  const [typed, setTyped] = useState('')
  return (
    <form
      className="assets-setting-secret"
      onSubmit={event => {
        event.preventDefault()
        if (busy || typed === '') return
        const secret = typed
        setTyped('')
        onSubmit(secret)
      }}
    >
      <Input
        className="assets-setting-secret-input"
        type="password"
        autoComplete="off"
        aria-label={`${title}：输入秘密`}
        value={typed}
        disabled={busy}
        onChange={event => setTyped(event.target.value)}
      />
      <Button type="submit" disabled={busy || typed === ''}>
        设置
      </Button>
    </form>
  )
}

function Controls({ row, driver }: Props): JSX.Element | null {
  const view = row.view
  const [pick, setPick] = useState<string | null>(view.kind === 'permission' ? view.own : null)
  if (view.editable.kind !== 'yes') return null
  const busy =
    row.read.kind !== 'read' || row.write.kind === 'submitting' || row.write.kind === 'unknown'
  return (
    <>
      {view.kind === 'permission' ? (
        <Choices view={view} pick={pick} onPick={setPick} busy={busy} />
      ) : null}
      {view.kind === 'secret' ? (
        <SecretInput
          title={view.declaration.title}
          busy={busy}
          onSubmit={secret => driver.setSecret(row.key, secret)}
        />
      ) : null}
      <div className="assets-setting-actions">
        {view.kind === 'permission' ? (
          <Button
            disabled={busy || pick === null || pick === view.own}
            onClick={() => {
              if (pick !== null) driver.set(row.key, pick)
            }}
          >
            设置
          </Button>
        ) : null}
        <Button
          variant="outline"
          disabled={busy || !hasOwn(view)}
          onClick={() => driver.clear(row.key)}
        >
          清除
        </Button>
      </div>
      <p className="assets-setting-clear-effect">清除之后：{view.declaration.clearEffect}</p>
    </>
  )
}

function WriteLine({ row, driver }: Props): JSX.Element | null {
  const write = row.write
  switch (write.kind) {
    case 'none':
      return null
    case 'submitting':
      return <LoadingState label="正在提交……" />
    case 'succeeded':
      return (
        <InlineNotice tone="good">
          <p>{write.change === 'written' ? '已写入。' : '和这一层原有的一样，没有变化。'}</p>
        </InlineNotice>
      )
    case 'refused':
    case 'unconfirmed':
      return <NoticeLine notice={write.notice} />
    case 'unknown':
      return (
        <NoticeLine
          notice={write.notice}
          action={
            write.confirming
              ? undefined
              : { label: '再确认一次', onClick: () => driver.confirm(row.key) }
          }
        />
      )
  }
}
