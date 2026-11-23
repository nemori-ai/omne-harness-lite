import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { hasCalls, type BackgroundCallsStore } from '../model/background-calls.ts'
import type { SessionFigure } from '../model/figure.ts'
import type { SessionDriver } from '../model/session-driver.ts'
import type { SessionWorkspaces } from '../model/session-workspaces.ts'
import { useSession } from './use-session.ts'

type FigureReportProps = Readonly<{
  workspaces: SessionWorkspaces
  scope: string | undefined
  background: BackgroundCallsStore
  figure: SessionFigure
}>

/** Draws nothing: tells the figure what the session the conversation page holds is doing. */
export function FigureReport({ workspaces, scope, background, figure }: FigureReportProps) {
  const handle = useSession(workspaces, scope)
  if (handle.kind !== 'ready' || scope === undefined) return <Leave figure={figure} />
  return <Follow driver={handle.driver} tenant={scope} background={background} figure={figure} />
}

function Leave({ figure }: { readonly figure: SessionFigure }) {
  useEffect(() => figure.leave(), [figure])
  return null
}

export function useInBackground(
  store: BackgroundCallsStore,
  tenant: string,
  session: string | null,
) {
  const subscribe = useCallback(
    (listener: () => void) =>
      session === null ? () => undefined : store.subscribe(tenant, session, listener),
    [store, tenant, session],
  )
  return useSyncExternalStore(
    subscribe,
    () => session !== null && hasCalls(store.read(tenant, session)),
  )
}

function Follow({
  driver,
  tenant,
  background,
  figure,
}: {
  readonly driver: SessionDriver
  readonly tenant: string
  readonly background: BackgroundCallsStore
  readonly figure: SessionFigure
}) {
  const { session: state } = useSyncExternalStore(driver.subscribe, driver.getState)
  const running = useInBackground(background, tenant, state.kind === 'open' ? state.session : null)
  useEffect(() => figure.follow(state, running), [figure, state, running])
  useEffect(() => () => figure.leave(), [figure])
  return null
}
