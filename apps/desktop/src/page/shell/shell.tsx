// The shell (RFC-0015 §6「外壳与界面模块」, §10): top bar, login gate, the signed-in workspace,
// and the two fallbacks — 「连不上服务」 and 「这项能力暂时不可用」. It imports no domain: the
// assembly hands it two regions, each naming the services it needs and how to render them.
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { LoginState } from '@omne-harness/client-assembly/cordis'
import type { HostBridge } from '../../shared/host-bridge.ts'
import type { Connectivity } from '../connectivity.ts'
import type { ClientTree } from '../tree.ts'
import { useServices, useSource, type Source } from './hooks.ts'

/**
 * What a region may ask of the shell: show a short label of the current tenant in the top bar, and
 * lay out the workspace's views with a switch between them.
 */
export type ShellChrome = Readonly<{
  setScope(label: ScopeLabel | undefined): void
  views(views: readonly WorkspaceView[]): ReactNode
}>
export type ScopeLabel = Readonly<{ short: string; full: string }>

/** One view of the workspace. Its tab shows only while all its services are on the tree. */
export type WorkspaceView = Readonly<{
  id: string
  title: string
  services: readonly string[]
  render(services: readonly unknown[]): ReactNode
}>

export type Region = Readonly<{
  /** The tree services this region needs; it is shown only while all are there. */
  services: readonly string[]
  render(services: readonly unknown[], chrome: ShellChrome): ReactNode
}>

export type ShellProps = Readonly<{
  appName: string
  bridge: HostBridge
  tree: ClientTree
  connectivity: Source<Connectivity>
  /** Shown while signed out: the login gate. */
  gate: Region
  /** Shown while signed in. */
  workspace: Region
}>

const CONNECTIVITY_TEXT: Readonly<Record<Connectivity, string>> = {
  connecting: '正在连接',
  connected: '已连接',
  disconnected: '连不上服务',
}

function Unavailable() {
  return (
    <div className="notice" role="status">
      <p className="notice-title">这项能力暂时不可用</p>
      <p className="notice-detail">服务端现在没有开放它。开放之后这里会自动出现。</p>
    </div>
  )
}

function RegionView(props: { region: Region; tree: ClientTree; chrome: ShellChrome }) {
  const values = useServices(props.tree, props.region.services)
  if (values.some(value => value === undefined)) return <Unavailable />
  return <>{props.region.render(values, props.chrome)}</>
}

/**
 * The workspace's views, one tab each, the first one chosen at the start. Every open view stays
 * mounted and the others are only hidden, so looking at one view does not stop the work of another.
 */
function ViewSwitch(props: { tree: ClientTree; views: readonly WorkspaceView[] }) {
  const names = [...new Set(props.views.flatMap(view => view.services))]
  const values = useServices(props.tree, names)
  const [chosen, setChosen] = useState(props.views[0]?.id)
  const open = props.views.flatMap(view => {
    const services = view.services.map(name => values[names.indexOf(name)])
    return services.every(value => value !== undefined) ? [{ view, services }] : []
  })
  const first = open[0]
  if (first === undefined) return <Unavailable />
  const shown = open.some(({ view }) => view.id === chosen) ? chosen : first.view.id
  return (
    <div className="views">
      <nav className="view-tabs" role="tablist">
        {open.map(({ view }) => (
          <button
            key={view.id}
            type="button"
            role="tab"
            className="view-tab"
            aria-selected={view.id === shown}
            onClick={() => setChosen(view.id)}
          >
            {view.title}
          </button>
        ))}
      </nav>
      {open.map(({ view, services }) => (
        <section key={view.id} className="view" role="tabpanel" hidden={view.id !== shown}>
          {view.render(services)}
        </section>
      ))}
    </div>
  )
}

export function Shell(props: ShellProps) {
  const loginSource = useMemo<Source<LoginState>>(
    () => ({
      current: () => props.bridge.loginState.state(),
      subscribe: listener => props.bridge.loginState.subscribe(listener),
    }),
    [props.bridge],
  )
  const login = useSource(loginSource)
  const connectivity = useSource(props.connectivity)
  const [scope, setScope] = useState<ScopeLabel | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const chrome = useMemo<ShellChrome>(
    () => ({ setScope, views: views => <ViewSwitch tree={props.tree} views={views} /> }),
    [props.tree],
  )

  const signOut = useCallback(async () => {
    setNotice(undefined)
    const result = await props.bridge.logout()
    setScope(undefined)
    if (result === 'unknown') setNotice('本机已经退出。服务端是否已注销这次登录，没有得到确认。')
  }, [props.bridge])

  const signedIn = login === 'signed-in'
  return (
    <div className="app">
      <header className="top-bar">
        <span className="app-name">{props.appName}</span>
        <span className={`connectivity connectivity-${connectivity}`} role="status">
          <span className="dot" aria-hidden="true" />
          {CONNECTIVITY_TEXT[connectivity]}
        </span>
        <span className="spacer" />
        {signedIn && scope !== undefined ? (
          <span className="scope" title={scope.full}>
            租户 {scope.short}
          </span>
        ) : null}
        {signedIn ? (
          <button type="button" className="button button-quiet" onClick={() => void signOut()}>
            退出登录
          </button>
        ) : null}
      </header>
      {connectivity === 'disconnected' ? (
        <div className="banner" role="alert">
          连不上服务。正在按间隔重新连接……
        </div>
      ) : null}
      <main className="content">
        {signedIn ? (
          <RegionView region={props.workspace} tree={props.tree} chrome={chrome} />
        ) : login === 'signing-out' ? (
          <div className="notice" role="status">
            <p className="notice-title">正在退出……</p>
          </div>
        ) : (
          <div className="gate">
            {notice !== undefined ? <p className="gate-notice">{notice}</p> : null}
            <RegionView region={props.gate} tree={props.tree} chrome={chrome} />
          </div>
        )}
      </main>
    </div>
  )
}
