import type { JSX } from 'react'
import type { Notice } from '../model/session-machine.ts'

export function NoticeLine({
  notice,
  action,
}: {
  readonly notice: Notice
  readonly action?: JSX.Element | undefined
}) {
  return (
    <p
      className="omne-notice"
      data-kind={notice.kind}
      role={notice.kind === 'unknown' ? 'status' : 'alert'}
    >
      <span>{notice.text}</span>
      {action ?? null}
    </p>
  )
}
