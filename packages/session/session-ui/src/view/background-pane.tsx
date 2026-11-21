import type { AttachedEntry } from '@omne-harness/shell-contract'
import {
  Button,
  CodeSurface,
  DisclosureContent,
  DisclosureTrigger,
  EmptyState,
  FactList,
  FactRow,
  InlineNotice,
  LoadingIndicator,
  LoadingState,
  StateWord,
  type StateLabel,
} from '@omne-harness/ui-kit'
import {
  useCallback,
  useContext,
  useId,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { BackgroundCallItem, BackgroundCallsStore } from '../model/background-calls.ts'
import { SideFrameContext } from './side-frame.tsx'
import { SidePanel, type SideEntry } from './side-panel.tsx'

export const BACKGROUND_CALLS = 'background-calls'

function useBackgroundCalls(store: BackgroundCallsStore, tenant: string, session: string) {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(tenant, session, listener),
    [store, tenant, session],
  )
  return useSyncExternalStore(subscribe, () => store.read(tenant, session))
}

/** Each state Tool reports, as the shared table names it; a stop under way is still work in progress. */
const STATE_WORD: Readonly<Record<BackgroundCallItem['status'], StateLabel>> = {
  queued: 'queued',
  running: 'working',
  'ended-pending': 'ended',
  stopping: 'working',
  unknown: 'unknown',
}

const WHO: Readonly<Record<string, string>> = { user: '你', agent: 'agent', system: '系统' }

/** The three steps of a stop, kept apart (I-3): a step reached has words, one not reached has none. */
function stopSteps(stop: NonNullable<BackgroundCallItem['stop']>) {
  const who = WHO[stop.initiator] ?? stop.initiator
  return [
    ['已请求', stop.reason === null ? who : `${who}：${stop.reason}`],
    ['已受理', stop.progress === 'requested' ? null : '工具'],
    ['已证实停下', stop.progress === 'proven' ? '工具' : null],
  ] as const
}

/** One call: a process row that unfolds in place; 停止 is the one action at its end. */
function CallRow({
  call,
  onStop,
  detail,
}: {
  readonly call: BackgroundCallItem
  readonly onStop: (call: BackgroundCallItem) => Promise<string>
  readonly detail: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const region = useId()
  const { tool, command, preview } = call.label
  const stoppable = call.stop === null && call.status !== 'ended-pending'
  const stop = (): void => {
    if (stopping) return
    setStopping(true)
    void onStop(call).then(text => {
      setSaid(text)
      setStopping(false)
    })
  }
  return (
    <li className="omne-background-call" data-call={call.id} data-status={call.status}>
      <div className="omne-background-call-row">
        <DisclosureTrigger
          open={open}
          controls={region}
          onToggle={() => setOpen(was => !was)}
          className="omne-background-call-trigger"
        >
          <span className="omne-background-call-id">{call.id}</span>
          <span className="omne-background-call-intent">
            {call.label.intent ?? '（没有写意图）'}
          </span>
          <StateWord state={STATE_WORD[call.status]} />
        </DisclosureTrigger>
        {stoppable ? (
          <Button variant="ghost" size="compact" aria-busy={stopping || undefined} onClick={stop}>
            {stopping ? <LoadingIndicator size="sm" /> : null}
            停止
          </Button>
        ) : null}
      </div>
      {said === null ? null : (
        <p className="omne-background-call-said" role="status">
          {said}
        </p>
      )}
      <div id={region}>
        <DisclosureContent open={open}>
          <div className="omne-background-call-detail">
            <p className="omne-background-call-action">
              {preview !== '' || command === null ? tool : `${tool} ${command}`}
            </p>
            {preview === '' ? null : <CodeSurface name={command ?? '预览'} text={preview} />}
            {call.stop === null ? null : (
              <FactList aria-label="停止的进度">
                {stopSteps(call.stop).map(([step, words]) => (
                  <FactRow key={step} term={step}>
                    {words}
                  </FactRow>
                ))}
              </FactList>
            )}
            {call.lastLine === null ? null : (
              <p className="omne-background-call-last">{call.lastLine}</p>
            )}
            {detail}
          </div>
        </DisclosureContent>
      </div>
    </li>
  )
}

const NEUTRAL = new Set(['denied', 'unknown'])

export function BackgroundPane({
  store,
  tenant,
  session,
  detail,
}: {
  readonly store: BackgroundCallsStore
  readonly tenant: string
  readonly session: string
  readonly detail: (call: string) => ReactNode
}) {
  const view = useBackgroundCalls(store, tenant, session)
  const onStop = (call: BackgroundCallItem) => store.stop(tenant, session, call)
  if (view.kind === 'unread') return <LoadingState label="正在读后台调用…" />
  if (view.kind === 'unreadable')
    return (
      <InlineNotice tone={NEUTRAL.has(view.reason) ? 'neutral' : 'caution'} detail={view.reason}>
        后台调用现在读不到。
      </InlineNotice>
    )
  return (
    <section className="omne-background-pane" aria-label="本会话的后台调用">
      {view.calls.length === 0 ? (
        <EmptyState title="没有在后台的调用。" />
      ) : (
        <ul className="omne-background-calls">
          {view.calls.map(call => (
            <CallRow
              key={call.id}
              call={call}
              onStop={onStop}
              detail={detail(call.producer.call)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/** One line of receipt weight above the composer while calls run in the background; it opens 后台. */
export function BackgroundHint({
  store,
  tenant,
  session,
}: {
  readonly store: BackgroundCallsStore
  readonly tenant: string
  readonly session: string
}) {
  const frame = useContext(SideFrameContext)
  const view = useBackgroundCalls(store, tenant, session)
  if (view.kind !== 'listed' || view.calls.length === 0) return null
  return (
    <Button
      variant="ghost"
      size="compact"
      className="omne-background-hint"
      aria-controls={frame?.sideId}
      // A click the keyboard made has no pointer count: then the bubble takes the focus, as from the figure.
      onClick={event => frame?.reveal(BACKGROUND_CALLS, event.detail === 0)}
    >
      后台有 {view.calls.length} 项在跑
    </Button>
  )
}

/** The side area of a session: the entries others placed, then 后台 while calls run there. */
export function SideWithBackground({
  entries,
  store,
  tenant,
  session,
  detail,
}: {
  readonly entries: readonly AttachedEntry[]
  readonly store: BackgroundCallsStore
  readonly tenant: string
  readonly session: string
  readonly detail: (call: string) => ReactNode
}) {
  const view = useBackgroundCalls(store, tenant, session)
  const count = view.kind === 'listed' ? view.calls.length : 0
  const pane = <BackgroundPane store={store} tenant={tenant} session={session} detail={detail} />
  const all: readonly SideEntry[] =
    count > 0 ? [...entries, { id: BACKGROUND_CALLS, label: '后台', count, node: pane }] : entries
  return <SidePanel entries={all} />
}
