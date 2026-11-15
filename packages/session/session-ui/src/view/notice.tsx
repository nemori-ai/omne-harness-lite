import { InlineNotice, type NoticeAction } from '@omne-harness/ui-kit'
import type { Notice } from '../model/session-machine.ts'

const TONE = { refused: 'danger', unavailable: 'caution', unknown: 'info' } as const

export function NoticeLine({
  notice,
  action,
}: {
  readonly notice: Notice
  readonly action?: NoticeAction | undefined
}) {
  return (
    <InlineNotice
      tone={TONE[notice.kind]}
      role={notice.kind === 'unknown' ? 'status' : 'alert'}
      {...(action === undefined ? {} : { action })}
    >
      {notice.text}
    </InlineNotice>
  )
}
