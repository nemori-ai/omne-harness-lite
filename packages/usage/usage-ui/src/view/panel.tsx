import type { AttachedEntry, PointHost } from '@omne-harness/shell-contract'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  MoreIcon,
  Segmented,
  type SegmentedOption,
} from '@omne-harness/ui-kit'
import { Component, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  addTo,
  arrange,
  type Arranged,
  layoutOf,
  moveAt,
  presentAt,
  removeAt,
  resizeAt,
  WIDTHS,
  type Layout,
  type Layouts,
  type Position,
  type Shape,
  type Width,
} from '../model/layout.ts'
import { RANGE_LABELS, RANGES, type RangeChoice } from '../model/range.ts'
import { usageCard, usagePanel, usagePanelBar, usagePanelMenu } from '../parts.ts'
import { usagePresentation, usageWidget, type WidgetSubject } from '../points.ts'
import { ItemContext, PanelContext, type ItemValue } from './present.tsx'
import type { UsageReads } from './reads.ts'

import type { LayoutStore } from '../model/stored.ts'

export type { LayoutStore }

export type PanelSources = Readonly<{
  module: Layouts
  assembly?: Layouts | undefined
  store: LayoutStore
}>

class CardBoundary extends Component<
  { readonly children: ReactNode },
  { readonly failed: boolean }
> {
  override state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  override render(): ReactNode {
    return this.state.failed ? (
      <p className="usage-card-note" role="alert">
        这张卡片出错了，别的卡片不受影响。
      </p>
    ) : (
      this.props.children
    )
  }
}

const RANGE_OPTIONS: readonly SegmentedOption<RangeChoice>[] = RANGES.map(value => ({
  value,
  label: RANGE_LABELS[value],
}))
const WIDTH_LABELS: Readonly<Record<Width, string>> = { 1: '窄', 2: '中', 3: '宽' }
const NO_ITEM: ItemValue = { presentation: null, report: () => undefined }

function PresentationChoice({
  shell,
  shape,
  value,
  onChange,
}: {
  readonly shell: PointHost
  readonly shape: Shape
  readonly value: string | null
  readonly onChange: (presentation: string | null) => void
}): ReactNode {
  return usagePresentation.slot(shell, shape, {}, entries => (
    <label className="usage-edit-field">
      画法
      <select
        value={value ?? ''}
        onChange={event => onChange(event.target.value === '' ? null : event.target.value)}
      >
        <option value="">缺省</option>
        {entries.map(entry => (
          <option key={entry.id} value={entry.id}>
            {entry.label ?? entry.id}
          </option>
        ))}
      </select>
    </label>
  ))
}

type Edit = (next: Layout | undefined) => void

function CardSlot({
  shell,
  layout,
  placed,
  entry,
  shape,
  item,
  editing,
  save,
}: {
  readonly shell: PointHost
  readonly layout: Layout
  readonly placed: Arranged
  readonly entry: AttachedEntry | undefined
  readonly shape: Shape | undefined
  readonly item: ItemValue
  readonly editing: boolean
  readonly save: Edit
}): ReactNode {
  const { index } = placed
  const missing = entry === undefined
  return (
    <article
      className="usage-card"
      {...usageCard.props}
      data-width={placed.item.width}
      data-widget={placed.item.widget}
    >
      {missing ? (
        <p className="usage-card-note">这张卡片不可用：带来它的模块不在了。</p>
      ) : (
        <ItemContext.Provider value={item}>
          <CardBoundary>{entry.node}</CardBoundary>
        </ItemContext.Provider>
      )}
      {editing || missing ? (
        <div
          className="usage-edit"
          role="group"
          aria-label={`编辑「${entry?.label ?? placed.item.widget}」`}
        >
          {editing ? (
            <>
              <Button
                variant="ghost"
                disabled={index === 0}
                onClick={() => save(moveAt(layout, index, -1))}
              >
                上移
              </Button>
              <Button
                variant="ghost"
                disabled={index === layout.length - 1}
                onClick={() => save(moveAt(layout, index, 1))}
              >
                下移
              </Button>
              <label className="usage-edit-field">
                宽度
                <select
                  value={placed.item.width}
                  onChange={event =>
                    save(resizeAt(layout, index, Number(event.target.value) as Width))
                  }
                >
                  {WIDTHS.map(width => (
                    <option key={width} value={width}>
                      {WIDTH_LABELS[width]}
                    </option>
                  ))}
                </select>
              </label>
              {shape === undefined ? null : (
                <PresentationChoice
                  shell={shell}
                  shape={shape}
                  value={placed.item.presentation}
                  onChange={value => save(presentAt(layout, index, value))}
                />
              )}
            </>
          ) : null}
          <Button variant="ghost" onClick={() => save(removeAt(layout, index))}>
            去掉
          </Button>
        </div>
      ) : null}
    </article>
  )
}

function EditBar({
  layout,
  absent,
  save,
}: {
  readonly layout: Layout
  readonly absent: readonly AttachedEntry[]
  readonly save: Edit
}): ReactNode {
  return (
    <footer className="usage-edit-bar">
      <label className="usage-edit-field">
        加一张卡片
        <select
          value=""
          onChange={event => event.target.value !== '' && save(addTo(layout, event.target.value))}
        >
          <option value="">选一张</option>
          {absent.map(entry => (
            <option key={entry.id} value={entry.id}>
              {entry.label ?? entry.id}
            </option>
          ))}
        </select>
      </label>
      <Button variant="ghost" onClick={() => save(undefined)}>
        恢复缺省
      </Button>
    </footer>
  )
}

/** The occasional actions at the top of a panel, behind one `⋯` (A2): editing the panel, and reading it again. */
function PanelMenu({
  editing,
  onEdit,
  onRefresh,
}: {
  readonly editing: boolean
  readonly onEdit: () => void
  readonly onRefresh: () => void
}): ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label="更多操作" tooltipSide="bottom" {...usagePanelMenu.props}>
          <MoreIcon aria-hidden="true" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>{editing ? '完成' : '编辑面板'}</DropdownMenuItem>
        <DropdownMenuItem onSelect={onRefresh}>刷新</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Panel({
  shell,
  reads,
  tenant,
  position,
  session,
  sources,
}: {
  readonly shell: PointHost
  readonly reads: UsageReads
  readonly tenant: string
  readonly position: Position
  readonly session: string | null
  readonly sources: PanelSources
}): ReactNode {
  const [range, setRange] = useState<RangeChoice>('week')
  const [user, setUser] = useState<Layouts>(() => sources.store.read())
  const [editing, setEditing] = useState(false)
  const [shapes, setShapes] = useState<Readonly<Record<number, Shape>>>({})
  const layout = layoutOf(position, { module: sources.module, assembly: sources.assembly, user })
  const subject: WidgetSubject = useMemo(() => ({ session, range }), [session, range])
  const panel = useMemo(() => ({ shell, reads, tenant }), [shell, reads, tenant])
  const save: Edit = next => {
    const { [position]: _dropped, ...rest } = user
    const layouts: Layouts = next === undefined ? rest : { ...rest, [position]: next }
    setUser(layouts)
    sources.store.write(layouts)
  }
  const items = useMemo(
    () =>
      layout.map((item, index) => ({
        presentation: item.presentation,
        report: (shape: Shape) =>
          setShapes(known => (known[index] === shape ? known : { ...known, [index]: shape })),
      })),
    [layout],
  )
  return (
    <PanelContext.Provider value={panel}>
      <section
        className="usage-panel"
        {...usagePanel.props}
        data-position={position}
        data-editing={editing}
      >
        {position === 'status' ? null : (
          <header className="usage-panel-bar" {...usagePanelBar.props}>
            <Segmented
              label="时间段"
              value={range}
              onValueChange={setRange}
              options={RANGE_OPTIONS}
            />
            <PanelMenu
              editing={editing}
              onEdit={() => setEditing(on => !on)}
              onRefresh={() => reads.refresh()}
            />
          </header>
        )}
        {usageWidget.slot(shell, position, subject, entries => {
          const byId = new Map(entries.map(entry => [entry.id, entry]))
          return (
            <>
              <div className="usage-grid">
                {arrange(layout, new Set(byId.keys())).map(placed => (
                  <CardSlot
                    key={`${placed.index}:${placed.item.widget}`}
                    shell={shell}
                    layout={layout}
                    placed={placed}
                    entry={byId.get(placed.item.widget)}
                    shape={shapes[placed.index]}
                    item={items[placed.index] ?? NO_ITEM}
                    editing={editing}
                    save={save}
                  />
                ))}
              </div>
              {editing ? (
                <EditBar
                  layout={layout}
                  absent={entries.filter(entry => !layout.some(item => item.widget === entry.id))}
                  save={save}
                />
              ) : null}
            </>
          )
        })}
      </section>
    </PanelContext.Provider>
  )
}

/** Reads again at the interval the assembly gives, while the page is visible. */
export function useRefreshEvery(reads: UsageReads, every: number | undefined): void {
  useEffect(() => {
    if (every === undefined) return undefined
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') reads.refresh()
    }, every)
    return () => clearInterval(timer)
  }, [reads, every])
}
