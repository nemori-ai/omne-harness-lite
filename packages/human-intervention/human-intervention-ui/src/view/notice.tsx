import { InlineNotice, type NoticeAction } from '@omne-harness/ui-kit'
import type { JSX } from 'react'
import type { Notice } from '../model/cards-machine.ts'

const TONE = {
  done: 'good',
  refused: 'danger',
  unavailable: 'caution',
  unknown: 'caution',
} as const

export function NoticeLine({
  notice,
  action,
}: {
  readonly notice: Notice
  readonly action?: NoticeAction | undefined
}): JSX.Element {
  return (
    <InlineNotice
      tone={TONE[notice.kind]}
      role={notice.kind === 'refused' ? 'alert' : 'status'}
      {...(action === undefined ? {} : { action })}
    >
      <p>{notice.text}</p>
    </InlineNotice>
  )
}
