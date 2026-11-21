import { useRef, useState, useSyncExternalStore } from 'react'
import type { PageItem, ShellLoginState } from '@omne-harness/shell-contract'
import {
  AppTooltipProvider,
  FoldIcon,
  ICONS,
  IconButton,
  InlineNotice,
  LoadingState,
  ToastItem,
  ToastStack,
  type ResolvedTheme,
  type ThemeChoice,
} from '@omne-harness/ui-kit'
import type { Connectivity } from '../connectivity.ts'
import { useSlot, useWatched } from './hooks.ts'
import { Item } from './item.tsx'
import { useSidebarFoldMotion, type SidebarWidth } from './sidebar-motion.ts'
import type { ShellState } from './state.ts'

export type ConnectivitySource = {
  current(): Connectivity
  subscribe(listener: (state: Connectivity) => void): () => void
}

export type ThemeSwitch = {
  readonly initial: ResolvedTheme
  select(choice: ThemeChoice): ResolvedTheme
}

export type ShellProps = Readonly<{
  appName: string
  state: ShellState
  connectivity: ConnectivitySource
  theme: ThemeSwitch
  missingAtForwarding?: readonly string[]
}>

const CONNECTIVITY_TEXT: Readonly<Record<Connectivity, string>> = {
  connecting: '正在连接',
  connected: '已连接',
  disconnected: '连不上服务',
}

export const NO_LOGIN_TEXT = '这个部署没有开放登录'

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

function Disconnected(props: { connectivity: Connectivity }) {
  if (props.connectivity !== 'disconnected') return null
  return (
    <InlineNotice tone="danger" role="alert" className="shell-banner" still>
      连不上服务。正在按间隔重新连接……
    </InlineNotice>
  )
}

function StaleApp(props: { missing: readonly string[] }) {
  if (props.missing.length === 0) return null
  return (
    <InlineNotice tone="caution" role="alert" className="shell-banner" still>
      {`应用的版本旧了，需要重启。它不认得这个页面要用的：${props.missing.join('、')}。`}
    </InlineNotice>
  )
}

function ConnectivityMark(props: { connectivity: Connectivity }) {
  return (
    <span className="shell-connectivity" data-connectivity={props.connectivity} role="status">
      <span className="shell-connectivity-dot" aria-hidden="true" />
      <span className="shell-link-label">{CONNECTIVITY_TEXT[props.connectivity]}</span>
    </span>
  )
}

function Gate(props: { state: ShellState; connectivity: Connectivity }) {
  const [gate] = useSlot(props.state.slots, 'gate')
  const notice = useWatched(props.state.notice)
  return (
    <div className="shell-gate">
      {notice !== undefined ? (
        <InlineNotice tone="caution" role="status" still>
          {notice}
        </InlineNotice>
      ) : null}
      {gate !== undefined ? (
        <Item key={gate.id} render={() => gate.render({})} />
      ) : props.connectivity === 'connecting' ? (
        <LoadingState label="正在连接服务……" />
      ) : (
        <p className="shell-empty">{NO_LOGIN_TEXT}</p>
      )}
    </div>
  )
}

function Outside(props: {
  appName: string
  state: ShellState
  login: ShellLoginState
  connectivity: Connectivity
  missing: readonly string[]
}) {
  return (
    <main className="shell-outside">
      <Disconnected connectivity={props.connectivity} />
      <StaleApp missing={props.missing} />
      <span className="shell-brand shell-brand-outside">{props.appName}</span>
      {props.login === 'signing-out' ? (
        <LoadingState label="正在退出……" />
      ) : (
        <Gate state={props.state} connectivity={props.connectivity} />
      )}
    </main>
  )
}

function PageLink(props: {
  page: PageItem
  scope: string | undefined
  current: boolean
  choose: (id: string) => void
}) {
  const Icon = props.page.icon === undefined ? undefined : ICONS[props.page.icon]
  const { badge } = props.page
  const { scope } = props
  return (
    <button
      type="button"
      className={props.current ? 'shell-nav-link active' : 'shell-nav-link'}
      aria-current={props.current ? 'page' : undefined}
      data-page={props.page.id}
      onClick={() => props.choose(props.page.id)}
    >
      {Icon === undefined ? null : <Icon aria-hidden="true" />}
      <span className="shell-link-label">{props.page.title}</span>
      {badge === undefined ? null : (
        <span className="shell-nav-badge">
          <Item quiet scope={scope} render={() => badge({ scope })} />
        </span>
      )}
    </button>
  )
}

function ThemeButton(props: { theme: ThemeSwitch }) {
  const [resolved, setResolved] = useState(props.theme.initial)
  const next: ResolvedTheme = resolved === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className="shell-utility-button"
      data-theme-switch={resolved}
      onClick={() => setResolved(props.theme.select(next))}
    >
      <span aria-hidden="true" className="shell-theme-mark" data-theme-mark={next} />
      <span className="shell-link-label">{next === 'dark' ? '换成深色' : '换成浅色'}</span>
    </button>
  )
}

function Sidebar(props: {
  appName: string
  state: ShellState
  connectivity: Connectivity
  theme: ThemeSwitch
  shown: string | undefined
  pages: readonly PageItem[]
}) {
  const ref = useRef<HTMLElement>(null)
  const [width, setWidth] = useState<SidebarWidth>('expanded')
  const fold = useSidebarFoldMotion(ref, width)
  const items = useSlot(props.state.slots, 'sidebar')
  const scope = useWatched(props.state.scope)
  return (
    <aside
      ref={ref}
      className="shell-sidebar"
      data-width={width}
      data-labels={fold.labels ? 'shown' : 'hidden'}
      data-fold-ready={fold.ready ? 'true' : 'false'}
    >
      <div className="shell-brand-row">
        <span className="shell-brand">{props.appName}</span>
        <IconButton
          label={width === 'expanded' ? '收起侧栏' : '展开侧栏'}
          variant="ghost"
          className="shell-fold"
          onClick={() => {
            fold.prepare()
            setWidth(width === 'expanded' ? 'rail' : 'expanded')
          }}
        >
          <FoldIcon aria-hidden="true" />
        </IconButton>
      </div>
      <div className="shell-navigation-content" data-expanded={fold.labels ? 'true' : 'false'}>
        <ConnectivityMark connectivity={props.connectivity} />
        <nav className="shell-nav" aria-label="页面">
          {props.pages.map(page => (
            <PageLink
              key={page.id}
              page={page}
              scope={scope}
              current={page.id === props.shown}
              choose={props.state.page.choose}
            />
          ))}
        </nav>
        <div className="shell-navigation-main">
          {items.map(item => (
            <div key={item.id} className="shell-sidebar-item" data-item={item.id}>
              <Item scope={scope} render={() => item.render({ scope })} />
            </div>
          ))}
        </div>
        <div className="shell-secondary">
          <ThemeButton theme={props.theme} />
        </div>
      </div>
    </aside>
  )
}

function Workspace(props: {
  appName: string
  state: ShellState
  connectivity: Connectivity
  theme: ThemeSwitch
  missing: readonly string[]
}) {
  const pages = useSlot(props.state.slots, 'pages')
  const shown = useWatched(props.state.page)
  const focus = useWatched(props.state.page.focus)
  const scope = useWatched(props.state.scope)
  return (
    <div className="app-shell">
      <Sidebar {...props} shown={shown} pages={pages} />
      <main className="shell-workspace">
        <Disconnected connectivity={props.connectivity} />
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

/** The toasts modules handed over; an action goes to its page and closes the toast. */
function Toasts(props: { state: ShellState }) {
  const { toasts, page } = props.state
  const shown = useSyncExternalStore(toasts.subscribe, toasts.shown)
  return (
    <ToastStack label="提示">
      {shown.map(({ key, toast }) => {
        const { action } = toast
        return (
          <ToastItem
            key={key}
            tone={toast.tone}
            title={toast.title}
            {...(toast.body !== undefined && { body: toast.body })}
            {...(action !== undefined && {
              action: {
                label: action.label,
                onClick: () => {
                  page.choose(action.page, action.subject)
                  toasts.dismiss(key)
                },
              },
            })}
            onDismiss={() => toasts.dismiss(key)}
          />
        )
      })}
    </ToastStack>
  )
}

export function Shell(props: ShellProps) {
  const login = useLoginState(props.state)
  const connectivity = useConnectivity(props.connectivity)
  const missing = props.missingAtForwarding ?? []
  return (
    <AppTooltipProvider>
      {login === 'signed-in' ? (
        <Workspace
          appName={props.appName}
          state={props.state}
          connectivity={connectivity}
          theme={props.theme}
          missing={missing}
        />
      ) : (
        <Outside
          appName={props.appName}
          state={props.state}
          login={login}
          connectivity={connectivity}
          missing={missing}
        />
      )}
      <Toasts state={props.state} />
    </AppTooltipProvider>
  )
}
