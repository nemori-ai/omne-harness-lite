import type { AssetsProtocol, SettingView } from '@omne-harness/assets-protocol'
import { writeJsonText } from '@omne-harness/json-text'
import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { useEffect, useId, useMemo, useState, useSyncExternalStore, type JSX } from 'react'
import { SettingsDriver } from '../model/settings-driver.ts'
import type { Notice, Row, State } from '../model/settings-machine.ts'

export type SettingsPanelProps = Readonly<{
  /** assets/v1 的协议客户端。外壳从客户端装配的树上取到才渲染这个组件。 */
  client: ClientOf<AssetsProtocol>
  /** 当前租户。外壳用 identity/v1 的 query-current-tenant 得到。 */
  tenant: string
}>

export function SettingsPanel(props: SettingsPanelProps): JSX.Element {
  // The same tenant text is the same tenant: a parent that renders again must not look like a
  // change of tenant, which would end the driver and read the whole list again.
  const tenant = useMemo(() => readTenantText(props.tenant), [props.tenant])
  if (tenant === undefined)
    return (
      <div className="omne-settings">
        <NoticeLine notice={{ kind: 'refused', text: '外壳给的租户读不懂，设置界面不能工作。' }} />
      </div>
    )
  return <Panel client={props.client} tenant={tenant} />
}

/** The driver lives exactly as long as the effect; a new client or tenant is a new driver. */
function Panel({
  client,
  tenant,
}: {
  readonly client: ClientOf<AssetsProtocol>
  readonly tenant: TenantId
}) {
  const [driver, setDriver] = useState<SettingsDriver | null>(null)
  useEffect(() => {
    const created = new SettingsDriver({ client, tenant })
    setDriver(created)
    created.readList()
    return () => created.dispose()
  }, [client, tenant])
  return driver === null ? <div className="omne-settings" /> : <Settings driver={driver} />
}

function Settings({ driver }: { readonly driver: SettingsDriver }) {
  const state = useSyncExternalStore(driver.subscribe, driver.getState)
  return (
    <div className="omne-settings">
      <header className="omne-settings-bar">
        <h2 className="omne-settings-title">设置</h2>
        <span className="omne-settings-scope">这一层：当前租户</span>
      </header>
      <Body state={state} driver={driver} />
    </div>
  )
}

function NoticeLine({
  notice,
  action,
}: {
  readonly notice: Notice
  readonly action?: JSX.Element | undefined
}) {
  return (
    <p
      className="omne-settings-notice"
      data-kind={notice.kind}
      role={notice.kind === 'unknown' ? 'status' : 'alert'}
    >
      <span>{notice.text}</span>
      {action ?? null}
    </p>
  )
}

function LinkButton({ label, onClick }: { readonly label: string; readonly onClick: () => void }) {
  return (
    <button type="button" className="omne-settings-link" onClick={onClick}>
      {label}
    </button>
  )
}

function Body({ state, driver }: { readonly state: State; readonly driver: SettingsDriver }) {
  const list = state.list
  switch (list.kind) {
    case 'unread':
    case 'reading':
      return <p className="omne-settings-empty">正在读取设置……</p>
    case 'failed':
      return (
        <NoticeLine
          notice={list.notice}
          action={<LinkButton label="重试" onClick={() => driver.readList()} />}
        />
      )
    case 'read':
      return (
        <>
          {list.partial ? (
            <NoticeLine
              notice={{ kind: 'unavailable', text: '列表不全：有的来源暂时读不出，这里没有列全。' }}
            />
          ) : null}
          {list.rows.length === 0 ? (
            <p className="omne-settings-empty">这一层没有可以配置的设置项。</p>
          ) : (
            <ul className="omne-settings-list">
              {list.rows.map(row => (
                <RowView key={row.key} row={row} driver={driver} />
              ))}
            </ul>
          )}
        </>
      )
  }
}

const LAYER: Readonly<Record<'default' | 'organization' | 'tenant', string>> = {
  default: '默认',
  organization: '组织',
  tenant: '租户（这一层）',
}

const NOT_EDITABLE: Readonly<Record<'locked' | 'not-a-source' | 'prohibited-above', string>> = {
  locked: '被上层锁定',
  'not-a-source': '这一层不能配这一项',
  'prohibited-above': '上层已经主动禁止',
}

const SECRET: Readonly<Record<'unset' | 'available' | 'revoked' | 'unreadable', string>> = {
  unset: '未配置',
  available: '可用',
  revoked: '已撤销',
  unreadable: '读不出',
}

function RowView({ row, driver }: { readonly row: Row; readonly driver: SettingsDriver }) {
  const view = row.view
  const { title, purpose, appliesAt } = view.declaration
  return (
    <li className="omne-setting" data-kind={view.kind}>
      <header className="omne-setting-head">
        <h3 className="omne-setting-title">{title}</h3>
        <span className="omne-setting-asset">
          {view.asset.category}/{view.asset.name}
        </span>
      </header>
      <p className="omne-setting-purpose">{purpose}</p>
      {row.read.kind === 'failed' ? (
        <NoticeLine
          notice={row.read.notice}
          action={<LinkButton label="重试" onClick={() => driver.retryRow(row.key)} />}
        />
      ) : (
        <>
          <dl className="omne-setting-facts" data-reading={row.read.kind === 'reading'}>
            <Facts view={view} />
            <dt>何时生效</dt>
            <dd>{appliesAt}</dd>
            <dt>能不能改</dt>
            <dd>
              {view.editable.kind === 'yes'
                ? '能改'
                : `不能改：${NOT_EDITABLE[view.editable.reason]}`}
            </dd>
          </dl>
          {row.read.kind === 'reading' ? (
            <p className="omne-setting-status" role="status">
              正在读取这一项……
            </p>
          ) : null}
          {/* A new revision is a new view: the pick starts again from what the server holds. */}
          <Controls key={view.revision} row={row} driver={driver} />
          <WriteLine row={row} driver={driver} />
        </>
      )}
    </li>
  )
}

function Facts({ view }: { readonly view: SettingView }) {
  switch (view.kind) {
    case 'permission': {
      const label = (value: string) =>
        view.choices.find(choice => choice.value === value)?.label ?? value
      const effective = view.effective
      return (
        <>
          <dt>生效的值</dt>
          <dd>
            {effective.kind === 'value'
              ? label(effective.value)
              : effective.kind === 'prohibited'
                ? `被${effective.by === 'organization' ? '组织' : '租户'}主动禁止`
                : '上层允许的档位是空的，什么都不允许'}
          </dd>
          <dt>来源</dt>
          <dd>
            {effective.kind === 'value'
              ? LAYER[effective.source]
              : effective.kind === 'prohibited'
                ? LAYER[effective.by]
                : '上层的锁'}
          </dd>
          <dt>这一层的挑选</dt>
          <dd>{view.own === null ? '没有挑选' : label(view.own)}</dd>
          {view.bound === null ? null : (
            <>
              <dt>上层只允许</dt>
              <dd>{view.bound.length === 0 ? '无' : view.bound.map(label).join('、')}</dd>
            </>
          )}
        </>
      )
    }
    case 'ordinary':
      return (
        <>
          <dt>生效的值</dt>
          <dd>
            {view.effective.value.kind === 'set' ? (
              <code>{writeJsonText(view.effective.value.value)}</code>
            ) : (
              '没有值'
            )}
          </dd>
          <dt>来源</dt>
          <dd>
            {view.effective.source === null ? '没有哪一层给值' : LAYER[view.effective.source]}
          </dd>
          <dt>这一层的值</dt>
          <dd>
            {view.own.kind === 'set' ? <code>{writeJsonText(view.own.value)}</code> : '未设置'}
          </dd>
        </>
      )
    case 'secret':
      return (
        <>
          <dt>这一层的秘密</dt>
          <dd>{SECRET[view.own]}</dd>
          <dt>部署层的秘密</dt>
          <dd>{SECRET[view.official]}</dd>
        </>
      )
  }
}

/** Whether this layer holds something a clear would take away. */
function hasOwn(view: SettingView): boolean {
  switch (view.kind) {
    case 'permission':
      return view.own !== null
    case 'ordinary':
      return view.own.kind === 'set'
    case 'secret':
      return view.own !== 'unset'
  }
}

function Controls({ row, driver }: { readonly row: Row; readonly driver: SettingsDriver }) {
  const view = row.view
  const [pick, setPick] = useState<string | null>(view.kind === 'permission' ? view.own : null)
  const group = useId()
  if (view.editable.kind !== 'yes') return null
  const busy =
    row.read.kind !== 'read' || row.write.kind === 'submitting' || row.write.kind === 'unknown'
  return (
    <div className="omne-setting-controls">
      {view.kind === 'permission' ? (
        <fieldset className="omne-setting-choices" disabled={busy}>
          <legend>{view.declaration.title}：挑一档</legend>
          {view.choices.map(choice => (
            <label key={choice.value} className="omne-setting-choice">
              <input
                type="radio"
                name={group}
                value={choice.value}
                checked={pick === choice.value}
                onChange={() => setPick(choice.value)}
              />
              <span className="omne-setting-choice-label">{choice.label}</span>
              <span className="omne-setting-choice-text">{choice.description}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <div className="omne-setting-actions">
        {view.kind === 'permission' ? (
          <button
            type="button"
            className="omne-settings-button"
            data-tone="primary"
            disabled={busy || pick === null || pick === view.own}
            onClick={() => {
              if (pick !== null) driver.set(row.key, pick)
            }}
          >
            设置
          </button>
        ) : null}
        <button
          type="button"
          className="omne-settings-button"
          disabled={busy || !hasOwn(view)}
          title={view.declaration.clearEffect}
          onClick={() => driver.clear(row.key)}
        >
          清除
        </button>
        <span className="omne-setting-clear-effect">清除之后：{view.declaration.clearEffect}</span>
      </div>
    </div>
  )
}

function WriteLine({ row, driver }: { readonly row: Row; readonly driver: SettingsDriver }) {
  const write = row.write
  switch (write.kind) {
    case 'none':
      return null
    case 'submitting':
      return (
        <p className="omne-setting-status" role="status">
          正在提交……
        </p>
      )
    case 'succeeded':
      return (
        <p className="omne-setting-status" role="status">
          {write.change === 'written' ? '已写入。' : '和这一层原有的一样，没有变化。'}
        </p>
      )
    case 'refused':
      return <NoticeLine notice={write.notice} />
    case 'unknown':
      return (
        <NoticeLine
          notice={write.notice}
          action={
            write.confirming ? undefined : (
              <LinkButton label="再确认一次" onClick={() => driver.confirm(row.key)} />
            )
          }
        />
      )
  }
}
