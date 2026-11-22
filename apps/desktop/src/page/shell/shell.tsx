import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type {
  FigureDoing,
  MergedFigure,
  PageItem,
  ShellLoginState,
} from '@omne-harness/shell-contract'
import {
  AppTooltipProvider,
  FIGURE_SIZE,
  FigureSeat,
  FigureStage,
  InkBubble,
  InlineNotice,
  LoadingState,
  useSizeFactor,
  type Box,
} from '@omne-harness/ui-kit'
import type { Connectivity } from '../connectivity.ts'
import { useConflicts, useSlot, useWatched } from './hooks.ts'
import { Item } from './item.tsx'
import { bindRegionKeys } from './keys.ts'
import { pressSeat, useSeatedHome } from './seats.ts'
import {
  NarrowNavigation,
  RECONNECTING_TEXT,
  Sidebar,
  type SidebarProps,
  type SizeSwitch,
  type ThemeSwitch,
} from './sidebar.tsx'
import type { SidebarWidth } from './sidebar-motion.ts'
import type { ShellState } from './state.ts'
import { ToldAtHome } from './told.tsx'

export type { SizeSwitch, ThemeSwitch } from './sidebar.tsx'

export type ConnectivitySource = {
  current(): Connectivity
  subscribe(listener: (state: Connectivity) => void): () => void
}

export type ShellProps = Readonly<{
  appName: string
  state: ShellState
  connectivity: ConnectivitySource
  theme: ThemeSwitch
  size: SizeSwitch
  missingAtForwarding?: readonly string[]
}>

export const NO_LOGIN_TEXT = '这个部署没有开放登录'

/** What the hidden status line says the figure is written as doing. */
export const DOING_TEXT: Readonly<Record<FigureDoing, string>> = {
  idle: 'Agent 闲着',
  thinking: 'Agent 在想',
  looking: 'Agent 在查',
  writing: 'Agent 在写',
  background: 'Agent 在后台做事',
}

/** The window at least 768 wide has the sidebar; a narrower one has the sheet. */
const WIDE = '(min-width: 768px)'

function useConnectivity(source: ConnectivitySource): Connectivity {
  return useSyncExternalStore(
    listener => source.subscribe(() => listener()),
    () => source.current(),
  )
}

function useLoginState(state: ShellState): ShellLoginState {
  return useSyncExternalStore(
    listener => state.login.subscribe(() => listener()),
    () => state.login.state(),
  )
}

function useWide(): boolean {
  return useSyncExternalStore(
    listener => {
      if (typeof window.matchMedia !== 'function') return () => undefined
      const query = window.matchMedia(WIDE)
      query.addEventListener('change', listener)
      return () => query.removeEventListener('change', listener)
    },
    () => typeof window.matchMedia !== 'function' || window.matchMedia(WIDE).matches,
  )
}

const ownerOf = (owners: readonly object[] = []): object | undefined =>
  owners.length === 1 ? owners[0] : undefined

/** The modules' reports merged (R4-1): the module whose page is on show is in front. */
function useFigure(state: ShellState, pages: readonly PageItem[], shown: string | undefined) {
  const [, changed] = useReducer((count: number) => count + 1, 0)
  useEffect(() => state.figure.subscribe(changed), [state.figure])
  return state.figure.merged({
    foreground: shown === undefined ? undefined : ownerOf(state.pageOwners.get(shown)),
    pages: pages.map(page => page.id),
  })
}

export function figureText(merged: MergedFigure): string {
  const said = DOING_TEXT[merged.doing]
  return merged.subject === undefined ? said : `${said}：${merged.subject}`
}

function StaleApp(props: { missing: readonly string[] }) {
  if (props.missing.length === 0) return null
  return (
    <InlineNotice tone="caution" role="alert" className="shell-banner" still>
      {`应用的版本旧了，需要重启。它不认得这个页面要用的：${props.missing.join('、')}。`}
    </InlineNotice>
  )
}

/** What the figure on the gate says, in full ink out of its gap and down, once the login gate is back. */
function GateNotice(props: { text: string; seat: React.RefObject<HTMLElement | null> }) {
  const factor = useSizeFactor()
  const [figure, setFigure] = useState<Box | null>(null)
  const { seat } = props
  useLayoutEffect(() => {
    const measure = (): void => {
      const element = seat.current?.querySelector('[data-figure-seat]')
      if (element == null) return
      const box = element.getBoundingClientRect()
      const size = FIGURE_SIZE * factor
      const x = box.left + box.width / 2 - size / 2
      const y = box.top + box.height / 2 - size / 2
      setFigure(was =>
        was !== null && was.x === x && was.y === y && was.width === size
          ? was
          : { x, y, width: size, height: size },
      )
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [seat, factor])
  if (figure === null) return null
  return (
    <InkBubble as="section" figure={figure} className="shell-gate-notice" role="status">
      <p className="shell-gate-notice-words">{props.text}</p>
    </InkBubble>
  )
}

/** Two modules each brought a login gate: neither is shown, and the person reads who they are. */
export const gateConflictText = (by: readonly string[]): string =>
  `登录入口有 ${by.length} 份，来自 ${by.join('、')}，都没有显示。`

function Gate(props: { state: ShellState; connectivity: Connectivity }) {
  const [gate] = useSlot(props.state.slots, 'gate')
  const [conflict] = useConflicts(props.state.slots, 'gate')
  const notice = useWatched(props.state.notice)
  const seat = useRef<HTMLDivElement>(null)
  return (
    <div className="shell-gate">
      <div ref={seat}>
        <FigureSeat name="gate" className="shell-gate-seat" />
      </div>
      {notice !== undefined ? <GateNotice text={notice} seat={seat} /> : null}
      <div className="shell-gate-card">
        {conflict !== undefined ? (
          <InlineNotice tone="danger" role="alert" still>
            {gateConflictText(conflict.by)}
          </InlineNotice>
        ) : gate !== undefined ? (
          <Item key={gate.id} render={() => gate.render({})} />
        ) : props.connectivity === 'connecting' ? (
          <LoadingState className="shell-connecting" label="正在连接服务……" />
        ) : (
          <p className="shell-gate-closed">{NO_LOGIN_TEXT}</p>
        )}
      </div>
    </div>
  )
}

function Outside(props: {
  state: ShellState
  login: ShellLoginState
  connectivity: Connectivity
  missing: readonly string[]
}) {
  return (
    <main id="shell-content" className="shell-outside" data-keyboard-region="main" tabIndex={-1}>
      <div className="shell-drag-strip" aria-hidden="true" />
      {props.connectivity === 'disconnected' ? (
        <LoadingState className="shell-reconnecting" label={RECONNECTING_TEXT} />
      ) : null}
      <StaleApp missing={props.missing} />
      {props.login === 'signing-out' ? (
        <LoadingState label="正在退出……" />
      ) : (
        <Gate state={props.state} connectivity={props.connectivity} />
      )}
    </main>
  )
}

function Workspace(props: SidebarProps & { missing: readonly string[] }) {
  const { state, pages, shown } = props
  const focus = useWatched(state.page.focus)
  const scope = useWatched(state.scope)
  const wide = useWide()
  const [width, setWidth] = useState<SidebarWidth>('expanded')
  const [covered, setCovered] = useState(false)
  const sidebar = useRef<HTMLElement>(null)
  const home = useSeatedHome()
  const room = wide && width === 'expanded' && home
  useEffect(() => state.told.room(room), [state.told, room])
  useEffect(() => () => state.told.room(false), [state.told])
  return (
    <div className="app-shell">
      {wide ? (
        <Sidebar
          {...props}
          width={width}
          setWidth={setWidth}
          sidebar={sidebar}
          told={<ToldAtHome state={state} sidebar={sidebar} />}
        />
      ) : (
        <NarrowNavigation {...props} covering={setCovered} />
      )}
      <main
        id="shell-content"
        className="shell-workspace"
        data-keyboard-region="main"
        tabIndex={-1}
        inert={!wide && covered}
      >
        <div className="shell-drag-strip" aria-hidden="true" />
        <StaleApp missing={props.missing} />
        {pages.map(page => (
          <section
            key={page.id}
            className="shell-page"
            aria-label={page.title}
            data-page={page.id}
            hidden={page.id !== shown}
          >
            <Item
              scope={scope}
              render={() =>
                page.render(focus?.page === page.id ? { scope, subject: focus.subject } : { scope })
              }
            />
          </section>
        ))}
      </main>
    </div>
  )
}

export function Shell(props: ShellProps) {
  const { state } = props
  const login = useLoginState(state)
  const connectivity = useConnectivity(props.connectivity)
  const missing = props.missingAtForwarding ?? []
  const pages = useSlot(state.slots, 'pages')
  const shown = useWatched(state.page)
  const merged = useFigure(state, pages, shown)
  useEffect(() => bindRegionKeys(window), [])
  const homePage =
    merged.waiting > 0 && merged.waitingPage !== undefined ? merged.waitingPage : pages[0]?.id
  return (
    <AppTooltipProvider>
      <FigureStage
        doing={merged.doing === 'idle' ? undefined : merged.doing}
        moment={merged.moment}
        waiting={merged.waiting}
        label={figureText(merged)}
        onPress={pressSeat}
      >
        <a className="shell-skip" href="#shell-content" data-control="link">
          跳到正文
        </a>
        {login === 'signed-in' ? (
          <Workspace
            appName={props.appName}
            state={state}
            connectivity={connectivity}
            theme={props.theme}
            size={props.size}
            pages={pages}
            shown={shown}
            homePage={homePage}
            missing={missing}
          />
        ) : (
          <Outside state={state} login={login} connectivity={connectivity} missing={missing} />
        )}
      </FigureStage>
    </AppTooltipProvider>
  )
}
