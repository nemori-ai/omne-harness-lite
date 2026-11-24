import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type {
  ActionItem,
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
import { Float } from './float.tsx'
import type { FloatPlaces } from './float-place.ts'
import { useConflicts, useSlot, useWatched } from './hooks.ts'
import { Item } from './item.tsx'
import { bindShellKeys } from './keys.ts'
import { frameActions, regionActions, sizeActions } from './layout-actions.ts'
import { lackText, type Lack, type LackSlot } from './lacks.ts'
import { shellApp, shellGate, shellWorkspace, shellWorkspacePage } from './parts.ts'
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
  floats: FloatPlaces
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

export const THREW_TEXT = '界面有几块启动时出错，没有起来'
export const HELD_TEXT = '连着两次让应用起不来，已经停掉'
export const HELD_HINT = '换一版，或者不再装它，就放开'

function Fallen(props: { state: ShellState }) {
  const fallen = useWatched(props.state.fallen)
  const named = (why: 'threw' | 'held'): string =>
    fallen
      .filter(each => each.why === why)
      .map(each => each.name)
      .join('、')
  const threw = named('threw')
  const held = named('held')
  if (threw === '' && held === '') return null
  return (
    <InlineNotice tone="caution" role="alert" className="shell-banner" still>
      {threw === '' ? '' : `${THREW_TEXT}：${threw}。别的照常。`}
      {held === '' ? '' : `${held} ${HELD_TEXT}。${HELD_HINT}。`}
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
  const lacks = useLacks(props.state)('gate', gate?.id ?? '')
  return (
    <div className="shell-gate" {...shellGate.props}>
      <div ref={seat}>
        <FigureSeat name="gate" className="shell-gate-seat" />
      </div>
      {notice !== undefined ? <GateNotice text={notice} seat={seat} /> : null}
      <div className="shell-gate-card">
        {conflict !== undefined ? (
          <InlineNotice tone="danger" role="alert" still>
            {gateConflictText(conflict.by)}
          </InlineNotice>
        ) : gate !== undefined && lacks.length > 0 ? (
          <Lacks lacks={lacks} slot="gate" />
        ) : gate !== undefined ? (
          <Item key={gate.id} render={() => gate.render({})} />
        ) : props.connectivity === 'connecting' ? (
          <LoadingState className="shell-connecting" label={CONNECTING_TEXT} />
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
    <main
      id="shell-content"
      className="shell-outside"
      data-keyboard-region="main"
      tabIndex={-1}
      {...shellApp.props}
    >
      <div className="shell-drag-strip" aria-hidden="true" />
      {props.connectivity === 'disconnected' ? (
        <LoadingState className="shell-reconnecting" label={RECONNECTING_TEXT} />
      ) : null}
      <StaleApp missing={props.missing} />
      <Fallen state={props.state} />
      {props.login === 'signing-out' ? (
        <LoadingState label="正在退出……" />
      ) : (
        <Gate state={props.state} connectivity={props.connectivity} />
      )}
    </main>
  )
}

export const CONNECTING_TEXT = '正在连接服务……'

/** A page or gate whose module lacks something it needs: one sentence for each, or the wait for the connection. */
function Lacks(props: { lacks: readonly Lack[]; slot: LackSlot }) {
  const said = props.lacks.flatMap(lack =>
    lack.kind === 'connecting' ? [] : [lackText(lack, props.slot)],
  )
  if (said.length < props.lacks.length)
    return <LoadingState className="shell-connecting" label={CONNECTING_TEXT} />
  return [...new Set(said)].map(text => (
    <InlineNotice key={text} tone="caution" role="status" className="shell-page-lack" still>
      {text}
    </InlineNotice>
  ))
}

function useLacks(state: ShellState): (slot: LackSlot, id: string) => readonly Lack[] {
  const [, changed] = useReducer((count: number) => count + 1, 0)
  useEffect(() => state.lacks.subscribe(changed), [state.lacks])
  return (slot, id) => state.lacks.of(slot, id)
}

function Workspace(props: SidebarProps & { missing: readonly string[]; floats: FloatPlaces }) {
  const { state, pages, shown } = props
  const focus = useWatched(state.page.focus)
  const scope = useWatched(state.scope)
  const wide = useWide()
  const [width, setWidth] = useState<SidebarWidth>('expanded')
  const [covered, setCovered] = useState(false)
  const sidebar = useRef<HTMLElement>(null)
  const home = useSeatedHome()
  const room = wide && width === 'expanded' && home
  const lacksOf = useLacks(state)
  useEffect(() => state.told.room(room), [state.told, room])
  useEffect(() => () => state.told.room(false), [state.told])
  return (
    <div className="app-shell" {...shellApp.props}>
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
        {...shellWorkspace.props}
        data-keyboard-region="main"
        tabIndex={-1}
        inert={!wide && covered}
      >
        <div className="shell-drag-strip" aria-hidden="true" />
        <StaleApp missing={props.missing} />
        <Fallen state={state} />
        {pages.map(page => {
          const lacks = lacksOf('pages', page.id)
          const toPage = focus?.page === page.id ? { scope, subject: focus.subject } : { scope }
          return (
            <section
              key={page.id}
              className="shell-page"
              {...shellWorkspacePage.props}
              aria-label={page.title}
              data-page={page.id}
              hidden={page.id !== shown}
            >
              {lacks.length > 0 ? (
                <Lacks lacks={lacks} slot="pages" />
              ) : (
                <Item scope={scope} render={() => page.render(toPage)} />
              )}
            </section>
          )
        })}
      </main>
      <Float state={state} scope={scope} places={props.floats} inert={!wide && covered} />
    </div>
  )
}

const KEYS = { name: 'shell keys' }
const MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

function shellKeys(state: ShellState, size: SizeSwitch) {
  const tell = (id: string, title: string): void =>
    state.told.show(KEYS, { id, tone: 'attention', title })
  return {
    mac: MAC,
    actions: () => [
      ...regionActions(),
      ...sizeActions(size),
      ...frameActions(),
      ...state.slots.items('actions'),
    ],
    refused: (action: ActionItem, reason: string) => tell(action.id, reason),
    failed: (action: ActionItem, error: unknown) => {
      console.error(error)
      tell(action.id, `${action.title}没有做成`)
    },
    leave: () => document.getElementById('shell-content')?.focus(),
  }
}

export function Shell(props: ShellProps) {
  const { state } = props
  const login = useLoginState(state)
  const connectivity = useConnectivity(props.connectivity)
  const missing = props.missingAtForwarding ?? []
  const pages = useSlot(state.slots, 'pages')
  const shown = useWatched(state.page)
  const merged = useFigure(state, pages, shown)
  useEffect(() => bindShellKeys(window, shellKeys(state, props.size)), [state, props.size])
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
            floats={props.floats}
          />
        ) : (
          <Outside state={state} login={login} connectivity={connectivity} missing={missing} />
        )}
      </FigureStage>
    </AppTooltipProvider>
  )
}
