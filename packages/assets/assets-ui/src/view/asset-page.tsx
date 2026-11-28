import type { AssetStandingView } from '@omne-harness/assets-protocol'
import {
  BackIcon,
  CodeSurface,
  DeleteIcon,
  Disclosure,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FactList,
  FactRow,
  IconButton,
  InlineConfirm,
  InlineNotice,
  LoadingState,
  MoreIcon,
  ReadingDocument,
  ReadingToolbar,
  Section,
  StatusPill,
} from '@omne-harness/ui-kit'
import { useEffect, useRef, type JSX, type KeyboardEvent, type ReactNode } from 'react'
import type { Action, Described } from '../model/assets-machine.ts'
import type { AssetEntry, CategoryGovernance } from '../model/governance.ts'
import { plainJson } from '../model/plain-json.ts'
import type { Row } from '../model/settings-machine.ts'
import {
  assetsAsset,
  assetsAssetActions,
  assetsAssetDetail,
  assetsAssetSettings,
  assetsAssetToolbar,
} from '../parts.ts'
import { NoticeLine } from './notice.tsx'
import { RowView } from './setting-row.tsx'

type AssetPageProps = Readonly<{
  entry: AssetEntry
  view: CategoryGovernance
  label: string
  holding: ReactNode
  /** The settings items an item of `assets.holding` draws itself. */
  claimed: readonly string[]
  onBack: () => void
}>

const OFFICIAL_LINE = '官方 · 部署装的，不能禁用或移除。'

/** One asset on its own page: where it sits, its settings, what its category adds, then its details folded. */
export function AssetPage({
  entry,
  view,
  label,
  holding,
  claimed,
  onBack,
}: AssetPageProps): JSX.Element {
  const { row } = entry
  const title = row.summary?.title ?? row.name
  const back = useRef<HTMLButtonElement>(null)
  useEffect(() => back.current?.focus(), [])
  const leave = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    onBack()
  }
  return (
    <section className="assets-asset" aria-label={title} onKeyDown={leave} {...assetsAsset.props}>
      <div {...assetsAssetToolbar.props}>
        <ReadingToolbar
          name={
            <>
              {label}
              <span aria-hidden="true"> › </span>
              {title}
            </>
          }
          back={
            <IconButton ref={back} label="回到列表" onClick={onBack}>
              <BackIcon aria-hidden="true" />
            </IconButton>
          }
          {...(row.origin === 'official' && { origin: OFFICIAL_LINE })}
        >
          {row.origin === 'official' ? undefined : <AssetActions entry={entry} view={view} />}
        </ReadingToolbar>
      </div>
      <ReadingDocument>
        <h2 className="assets-asset-title">{title}</h2>
        {row.summary !== null && row.summary.description !== '' && (
          <p className="assets-asset-description">{row.summary.description}</p>
        )}
        {!row.enabled && <StatusPill tone="neutral">已禁用</StatusPill>}
        <ActionLine action={entry.action} confirm={() => view.confirmAsset(row.name)} />
        <SettingsSection rows={entry.settings} claimed={claimed} view={view} />
        <div className="assets-holding-slot">{holding}</div>
        <div {...assetsAssetDetail.props}>
          <Disclosure label="详情">
            <Detail entry={entry} view={view} />
          </Disclosure>
        </div>
      </ReadingDocument>
    </section>
  )
}

type SettingsProps = Readonly<{
  rows: readonly Row[]
  claimed: readonly string[]
  view: CategoryGovernance
}>

// The section goes when every setting of the asset is drawn by an item of `assets.holding`.
function SettingsSection({ rows, claimed, view }: SettingsProps) {
  const shown = rows.filter(row => !claimed.includes(row.view.item))
  if (rows.length > 0 && shown.length === 0) return null
  return (
    <Section id="assets-asset-settings" title="设置" {...assetsAssetSettings.props}>
      <Settings rows={shown} view={view} />
    </Section>
  )
}

function Settings({ rows, view }: Readonly<{ rows: readonly Row[]; view: CategoryGovernance }>) {
  if (rows.length === 0) return <p className="assets-asset-none">这一份没有可以改的设置。</p>
  return (
    <ul className="assets-settings-list">
      {rows.map(row => (
        <RowView key={row.key} row={row} driver={view} />
      ))}
    </ul>
  )
}

function Detail({ entry, view }: Readonly<{ entry: AssetEntry; view: CategoryGovernance }>) {
  const { detail } = entry
  const name = entry.row.name
  const asset =
    detail?.kind === 'read' ? detail.asset : detail?.kind === 'reading' ? detail.shown : undefined
  return (
    <>
      {detail?.kind === 'reading' && asset === undefined && (
        <LoadingState label="正在读取这一份……" />
      )}
      {detail?.kind === 'absent' && (
        <NoticeLine notice={{ kind: 'refused', text: '这一份已经不在了。' }} />
      )}
      {detail?.kind === 'failed' && (
        <NoticeLine
          notice={detail.notice}
          action={{ label: '重试', onClick: () => view.openAsset(name) }}
        />
      )}
      {asset !== undefined && <AssetFacts asset={asset} />}
    </>
  )
}

const FILTERED: Readonly<Record<'disabled' | 'ineligible' | 'blocked', string>> = {
  disabled: '不在用：已禁用',
  ineligible: '不在用：不合这一层的使用条件',
  blocked: '不在用：被上层挡住',
}

export function standingText(standing: AssetStandingView): string {
  switch (standing.kind) {
    case 'selected':
      return '在用'
    case 'filtered':
      return standing.by === null
        ? FILTERED[standing.reason]
        : `${FILTERED[standing.reason]}（${standing.by}）`
    case 'unavailable':
      return `不在用：${standing.layer} 这一层读不出`
  }
}

const VERSION_SHOWN = 12

/** A version as a short mark: the digest without its algorithm, cut; the whole one is in its tooltip. */
export function shortVersion(version: string): string {
  const digest = version.includes(':') ? version.slice(version.indexOf(':') + 1) : version
  return digest.slice(0, VERSION_SHOWN)
}

function AssetFacts({ asset }: Readonly<{ asset: Described }>) {
  const { item, content, standing } = asset
  return (
    <>
      <FactList>
        <FactRow term="名字">{item.name}</FactRow>
        <FactRow term="版本">
          <span title={item.version}>{shortVersion(item.version)}</span>
        </FactRow>
        <FactRow term="来源">{item.origin === 'official' ? '官方' : '本租户'}</FactRow>
        <FactRow term="现在能不能用">{standingText(standing)}</FactRow>
        {item.summary?.facts.map(fact => (
          <FactRow key={fact.name} term={fact.name}>
            {fact.text}
          </FactRow>
        ))}
      </FactList>
      {content.kind === 'data' ? (
        <CodeSurface
          name="原始定义"
          text={plainJson(content.body)}
          copy={{ label: '复制', copiedLabel: '已复制', failedLabel: '没有复制成' }}
        />
      ) : (
        <ul className="assets-detail-files" aria-label="文件">
          {content.entries.map(file => (
            <li key={file.path}>
              <span>{file.path}</span>
              <span>{`${file.bytes} 字节`}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

const busy = (action: Action): boolean => action.kind === 'submitting' || action.kind === 'unknown'

function AssetActions({ entry, view }: Readonly<{ entry: AssetEntry; view: CategoryGovernance }>) {
  const { row, action } = entry
  return (
    <div className="assets-asset-actions" {...assetsAssetActions.props}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton label="更多" disabled={busy(action)}>
            <MoreIcon aria-hidden="true" />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => view.setEnabled(row.name, !row.enabled)}>
            {row.enabled ? '禁用' : '启用'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <InlineConfirm
        tone="danger"
        confirmLabel="确认移除"
        consequence="移除不能撤销，这一份的设置也随之退出。"
        disabled={busy(action)}
        aria-label="移除"
        onConfirm={() => view.remove(row.name)}
      >
        <DeleteIcon aria-hidden="true" />
      </InlineConfirm>
    </div>
  )
}

function ActionLine({ action, confirm }: Readonly<{ action: Action; confirm: () => void }>) {
  switch (action.kind) {
    case 'none':
      return null
    case 'submitting':
      return <LoadingState label="正在提交……" />
    case 'done':
      return (
        <InlineNotice tone="good">
          <p>{action.text}</p>
        </InlineNotice>
      )
    case 'refused':
      return <NoticeLine notice={action.notice} />
    case 'unknown':
      return (
        <NoticeLine
          notice={action.notice}
          action={action.confirming ? undefined : { label: '认回', onClick: confirm }}
        />
      )
  }
}
