import {
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import type { PageItem, SidebarItem } from '@omne-harness/shell-contract'
import {
  ActionTooltip,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FigureSeat,
  FoldIcon,
  GlideMenu,
  ICONS,
  IconButton,
  LoadingState,
  MenuIcon,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnknownIcon,
  ViewIcon,
  type ResolvedTheme,
  type SizeController,
  type SizeTier,
  type ThemeChoice,
} from '@omne-harness/ui-kit'
import type { Connectivity } from '../connectivity.ts'
import { useSlot, useWatched } from './hooks.ts'
import { Item } from './item.tsx'
import { useSidebarFoldMotion, type SidebarWidth } from './sidebar-motion.ts'
import type { ShellState } from './state.ts'

export type ThemeSwitch = {
  readonly initial: ThemeChoice
  select(choice: ThemeChoice): ResolvedTheme
}

export type SizeSwitch = Pick<SizeController, 'current' | 'set' | 'subscribe'>

export const RECONNECTING_TEXT = '连不上服务。正在重连……'

const THEMES: readonly (readonly [ThemeChoice, string])[] = [
  ['light', '浅色'],
  ['dark', '深色'],
  ['system', '跟随系统'],
]

const SIZES: readonly (readonly [SizeTier, string])[] = [
  ['small', '小楷'],
  ['medium', '中楷'],
  ['large', '大楷'],
  ['reading', '老花'],
]

export type SidebarProps = Readonly<{
  appName: string
  state: ShellState
  connectivity: Connectivity
  theme: ThemeSwitch
  size: SizeSwitch
  pages: readonly PageItem[]
  shown: string | undefined
  /** The page the home goes to: the one waiting for an answer, or the earliest. */
  homePage: string | undefined
}>

type Segment = 'primary' | 'utility'

const segmentOf = (item: { readonly group?: Segment | undefined }): Segment =>
  item.group ?? 'primary'

/** A cropped row's name, and only then: a labelled row gets no floating copy of its own name. */
function RowHint(props: { expanded: boolean; label: string; children: ReactNode }) {
  return (
    <Tooltip {...(props.expanded ? { open: false } : {})}>
      <TooltipTrigger asChild>{props.children}</TooltipTrigger>
      {props.expanded ? null : (
        <TooltipContent side="right" sideOffset={4} className="omne-action-tooltip">
          {props.label}
        </TooltipContent>
      )}
    </Tooltip>
  )
}

/** Pages are not addresses: pressing a link to a page chooses the page here instead of following the link. */
function follow(choose: (id: string) => void, id: string | undefined) {
  return (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault()
    if (id !== undefined) choose(id)
  }
}

const hrefOf = (id: string | undefined): string | undefined =>
  id === undefined ? undefined : `#${id}`

/** The figure's home: its seat and nothing written beside it; the app's name is its name and its hint. */
function Home(props: {
  appName: string
  selected: boolean
  page: string | undefined
  choose: (id: string) => void
}) {
  return (
    <ActionTooltip label={props.appName} side="right">
      <a
        href={hrefOf(props.page)}
        className="shell-home"
        data-control="row"
        data-selected={props.selected}
        aria-current={props.selected ? 'page' : undefined}
        aria-label={props.appName}
        draggable={false}
        onClick={follow(props.choose, props.page)}
      >
        <FigureSeat name="home" className="shell-home-seat" />
      </a>
    </ActionTooltip>
  )
}

function PageRow(props: {
  page: PageItem
  scope: string | undefined
  selected: boolean
  expanded: boolean
  choose: (id: string) => void
}) {
  const { page, scope } = props
  const Icon = ICONS[page.icon] ?? UnknownIcon
  const { badge } = page
  return (
    <RowHint expanded={props.expanded} label={page.title}>
      <a
        href={hrefOf(page.id)}
        className={props.selected ? 'shell-nav-link active' : 'shell-nav-link'}
        data-glide-row=""
        data-control="row"
        data-selected={props.selected}
        aria-current={props.selected ? 'page' : undefined}
        data-page={page.id}
        draggable={false}
        onClick={follow(props.choose, page.id)}
      >
        <Icon aria-hidden="true" />
        <span className="shell-link-label">{page.title}</span>
        {badge === undefined ? null : (
          <span className="shell-nav-badge">
            <Item quiet scope={scope} render={() => badge({ scope })} />
          </span>
        )}
      </a>
    </RowHint>
  )
}

function PageRows(props: {
  label: string
  pages: readonly PageItem[]
  scope: string | undefined
  shown: string | undefined
  expanded: boolean
  choose: (id: string) => void
}) {
  return (
    <nav className="shell-nav" aria-label={props.label}>
      <GlideMenu className="shell-nav-rows">
        {props.pages.map(page => (
          <PageRow
            key={page.id}
            page={page}
            scope={props.scope}
            selected={page.id === props.shown}
            expanded={props.expanded}
            choose={props.choose}
          />
        ))}
      </GlideMenu>
    </nav>
  )
}

/** One item of the sidebar slot: its own rendering while labelled, its rail one on the rail, none if it gave none. */
function SidebarEntry(props: { item: SidebarItem; scope: string | undefined; expanded: boolean }) {
  const { item, scope, expanded } = props
  const { rail } = item
  if (!expanded && rail === undefined) return null
  return (
    <div className="shell-sidebar-item" data-item={item.id} data-rail={expanded ? undefined : ''}>
      <Item
        key={expanded ? 'labelled' : 'rail'}
        scope={scope}
        render={() => (expanded || rail === undefined ? item.render({ scope }) : rail({ scope }))}
      />
    </div>
  )
}

function Appearance(props: { theme: ThemeSwitch; size: SizeSwitch; expanded: boolean }) {
  const [choice, setChoice] = useState(props.theme.initial)
  const { size } = props
  const tier = useSyncExternalStore(
    listener => size.subscribe(() => listener()),
    () => size.current(),
  )
  return (
    <DropdownMenu>
      <RowHint expanded={props.expanded} label="外观">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="shell-utility-button" data-appearance="">
            <ViewIcon aria-hidden="true" />
            <span className="shell-link-label">外观</span>
          </Button>
        </DropdownMenuTrigger>
      </RowHint>
      <DropdownMenuContent side="top" align="start">
        <DropdownMenuLabel>主题</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={choice}
          onValueChange={value => {
            const next = THEMES.find(([name]) => name === value)?.[0]
            if (next === undefined) return
            props.theme.select(next)
            setChoice(next)
          }}
        >
          {THEMES.map(([name, label]) => (
            <DropdownMenuRadioItem key={name} value={name}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>字号</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={tier}
          onValueChange={value => {
            const next = SIZES.find(([name]) => name === value)?.[0]
            if (next !== undefined) size.set(next)
          }}
        >
          {SIZES.map(([name, label]) => (
            <DropdownMenuRadioItem key={name} value={name}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Reconnecting(props: { connectivity: Connectivity }) {
  if (props.connectivity !== 'disconnected') return null
  return <LoadingState className="shell-reconnecting" label={RECONNECTING_TEXT} />
}

function SidebarBody(props: SidebarProps & { expanded: boolean; choose: (id: string) => void }) {
  const { state, pages, expanded } = props
  const items = useSlot(state.slots, 'sidebar')
  const scope = useWatched(state.scope)
  const rest = pages.slice(1)
  const primary = rest.filter(page => segmentOf(page) === 'primary')
  const utility = rest.filter(page => segmentOf(page) === 'utility')
  const entries = (segment: Segment) =>
    items
      .filter(item => segmentOf(item) === segment)
      .map(item => <SidebarEntry key={item.id} item={item} scope={scope} expanded={expanded} />)
  const rows = (label: string, list: readonly PageItem[]) => (
    <PageRows
      label={label}
      pages={list}
      scope={scope}
      shown={props.shown}
      expanded={expanded}
      choose={props.choose}
    />
  )
  return (
    <div className="shell-navigation-content" data-expanded={expanded ? 'true' : 'false'}>
      <Reconnecting connectivity={props.connectivity} />
      <div className="shell-navigation-main">
        {rows('页面', primary)}
        {entries('primary')}
      </div>
      <div className="shell-secondary">
        {utility.length === 0 ? null : rows('次要页面', utility)}
        <Appearance theme={props.theme} size={props.size} expanded={expanded} />
        {entries('utility')}
      </div>
    </div>
  )
}

const homeSelected = (props: SidebarProps): boolean =>
  props.pages[0] !== undefined && props.shown === props.pages[0].id

export function Sidebar(
  props: SidebarProps & {
    width: SidebarWidth
    setWidth: (width: SidebarWidth) => void
    sidebar: RefObject<HTMLElement | null>
    told: ReactNode
  },
) {
  const fold = useSidebarFoldMotion(props.sidebar, props.width)
  const expanded = props.width === 'expanded'
  return (
    <aside
      ref={props.sidebar}
      className="shell-sidebar"
      data-region="sidebar"
      tabIndex={-1}
      data-width={props.width}
      data-labels={fold.labels ? 'shown' : 'hidden'}
      data-fold-ready={fold.ready ? 'true' : 'false'}
    >
      <div className="shell-window-strip" aria-hidden="true" />
      <div className="shell-brand-row">
        <Home
          appName={props.appName}
          selected={homeSelected(props)}
          page={props.homePage}
          choose={props.state.page.choose}
        />
        <IconButton
          label={expanded ? '收起侧栏' : '展开侧栏'}
          tooltipSide="right"
          className="shell-fold"
          onClick={() => {
            fold.prepare()
            props.setWidth(expanded ? 'rail' : 'expanded')
          }}
        >
          <FoldIcon aria-hidden="true" data-icon-reversed={expanded ? undefined : ''} />
        </IconButton>
      </div>
      {props.told}
      <SidebarBody {...props} expanded={fold.labels} choose={props.state.page.choose} />
    </aside>
  )
}

export const SHEET_LABEL = '展开或收起导航'

/** Below 768 a sheet from the right; choosing any page, or the window growing past 768, closes it. */
export function NarrowNavigation(props: SidebarProps) {
  const [openedOn, setOpenedOn] = useState<{ readonly page: string | undefined } | null>(null)
  if (openedOn !== null && openedOn.page !== props.shown) setOpenedOn(null)
  const close = (): void => setOpenedOn(null)
  const choose = (id: string): void => {
    props.state.page.choose(id)
    close()
  }
  return (
    <aside className="shell-sidebar" data-region="sidebar" tabIndex={-1} data-width="sheet">
      <Sheet
        open={openedOn !== null}
        onOpenChange={open => setOpenedOn(open ? { page: props.shown } : null)}
      >
        <SheetTrigger asChild>
          <IconButton label={SHEET_LABEL} tooltipSide="bottom" className="shell-menu">
            <MenuIcon aria-hidden="true" />
          </IconButton>
        </SheetTrigger>
        <SheetContent
          side="right"
          className="shell-sheet"
          closeLabel={SHEET_LABEL}
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">{props.appName}</SheetTitle>
          <div className="shell-sheet-navigation">
            <div className="shell-brand-row">
              <Home
                appName={props.appName}
                selected={homeSelected(props)}
                page={props.homePage}
                choose={choose}
              />
            </div>
            <SidebarBody {...props} expanded choose={choose} />
          </div>
        </SheetContent>
      </Sheet>
    </aside>
  )
}
