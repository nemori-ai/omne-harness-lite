import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type {
  BackItem,
  FigureDoing,
  MergedFigure,
  PageItem,
  ShellLoginState,
  SlotConflict,
} from '@omne-harness/shell-contract'
import {
  AppTooltipProvider,
  RedrawProvider,
  FIGURE_SIZE,
  FigureSeat,
  FigureStage,
  FlipLayer,
  InkBubble,
  InlineNotice,
  LoadingState,
  useFaceFlip,
  useSizeFactor,
  type Box,
  type FaceFlip,
  type FigureControl,
} from '@omne-harness/ui-kit'
import type { Connectivity } from '../connectivity.ts'
import { NO_FIGURE_DEVICE, type FigureDevice } from './desk/device.ts'
import { useStay } from './desk/stay.ts'
import { Float } from './float.tsx'
import { goHome, homeOf, mergedOf } from './home.ts'
import type { FloatPlaces } from './float-place.ts'
import { useConflicts, useSlot, useWatched } from './hooks.ts'
import { Item } from './item.tsx'
import { runAction } from './dispatch.ts'
import { bindShellKeys, shellKeys } from './keys.ts'
import { paletteSwitch, ShellPalette } from './palette.tsx'
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
import type { Face, PageFocus, ShellState } from './state.ts'
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
  figureDevice?: FigureDevice
  missingAtForwarding?: readonly string[]
}>

export const NO_LOGIN_TEXT = '这个部署没有开放登录'
export const RECALL_TEXT = '叫它回来'

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

function useFigure(state: ShellState, pages: readonly PageItem[], shown: string | undefined) {
  const [, changed] = useReducer((count: number) => count + 1, 0)
  useEffect(() => state.figure.subscribe(changed), [state.figure])
  return mergedOf(state, pages, shown)
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

export const backConflictText = (by: readonly string[]): string =>
  `反面有 ${by.length} 份，来自 ${by.join('、')}，都没有显示。`

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

export const FACE_TEXT: Readonly<Record<Face, string>> = {
  front: '现在露着正面',
  back: '现在露着反面',
}

function useTurning(flip: FaceFlip): boolean {
  return useSyncExternalStore(flip.subscribe, () => flip.current().phase !== 'idle')
}

function useFaceFlipFor(state: ShellState): { flip: FaceFlip; leaving: Face | undefined } {
  const flip = useFaceFlip()
  const face = useWatched(state.face)
  const turning = useTurning(flip)
  useEffect(
    () => state.face.perform((to, swap) => flip.turn(to === 'back' ? 'right' : 'left', swap)),
    [state.face, flip],
  )
  return { flip, leaving: turning ? (face === 'back' ? 'front' : 'back') : undefined }
}

function bindFigureTurn(state: ShellState): () => void {
  const onMenu = (event: MouseEvent): void => {
    if (
      !(event.target instanceof Element) ||
      event.target.closest('[data-control="figure"]') === null
    )
      return
    if (state.face.get() !== 'back' || !state.face.two.get()) return
    event.preventDefault()
    state.face.turn()
  }
  window.addEventListener('contextmenu', onMenu)
  return () => window.removeEventListener('contextmenu', onMenu)
}

function FaceSaid(props: { face: Face; flip: FaceFlip }) {
  const turning = useTurning(props.flip)
  const [first] = useState(props.face)
  const [turned, setTurned] = useState(false)
  if (!turned && props.face !== first) setTurned(true)
  return (
    <span className="sr-only" role="status">
      {turned && !turning ? FACE_TEXT[props.face] : ''}
    </span>
  )
}

function Back(props: {
  state: ShellState
  scope: string | undefined
  item: BackItem | undefined
  conflict: SlotConflict | undefined
  away: boolean
  leaving: boolean
  element: React.RefObject<HTMLElement | null>
}) {
  const { item, conflict, scope, state } = props
  if (item === undefined && conflict === undefined && props.away) return null
  return (
    <section
      ref={props.element}
      id="shell-back"
      className="shell-face shell-back"
      data-face="back"
      data-flip-leaving={props.leaving ? '' : undefined}
      aria-label="反面"
      data-keyboard-region="back"
      tabIndex={-1}
      inert={props.away}
    >
      {conflict !== undefined ? (
        <InlineNotice tone="danger" role="alert" className="shell-banner" still>
          {backConflictText(conflict.by)}
        </InlineNotice>
      ) : item !== undefined ? (
        <BackBody key={item.id} item={item} scope={scope} state={state} />
      ) : null}
    </section>
  )
}

const BackBody = memo(function BackBody(props: {
  item: BackItem
  scope: string | undefined
  state: ShellState
}) {
  const { item, scope, state } = props
  return (
    <Item
      scope={scope}
      render={() => item.render({ scope, turn: state.face.turn, home: () => goHome(state) })}
    />
  )
})

const WorkspacePage = memo(function WorkspacePage(props: {
  page: PageItem
  shown: string | undefined
  scope: string | undefined
  focus: PageFocus | undefined
  lacks: readonly Lack[]
}) {
  const { page, scope, focus, lacks } = props
  const toPage = focus?.page === page.id ? { scope, subject: focus.subject } : { scope }
  return (
    <section
      className="shell-page"
      {...shellWorkspacePage.props}
      aria-label={page.title}
      data-page={page.id}
      hidden={page.id !== props.shown}
    >
      {lacks.length > 0 ? (
        <Lacks lacks={lacks} slot="pages" />
      ) : (
        <Item scope={scope} render={() => page.render(toPage)} />
      )}
    </section>
  )
})

function Workspace(
  props: SidebarProps & {
    missing: readonly string[]
    floats: FloatPlaces
  },
) {
  const { state, pages, shown } = props
  const focus = useWatched(state.page.focus)
  const scope = useWatched(state.scope)
  const face = useWatched(state.face)
  const [back] = useSlot(state.slots, 'back')
  const [backConflict] = useConflicts(state.slots, 'back')
  const onBack = face === 'back'
  const { flip, leaving } = useFaceFlipFor(state)
  const front = useRef<HTMLDivElement>(null)
  const backFace = useRef<HTMLElement>(null)
  const wide = useWide()
  const [width, setWidth] = useState<SidebarWidth>('expanded')
  const [covered, setCovered] = useState(false)
  const sidebar = useRef<HTMLElement>(null)
  const home = useSeatedHome()
  const room = wide && width === 'expanded' && home
  const lacksOf = useLacks(state)
  useEffect(() => state.told.room(room), [state.told, room])
  useEffect(() => () => state.told.room(false), [state.told])
  useEffect(() => bindFigureTurn(state), [state])
  return (
    <div className="app-shell" {...shellApp.props}>
      <div
        ref={front}
        className="shell-face shell-front"
        data-face="front"
        data-flip-leaving={leaving === 'front' ? '' : undefined}
        inert={onBack}
      >
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
          {pages.map(page => (
            <WorkspacePage
              key={page.id}
              page={page}
              shown={shown}
              scope={scope}
              focus={focus}
              lacks={lacksOf('pages', page.id)}
            />
          ))}
        </main>
      </div>
      <Back
        state={state}
        scope={scope}
        item={back}
        conflict={backConflict}
        away={!onBack}
        leaving={leaving === 'back'}
        element={backFace}
      />
      <Float state={state} scope={scope} places={props.floats} inert={!wide && covered} />
      <FlipLayer
        flip={flip}
        leaving={() => (state.face.get() === 'back' ? front.current : backFace.current)}
      />
      <FaceSaid face={face} flip={flip} />
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
  const face = useWatched(state.face)
  const palette = useMemo(paletteSwitch, [])
  const keys = useMemo(() => shellKeys(state, props.size, palette), [state, props.size, palette])
  useEffect(() => bindShellKeys(window, keys), [keys])
  const homePage = homeOf(merged, pages)
  const doing = merged.doing === 'idle' ? undefined : merged.doing
  const figureControl = useRef<FigureControl>(null)
  const stay = useStay(
    props.figureDevice ?? NO_FIGURE_DEVICE,
    figureControl,
    login === 'signed-in',
    {
      doing,
      moment: merged.moment,
      waiting: merged.waiting,
    },
    state.slots,
    state.scope,
  )
  return (
    <RedrawProvider value={state.redraw.draw}>
      <AppTooltipProvider>
        <FigureStage
          doing={doing}
          moment={merged.moment}
          waiting={merged.waiting}
          label={figureText(merged)}
          onPress={pressSeat}
          liftable
          onHand={stay.hand}
          away={stay.away}
          awayLabel={RECALL_TEXT}
          onRecall={stay.recall}
          control={figureControl}
        >
          <a
            className="shell-skip"
            href={login === 'signed-in' && face === 'back' ? '#shell-back' : '#shell-content'}
            data-control="link"
          >
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
        <ShellPalette
          palette={palette}
          actions={keys.actions}
          mac={keys.mac}
          changes={keys.changes}
          run={action => void runAction(action, keys)}
        />
      </AppTooltipProvider>
    </RedrawProvider>
  )
}
