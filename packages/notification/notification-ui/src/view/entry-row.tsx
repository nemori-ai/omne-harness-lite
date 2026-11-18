import { Ago, Button, InlineNotice, LoadingState } from '@omne-harness/ui-kit'
import { encodeInstant } from '@omne-harness/utc-instant'
import type { JSX } from 'react'
import type { InboxDriver } from '../model/inbox-driver.ts'
import {
  keyOf,
  type Entry,
  type MarkOperation,
  type Notice,
  type Opened,
  type State,
} from '../model/inbox-machine.ts'

const LEVEL = { strong: '强提醒', weak: '弱提醒' } as const

const NOTICE: Readonly<Record<Notice, string>> = {
  'restore-first': '这一条已经办完或划掉了，要先恢复才能改。',
  superseded: '这一条已经被更新的一条顶替了。',
  gone: '这一条已经不在收件箱里了。',
  unavailable: '现在办不了，这一条没有变。稍后再试。',
  unknown: '不确定有没有办成，正在重新读取列表。',
  denied: '没有权限处置这一条，或登录已失效。',
}

/** What a person can do to a notification in the state its marks say. */
function actionsOf(entry: Entry): readonly (readonly [MarkOperation, string])[] {
  if (entry.marks.supersededBy !== null) return []
  if (entry.marks.resolved !== null) return [['restore', '恢复']]
  return [
    ['done', '办完'],
    ['dismiss', '划掉'],
  ]
}

function stateOf(entry: Entry): string | null {
  if (entry.marks.supersededBy !== null) return '已被顶替'
  if (entry.marks.resolved !== null)
    return entry.marks.resolved.how === 'done' ? '已办完' : '已划掉'
  return entry.marks.seenAt === null ? '未读' : null
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
    </div>
  )
}

export type EntryRowProps = Readonly<{ entry: Entry; state: State; driver: InboxDriver }>

export function EntryRow({ entry, state, driver }: EntryRowProps): JSX.Element {
  const key = keyOf(entry)
  const busy = key in state.marking
  const notice = state.notices[key]
  const opened = state.opened?.key === key ? state.opened : null
  const label = stateOf(entry)
  return (
    <li className="notification-row">
      <div className="notification-line">
        <Button
          variant="link"
          aria-expanded={opened !== null}
          onClick={() => (opened === null ? driver.open(key) : driver.close())}
        >
          {entry.title}
        </Button>
        <span className="notification-meta">
          {entry.source} · {LEVEL[entry.level]} · <Ago at={encodeInstant(entry.acceptedAt)} />
          {label === null ? null : ` · ${label}`}
        </span>
        <span className="notification-actions">
          {actionsOf(entry).map(([operation, text]) => (
            <Button
              key={operation}
              variant="outline"
              size="compact"
              disabled={busy}
              onClick={() => driver.mark(key, operation)}
            >
              {text}
            </Button>
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
