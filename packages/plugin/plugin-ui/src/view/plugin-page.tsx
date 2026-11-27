import {
  BackIcon,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  ImpactPanel,
  InlineNotice,
  ListReadingRow,
  LoadingState,
  MoreIcon,
  ReadingDocument,
  ReadingToolbar,
  StatusPill,
  Switch,
} from '@omne-harness/ui-kit'
import { useEffect, useState, useSyncExternalStore, type JSX } from 'react'
import type {
  PlacedMember,
  PluginEffect,
  PluginEntry,
  PluginGovernance,
  PluginView,
  TakenBack,
} from './plugin-port.ts'

export const PLUGIN_CATEGORY = 'plugin'

type Go = (category: string, name: string) => void

type PluginPageProps = Readonly<{
  governance: PluginGovernance
  tenant: string
  pointAt: string | undefined
  go: Go
}>

/** The page of the plugins: each one's home, where it is enabled, disabled and removed whole, and its settings changed. */
export function PluginPage({
  governance,
  tenant,
  pointAt,
  go,
}: PluginPageProps): JSX.Element | null {
  const [view, setView] = useState<PluginView | null>(null)
  useEffect(() => {
    const opened = governance.open(tenant, PLUGIN_CATEGORY)
    setView(opened)
    return opened.close
  }, [governance, tenant])
  return view === null ? null : <PluginBody view={view} pointAt={pointAt} go={go} />
}

function PluginBody({
  view,
  pointAt,
  go,
}: Readonly<{ view: PluginView; pointAt: string | undefined; go: Go }>): JSX.Element {
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot)
  const [shown, setShown] = useState<string | null>(pointAt ?? null)
  useEffect(() => {
    if (pointAt !== undefined) setShown(pointAt)
  }, [pointAt])
  useEffect(() => {
    if (shown === null) return undefined
    view.openAsset(shown)
    return () => view.closeAsset(shown)
  }, [view, shown])
  if (snapshot.kind === 'reading') return <LoadingState label="正在读取 Plugin……" />
  if (snapshot.kind === 'unreadable')
    return <Notice text={snapshot.notice.text} retry={view.read} />
  const { assets } = snapshot
  if (assets.kind === 'reading') return <LoadingState label="正在读取 Plugin……" />
  if (assets.kind === 'unreadable') return <Notice text={assets.notice.text} retry={view.read} />
  const entry = shown === null ? undefined : assets.entries.find(each => each.row.name === shown)
  if (entry !== undefined)
    return <PluginReading entry={entry} view={view} go={go} onBack={() => setShown(null)} />
  if (assets.entries.length === 0) return <EmptyState title="还没有 Plugin。" />
  return (
    <ul className="plugin-view-list" aria-label="Plugin">
      {assets.entries.map(({ row }) => (
        <li key={row.name}>
          <ListReadingRow
            title={row.summary?.title ?? row.name}
            {...(row.summary !== null && { facts: row.summary.description })}
            {...(!row.enabled && { time: <StatusPill tone="neutral">已禁用</StatusPill> })}
            onSelect={() => setShown(row.name)}
          />
        </li>
      ))}
    </ul>
  )
}

function Notice({ text, retry }: Readonly<{ text: string; retry: () => void }>): JSX.Element {
  return (
    <InlineNotice tone="caution" role="alert" action={{ label: '重试', onClick: retry }}>
      <p>{text}</p>
    </InlineNotice>
  )
}

const GROUPS = [
  { title: '在界面上', holds: (member: PlacedMember) => member.side === 'client' },
  { title: '给 agent 用的', holds: (member: PlacedMember) => member.category !== null },
  {
    title: '在服务端',
    holds: (member: PlacedMember) => member.side !== 'client' && member.category === null,
  },
] as const

/** The standing a place has, in the words the page uses; one it does not know is shown as it came. */
const STANDING: Readonly<Record<string, string>> = {
  'not in effect': '没有生效',
  'not known': '还不知道',
  conflict: '撞键',
}

const kindOf = (places: readonly PlacedMember[], point: string, key: string): string =>
  places.find(place => place.point === point && place.key === key)?.categoryTitle ?? point

/** What the page can tell of what the plugin brought: still being read the first time, or told (nothing when it cannot tell). */
type Told =
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'told'; effect: PluginEffect | undefined }>

const toldOf = ({ detail }: PluginEntry): Told => {
  if (detail === null || (detail.kind === 'reading' && detail.shown === undefined))
    return { kind: 'reading' }
  if (detail.kind === 'reading') return { kind: 'told', effect: detail.shown?.effect }
  return { kind: 'told', effect: detail.kind === 'read' ? detail.asset.effect : undefined }
}

type Asking = 'disable' | 'remove' | null

function PluginReading({
  entry,
  view,
  go,
  onBack,
}: Readonly<{ entry: PluginEntry; view: PluginView; go: Go; onBack: () => void }>): JSX.Element {
  const { row, settings, action } = entry
  const title = row.summary?.title ?? row.name
  const told = toldOf(entry)
  const effect = told.kind === 'told' ? told.effect : undefined
  const [asking, setAsking] = useState<Asking>(null)
  const troubled = row.enabled && effect?.places.some(place => place.standing !== 'in effect')
  const takenBack = asking === null ? null : (effect?.[asking] ?? null)
  const Row = view.Row
  return (
    <section aria-label={title}>
      <ReadingToolbar
        name={
          <>
            Plugin<span aria-hidden="true"> › </span>
            {title}
          </>
        }
        back={
          <IconButton label="回到列表" onClick={onBack}>
            <BackIcon aria-hidden="true" />
          </IconButton>
        }
      >
        <span className="plugin-view-standing">{row.enabled ? '启用着' : '已禁用'}</span>
        <Switch
          checked={row.enabled}
          aria-label={`启用「${title}」`}
          onCheckedChange={on => (on ? view.setEnabled(row.name, true) : setAsking('disable'))}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="更多">
              <MoreIcon aria-hidden="true" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setAsking('remove')}>移除整份…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ReadingToolbar>
      <ReadingDocument>
        <h2 className="plugin-view-title">{title}</h2>
        {row.summary !== null && (
          <p className="plugin-view-description">{row.summary.description}</p>
        )}
        {(action.kind === 'refused' || action.kind === 'unknown') && (
          <InlineNotice tone="caution" role="alert">
            <p>{action.notice.text}</p>
          </InlineNotice>
        )}
        {troubled === true && (
          <InlineNotice tone="caution" role="status">
            <p>有一处没有生效，原因写在那一样下面。别的照常。</p>
          </InlineNotice>
        )}
        <h3 className="plugin-view-section">它带来了什么</h3>
        <p className="plugin-view-hint">
          一起生效，一起收回，不能单独启用或禁用；要停一个工具，把这份 Plugin 的权限设成「不允许」。
        </p>
        {told.kind === 'reading' ? (
          <LoadingState label="正在读取它带来的东西……" />
        ) : effect === undefined ? (
          <p className="plugin-view-hint">这一次说不出它带来了什么。</p>
        ) : (
          GROUPS.map(group => {
            const members = effect.places.filter(group.holds)
            return members.length === 0 ? null : (
              <div key={group.title}>
                <h4 className="plugin-view-group-title">{group.title}</h4>
                <ul className="plugin-view-members">
                  {members.map(member => (
                    <Member key={`${member.point}\n${member.key}`} member={member} go={go} />
                  ))}
                </ul>
              </div>
            )
          })
        )}
        <h3 className="plugin-view-section">设置与权限</h3>
        {settings.length === 0 ? (
          <p className="plugin-view-hint">它带来的东西都没有要设的。</p>
        ) : (
          settings.map(setting => <Row key={setting.key} rowKey={setting.key} />)
        )}
      </ReadingDocument>
      <ImpactPanel
        open={asking !== null}
        onOpenChange={open => {
          if (!open) setAsking(null)
        }}
        title={asking === 'remove' ? `移除「${title}」` : `禁用「${title}」会一起收回这些`}
        affected={
          told.kind === 'reading' ? (
            <LoadingState label="正在读取会收回什么……" />
          ) : (
            <TakenBackList lines={takenBack} places={effect?.places ?? []} />
          )
        }
        kept={
          asking === 'disable'
            ? '它的设置与权限。再启用时原样回来。正在跑的一轮不受影响，下一轮起 agent 用不到它的工具。'
            : undefined
        }
        confirmLabel={asking === 'remove' ? '移除整份' : '禁用整份'}
        cancelLabel={asking === 'remove' ? '不移除' : '不禁用'}
        tone={asking === 'remove' ? 'danger' : 'default'}
        confirmDisabled={told.kind === 'reading'}
        onConfirm={() => {
          if (asking === 'remove') view.remove(row.name)
          else view.setEnabled(row.name, false)
          setAsking(null)
        }}
      />
    </section>
  )
}

function Member({ member, go }: Readonly<{ member: PlacedMember; go: Go }>): JSX.Element {
  const { category } = member
  return (
    <li className="plugin-view-member">
      <span>{member.key}</span>
      <span className="plugin-view-member-place">{member.categoryTitle ?? member.point}</span>
      {member.standing !== 'in effect' && (
        <span className="plugin-view-member-trouble">
          <StatusPill tone="caution">{STANDING[member.standing] ?? member.standing}</StatusPill>{' '}
          {member.says}
        </span>
      )}
      {category !== null && (
        <Button variant="link" onClick={() => go(category, member.key)}>
          在「{member.categoryTitle ?? category}」里看
        </Button>
      )}
    </li>
  )
}

function TakenBackList({
  lines,
  places,
}: Readonly<{ lines: readonly TakenBack[] | null; places: readonly PlacedMember[] }>): JSX.Element {
  if (lines === null) return <p>这一次说不出会收回什么。</p>
  if (lines.length === 0) return <p>没有要收回的。</p>
  return (
    <ul className="plugin-view-taken-back">
      {lines.map(line => (
        <li key={`${line.of ?? ''}\n${line.point}\n${line.key}`}>
          {line.key}{' '}
          <span className="plugin-view-member-place">{kindOf(places, line.point, line.key)}</span>
        </li>
      ))}
    </ul>
  )
}
