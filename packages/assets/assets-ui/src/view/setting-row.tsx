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
import { useId, useState, useSyncExternalStore, type ComponentType, type JSX } from 'react'
import type { CategoryGovernance } from '../model/governance.ts'
import type { SettingsDriver } from '../model/settings-driver.ts'
import type { Row } from '../model/settings-machine.ts'
import { controlOf, type ValueControl } from '../model/value-control.ts'
import { assetsSetting, assetsSettingControl } from '../parts.ts'
import { NoticeLine } from './notice.tsx'
import { Facts, hasOwn } from './setting-facts.tsx'

type RowActions = Pick<
  SettingsDriver,
  'set' | 'setValue' | 'setSecret' | 'clear' | 'confirm' | 'retryRow'
>
type Props = { readonly row: Row; readonly driver: RowActions }

export function boundRow(view: CategoryGovernance): ComponentType<{ rowKey: string }> {
  return function BoundRow({ rowKey }: { readonly rowKey: string }) {
    const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot)
    if (snapshot.kind !== 'read') return null
    const row = snapshot.holdings.flatMap(holding => holding.rows).find(item => item.key === rowKey)
    return row === undefined ? null : <RowView row={row} driver={view} />
  }
}
type Choice = Readonly<{ value: string; label: string; description?: string }>

const NO_CONTROL: ValueControl = { kind: 'none' }

function controlFor(view: SettingView): ValueControl {
  return view.kind === 'ordinary' ? controlOf(view.valueSchema) : NO_CONTROL
}

function choicesOf(view: SettingView, control: ValueControl): readonly Choice[] | null {
  if (view.kind === 'permission') return view.choices
  return control.kind === 'pick' ? control.values.map(value => ({ value, label: value })) : null
}

function ownText(view: SettingView): string | null {
  if (view.kind === 'permission') return view.own
  if (view.kind !== 'ordinary' || view.own.kind !== 'set') return null
  return view.own.value.kind === 'string' ? view.own.value.value : null
}

export function RowView({ row, driver }: Props): JSX.Element {
  const view = row.view
  const { title, purpose } = view.declaration
  const reading = row.read.kind === 'reading'
  return (
    <li className="assets-setting" data-kind={view.kind} {...assetsSetting.props}>
      <div className="assets-setting-main">
        <div className="assets-setting-head">
          <h4 className="assets-setting-title">{title}</h4>
        </div>
        <p className="assets-setting-purpose">{purpose}</p>
        {row.read.kind === 'failed' ? null : (
          <FactList aria-busy={reading}>
            <Facts view={view} />
          </FactList>
        )}
      </div>
      {row.read.kind === 'failed' ? null : (
        <div className="assets-setting-control" {...assetsSettingControl.props}>
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
  title,
  choices,
  pick,
  onPick,
  busy,
}: {
  readonly title: string
  readonly choices: readonly Choice[]
  readonly pick: string | null
  readonly onPick: (value: string) => void
  readonly busy: boolean
}): JSX.Element {
  const group = useId()
  return (
    <fieldset className="assets-setting-choices" disabled={busy}>
      <legend>{title}：挑一档</legend>
      <RadioGroup name={group} value={pick ?? ''} onValueChange={onPick} disabled={busy}>
        {choices.map(choice => (
          <label key={choice.value} className="assets-setting-choice">
            <RadioGroupItem value={choice.value} aria-label={choice.label} />
            <span className="assets-setting-choice-label">{choice.label}</span>
            {choice.description === undefined ? null : (
              <span className="assets-setting-choice-text">{choice.description}</span>
            )}
          </label>
        ))}
      </RadioGroup>
    </fieldset>
  )
}

function TextValue({
  title,
  own,
  busy,
  onSubmit,
}: {
  readonly title: string
  readonly own: string | null
  readonly busy: boolean
  readonly onSubmit: (text: string) => void
}): JSX.Element {
  const [typed, setTyped] = useState(own ?? '')
  const unchanged = typed === '' || typed === own
  return (
    <form
      className="assets-setting-value"
      onSubmit={event => {
        event.preventDefault()
        if (!busy && !unchanged) onSubmit(typed)
      }}
    >
      <Input
        aria-label={`${title}：填一个值`}
        value={typed}
        disabled={busy}
        onChange={event => setTyped(event.target.value)}
      />
      <Button type="submit" disabled={busy || unchanged}>
        设置
      </Button>
    </form>
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
  const own = ownText(view)
  const control = controlFor(view)
  const choices = choicesOf(view, control)
  const [pick, setPick] = useState<string | null>(choices === null ? null : own)
  if (view.editable.kind !== 'yes') return null
  const title = view.declaration.title
  const busy =
    row.read.kind !== 'read' || row.write.kind === 'submitting' || row.write.kind === 'unknown'
  const submitPick = (value: string) =>
    view.kind === 'permission'
      ? driver.set(row.key, value)
      : driver.setValue(row.key, { kind: 'string', value })
  return (
    <>
      {choices === null ? null : (
        <Choices title={title} choices={choices} pick={pick} onPick={setPick} busy={busy} />
      )}
      {control.kind === 'text' ? (
        <TextValue
          title={title}
          own={own}
          busy={busy}
          onSubmit={text => driver.setValue(row.key, { kind: 'string', value: text })}
        />
      ) : null}
      {view.kind === 'secret' ? (
        <SecretInput
          title={title}
          busy={busy}
          onSubmit={secret => driver.setSecret(row.key, secret)}
        />
      ) : null}
      <div className="assets-setting-actions">
        {choices === null ? null : (
          <Button
            disabled={busy || pick === null || pick === own}
            onClick={() => {
              if (pick !== null) submitPick(pick)
            }}
          >
            设置
          </Button>
        )}
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
