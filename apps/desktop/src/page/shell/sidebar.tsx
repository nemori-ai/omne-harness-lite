import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
  type RefCallback,
  type RefObject,
} from 'react'
import type { PageItem, SidebarItem } from '@omne-harness/shell-contract'
import {
  ActionTooltip,
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
  IconButton,
  LoadingState,
  MenuIcon,
  NamedIcon,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TurnIcon,
  ViewIcon,
  type ResolvedTheme,
  type SizeController,
  type SizeTier,
  type ThemeChoice,
} from '@omne-harness/ui-kit'
import type { Connectivity } from '../connectivity.ts'
import { goHome } from './home.ts'
import { useSlot, useWatched } from './hooks.ts'
import { Item } from './item.tsx'
import { useSidebarFoldMotion, type SidebarWidth } from './sidebar-motion.ts'
import {
  shellSidebar,
  shellSidebarAppearance,
  shellSidebarFold,
  shellSidebarFooter,
  shellSidebarHome,
  shellSidebarMenu,
  shellSidebarNav,
  shellSidebarNavRow,
  shellSidebarTurn,
  shellSidebarUtility,
} from './parts.ts'
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
  go: () => void
  seat?: boolean
}) {
  return (
    <ActionTooltip label={props.appName} side="right">
      <a
        href={hrefOf(props.page)}
        className="shell-home"
        {...shellSidebarHome.props}
        data-control="row"
        data-selected={props.selected}
        aria-current={props.selected ? 'page' : undefined}
        aria-label={props.appName}
        draggable={false}
        onClick={event => {
          event.preventDefault()
          props.go()
        }}
      >
        {props.seat === false ? (
          <span className="shell-home-seat" />
        ) : (
          <FigureSeat name="home" className="shell-home-seat" />
        )}
      </a>
    </ActionTooltip>
  )
}

function keepInView(row: HTMLElement): () => void {
  const reveal = (): void => row.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  reveal()
  const resized = new ResizeObserver(reveal)
  resized.observe(row)
  const column = row.closest('.shell-navigation-content')
  if (column !== null) resized.observe(column)
  return () => resized.disconnect()
}

function PageRow(props: {
  page: PageItem
  scope: string | undefined
  selected: boolean
  expanded: boolean
  choose: (id: string) => void
  glide: boolean
}) {
  const { page, scope, selected } = props
  const { badge } = page
  const row = useRef<HTMLAnchorElement>(null)
  useLayoutEffect(() => {
    const element = row.current
    if (!selected || element === null) return undefined
    return keepInView(element)
  }, [selected])
  return (
    <RowHint expanded={props.expanded} label={page.title}>
      <a
        ref={row}
        href={hrefOf(page.id)}
        className={props.selected ? 'shell-nav-link active' : 'shell-nav-link'}
        {...shellSidebarNavRow.props}
        data-glide-row={props.glide ? '' : undefined}
        data-control="row"
        data-selected={props.selected}
        aria-current={props.selected ? 'page' : undefined}
        data-page={page.id}
        draggable={false}
        onClick={follow(props.choose, page.id)}
      >
        <NamedIcon name={page.icon} aria-hidden="true" />
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
  utility: boolean
}) {
  const rows = props.pages.map(page => (
    <PageRow
      key={page.id}
      page={page}
      scope={props.scope}
      selected={page.id === props.shown}
      expanded={props.expanded}
      choose={props.choose}
      glide={!props.utility}
    />
  ))
  return props.utility ? (
    <nav className="shell-utility-nav" aria-label={props.label} {...shellSidebarUtility.props}>
      {rows}
    </nav>
  ) : (
    <nav className="shell-nav" aria-label={props.label} {...shellSidebarNav.props}>
      <GlideMenu className="shell-nav-rows">{rows}</GlideMenu>
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
  const side = props.expanded ? 'top' : 'right'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          label="外观"
          tooltipSide={side}
          className="shell-appearance"
          data-appearance=""
          {...shellSidebarAppearance.props}
        >
          <ViewIcon aria-hidden="true" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end">
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

export const TURN_LABEL = '翻到反面'

function TurnMark(props: { state: ShellState; expanded: boolean }) {
  const two = useWatched(props.state.face.two)
  if (!two) return null
  return (
    <IconButton
      label={TURN_LABEL}
      tooltipSide={props.expanded ? 'top' : 'right'}
      className="shell-turn"
      data-turn=""
      {...shellSidebarTurn.props}
      onClick={() => props.state.face.turn()}
    >
      <TurnIcon aria-hidden="true" />
    </IconButton>
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
  const rows = (label: string, list: readonly PageItem[], utility: boolean) => (
    <PageRows
      label={label}
      pages={list}
      scope={scope}
      shown={props.shown}
      expanded={expanded}
      choose={props.choose}
      utility={utility}
    />
  )
  return (
    <div
      className="shell-navigation-content"
      data-expanded={expanded ? 'true' : 'false'}
      data-count-dots={expanded ? undefined : ''}
    >
      <Reconnecting connectivity={props.connectivity} />
      <div className="shell-navigation-main">
        {rows('页面', primary, false)}
        <div className="shell-sidebar-primary">{entries('primary')}</div>
      </div>
      <div className="shell-secondary">
        {utility.length === 0 ? null : rows('次要页面', utility, true)}
        <div className="shell-footer-row" {...shellSidebarFooter.props}>
          <div className="shell-footer-items">{entries('utility')}</div>
          <TurnMark state={state} expanded={expanded} />
          <Appearance theme={props.theme} size={props.size} expanded={expanded} />
        </div>
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
      {...shellSidebar.props}
      data-keyboard-region="sidebar"
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
          go={() => goHome(props.state)}
        />
        <IconButton
          label={expanded ? '收起侧栏' : '展开侧栏'}
          tooltipSide="right"
          className="shell-fold"
          {...shellSidebarFold.props}
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

function useArrived(open: boolean): [RefCallback<HTMLDivElement>, boolean] {
  const [inside, setInside] = useState<HTMLDivElement | null>(null)
  const [arrived, setArrived] = useState(false)
  useLayoutEffect(() => {
    setArrived(false)
    const sheet = inside?.closest<HTMLElement>('[data-slot="sheet-content"]')
    if (!open || sheet == null) return undefined
    if (!sheet.getAnimations().some(animation => animation.playState === 'running')) {
      setArrived(true)
      return undefined
    }
    const landed = (event: AnimationEvent): void => {
      if (event.target === sheet) setArrived(true)
    }
    sheet.addEventListener('animationend', landed)
    sheet.addEventListener('animationcancel', landed)
    return () => {
      sheet.removeEventListener('animationend', landed)
      sheet.removeEventListener('animationcancel', landed)
    }
  }, [open, inside])
  return [setInside, open && arrived]
}

function SheetNavigation(
  props: SidebarProps & {
    inside: RefCallback<HTMLDivElement>
    seat: boolean
    choose: (id: string) => void
    home: () => void
  },
) {
  return (
    <div ref={props.inside} className="shell-sheet-navigation">
      <div className="shell-brand-row">
        <Home
          appName={props.appName}
          selected={homeSelected(props)}
          page={props.homePage}
          go={props.home}
          seat={props.seat}
        />
      </div>
      <SidebarBody {...props} expanded choose={props.choose} />
    </div>
  )
}

/** Below 768 a sheet over an inert page; the home beside its toggle is the seat until the sheet's own has come in. */
export function NarrowNavigation(props: SidebarProps & { covering: (open: boolean) => void }) {
  const [openedOn, setOpenedOn] = useState<{ readonly page: string | undefined } | null>(null)
  if (openedOn !== null && openedOn.page !== props.shown) setOpenedOn(null)
  const open = openedOn !== null
  const [inside, arrived] = useArrived(open)
  const { covering, ...navigation } = props
  useEffect(() => {
    covering(open)
    return () => covering(false)
  }, [covering, open])
  const close = (): void => setOpenedOn(null)
  const choose = (id: string): void => {
    navigation.state.page.choose(id)
    close()
  }
  return (
    <aside
      className="shell-sidebar"
      {...shellSidebar.props}
      data-keyboard-region="sidebar"
      tabIndex={-1}
      data-width="sheet"
    >
      <Home
        appName={navigation.appName}
        selected={homeSelected(navigation)}
        page={navigation.homePage}
        go={() => goHome(navigation.state)}
        seat={!arrived}
      />
      <Sheet
        open={open}
        onOpenChange={opening => setOpenedOn(opening ? { page: navigation.shown } : null)}
      >
        <SheetTrigger asChild>
          <IconButton
            label={SHEET_LABEL}
            tooltipSide="bottom"
            className="shell-menu"
            {...shellSidebarMenu.props}
          >
            <MenuIcon aria-hidden="true" />
          </IconButton>
        </SheetTrigger>
        <SheetContent
          side="right"
          className="shell-sheet"
          closeLabel={SHEET_LABEL}
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">{navigation.appName}</SheetTitle>
          <SheetNavigation
            {...navigation}
            inside={inside}
            seat={arrived}
            choose={choose}
            home={() => {
              goHome(navigation.state)
              close()
            }}
          />
        </SheetContent>
      </Sheet>
    </aside>
  )
}
