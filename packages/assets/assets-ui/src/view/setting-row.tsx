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
import type { JsonValue } from '@omne-harness/json-text'
import type { RenderDrawer } from '@omne-harness/shell-contract'
import {
  useContext,
  useId,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type JSX,
  type ReactNode,
} from 'react'
import type { CategoryGovernance } from '../model/governance.ts'
import type { SettingsDriver } from '../model/settings-driver.ts'
import type { Row } from '../model/settings-machine.ts'
import { assetsControl } from '../model/points.ts'
import { controlOf, valueKindOf, type ValueControl } from '../model/value-control.ts'
import { assetsSetting, assetsSettingControl } from '../parts.ts'
import { ControlDrawContext } from './control-draw.ts'
import { NoticeLine } from './notice.tsx'
import { Facts, hasOwn } from './setting-facts.tsx'

type RowActions = Pick<
  SettingsDriver,
  'set' | 'setValue' | 'setSecret' | 'clear' | 'confirm' | 'retryRow'
>
type Props = { readonly row: Row; readonly driver: RowActions }

/** The row of a setting as another module draws it: bound to its governance and to the shell that draws controls. */
export function boundRow(drawer: RenderDrawer) {
  return (view: CategoryGovernance): ComponentType<{ rowKey: string }> =>
    function BoundRow({ rowKey }: { readonly rowKey: string }) {
      const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot)
      if (snapshot.kind !== 'read') return null
      const row = snapshot.holdings
        .flatMap(holding => holding.rows)
        .find(item => item.key === rowKey)
      return row === undefined ? null : (
        <ControlDrawContext.Provider value={drawer}>
          <RowView row={row} driver={view} />
        </ControlDrawContext.Provider>
      )
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

const busyOf = (row: Row): boolean =>
  row.read.kind !== 'read' || row.write.kind === 'submitting' || row.write.kind === 'unknown'

function Actions({ row, driver, children }: Props & { readonly children: ReactNode }) {
  const view = row.view
  return (
    <>
      <div className="assets-setting-actions">
        {children}
        <Button
          variant="outline"
          disabled={busyOf(row) || !hasOwn(view)}
          onClick={() => driver.clear(row.key)}
        >
          清除
        </Button>
      </div>
      <p className="assets-setting-clear-effect">清除之后：{view.declaration.clearEffect}</p>
    </>
  )
}

/** The control of a setting: what is put on the kind of its value, or the one the row draws itself. */
function Controls({ row, driver }: Props): ReactNode {
  const drawer = useContext(ControlDrawContext)
  const view = row.view
  const [changed, setChanged] = useState<JsonValue | undefined>(undefined)
  const own = (): ReactNode => <OwnControls row={row} driver={driver} />
  if (drawer === null || view.kind !== 'ordinary' || view.editable.kind !== 'yes') return own()
  const kind = valueKindOf(view.valueSchema)
  if (kind === null) return own()
  const busy = busyOf(row)
  const subject = {
    title: view.declaration.title,
    schema: view.valueSchema,
    value: changed ?? (view.own.kind === 'set' ? view.own.value : undefined),
    disabled: busy,
    change: setChanged,
  }
  return assetsControl.draw(drawer, kind, subject, own, drawn => (
    <>
      {drawn}
      <Actions row={row} driver={driver}>
        <Button
          disabled={busy || changed === undefined}
          onClick={() => {
            if (changed !== undefined) driver.setValue(row.key, changed)
          }}
        >
          设置
        </Button>
      </Actions>
    </>
  ))
}

function OwnControls({ row, driver }: Props): JSX.Element | null {
  const view = row.view
  const own = ownText(view)
  const control = controlFor(view)
  const choices = choicesOf(view, control)
  const [pick, setPick] = useState<string | null>(choices === null ? null : own)
  if (view.editable.kind !== 'yes') return null
  const title = view.declaration.title
  const busy = busyOf(row)
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
      <Actions row={row} driver={driver}>
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
      </Actions>
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
