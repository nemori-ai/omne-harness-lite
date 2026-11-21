import {
  Ago,
  Button,
  CloseIcon,
  DoneIcon,
  IconButton,
  InlineNotice,
  LoadingIndicator,
  LoadingState,
  UndoIcon,
  type Icon,
} from '@omne-harness/ui-kit'
import { encodeInstant } from '@omne-harness/utc-instant'
import { useEffect, useRef, type JSX } from 'react'
import type { InboxDriver } from '../model/inbox-driver.ts'
import {
  isOpen,
  keyOf,
  type Entry,
  type MarkOperation,
  type Notice,
  type Opened,
  type State,
} from '../model/inbox-machine.ts'

const NOTICE: Readonly<Record<Notice, string>> = {
  'restore-first': '这一条已经办完或划掉了，要先恢复才能改。',
  superseded: '这一条已经被更新的一条顶替了。',
  gone: '这一条已经不在收件箱里了。',
  unavailable: '现在办不了，这一条没有变。稍后再试。',
  unknown: '不确定有没有办成，正在重新读取列表。',
  denied: '没有权限处置这一条，或登录已失效。',
}

type Action = readonly [operation: MarkOperation, name: string, glyph: Icon]

/** What a person can do to a notification in the state its marks say: icon buttons, named in their tooltips. */
function actionsOf(entry: Entry): readonly Action[] {
  if (entry.marks.supersededBy !== null) return []
  if (entry.marks.resolved !== null) return [['restore', '恢复', UndoIcon]]
  return [
    ['done', '办完', DoneIcon],
    ['dismiss', '划掉', CloseIcon],
  ]
}

/** The settled state a row names after its source and time; an open one names none. */
function stateOf(entry: Entry): string | null {
  if (entry.marks.supersededBy !== null) return '已被顶替'
  if (entry.marks.resolved !== null)
    return entry.marks.resolved.how === 'done' ? '已办完' : '已划掉'
  return null
}

/** Strong, not yet seen and still open: the one kind of row that starts with a dot of strong ink. */
const isFresh = (entry: Entry): boolean =>
  entry.level === 'strong' && entry.marks.seenAt === null && isOpen(entry)

type Cause = Entry['cause']
type Scope = Extract<Cause, { kind: 'subscription' }>['scope']

function scopeText(scope: Scope): string {
  switch (scope.kind) {
    case 'all':
      return '这一类的全部'
    case 'subject':
      return `对象是 ${scope.equals}`
    case 'subject-prefix':
      return `对象以 ${scope.prefix} 开头`
  }
}

/** Why a notification reached the person, as it was decided when the send was accepted. */
function causeText(cause: Cause): string {
  switch (cause.kind) {
    case 'named':
      return '点名发给你'
    case 'type-default':
      return '这类事件缺省发给你'
    case 'subscription': {
      const matched = `命中了你的订阅（${scopeText(cause.scope)}）`
      return cause.note === null ? matched : `${matched}。备注：${cause.note}`
    }
  }
}

function Detail({ opened }: { readonly opened: Opened }): JSX.Element {
  const { view } = opened
  if (view === 'reading') return <LoadingState label="正在读取……" />
  if (view === 'gone')
    return (
      <InlineNotice tone="caution" role="status">
        <p>这一条已经不在收件箱里了。</p>
      </InlineNotice>
    )
  if (view === 'unavailable')
    return (
      <InlineNotice tone="caution" role="status">
        <p>正文现在读不出，稍后再试。</p>
      </InlineNotice>
    )
  return (
    <div className="notification-detail">
      {view.subject === null ? null : <p className="notification-meta">对象：{view.subject}</p>}
      {view.body === '' ? (
        <p className="notification-meta">这一条没有正文。</p>
      ) : (
        <p className="notification-body">{view.body}</p>
      )}
      {view.locator === null ? null : (
        <p className="notification-meta">
          去处：{view.locator.kind} {view.locator.ref}
        </p>
      )}
      <p className="notification-meta">缘由：{causeText(view.cause)}</p>
    </div>
  )
}

export type EntryRowProps = Readonly<{
  entry: Entry
  state: State
  driver: InboxDriver
  focused?: boolean
}>

export function EntryRow({ entry, state, driver, focused = false }: EntryRowProps): JSX.Element {
  const row = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (focused) row.current?.scrollIntoView({ block: 'nearest' })
  }, [focused])
  const key = keyOf(entry)
  const marking = state.marking[key]
  const notice = state.notices[key]
  const opened = state.opened?.key === key ? state.opened : null
  const label = stateOf(entry)
  return (
    <li ref={row} className="notification-row" data-focused={focused ? '' : undefined}>
      <div className="notification-line">
        {isFresh(entry) ? <span className="notification-dot" aria-hidden="true" /> : null}
        <Button
          variant="link"
          className="notification-title"
          aria-expanded={opened !== null}
          onClick={() => (opened === null ? driver.open(key) : driver.close())}
        >
          {entry.title}
        </Button>
        <span className="notification-meta">
          {entry.source} · {entry.type} · <Ago at={encodeInstant(entry.acceptedAt)} />
          {label === null ? null : ` · ${label}`}
        </span>
        <span className="notification-actions">
          {actionsOf(entry).map(([operation, name, Glyph]) => (
            <IconButton
              key={operation}
              label={name}
              size="icon-compact"
              aria-busy={marking === operation || undefined}
              onClick={() => driver.mark(key, operation)}
            >
              {marking === operation ? (
                <LoadingIndicator size="sm" />
              ) : (
                <Glyph aria-hidden="true" />
              )}
            </IconButton>
          ))}
        </span>
      </div>
      {notice === undefined ? null : (
        <InlineNotice tone={notice === 'denied' ? 'danger' : 'caution'} role="status">
          <p>{NOTICE[notice]}</p>
        </InlineNotice>
      )}
      {opened === null ? null : <Detail opened={opened} />}
    </li>
  )
}
