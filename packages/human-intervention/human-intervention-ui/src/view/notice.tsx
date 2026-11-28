import { InlineNotice, type NoticeAction } from '@omne-harness/ui-kit'
import type { JSX } from 'react'
import type { Notice } from '../model/cards-machine.ts'

// A card closed elsewhere and a result not known are neutral: neither is a failure (the tone table of the SPEC).
const TONE = {
  done: 'neutral',
  refused: 'danger',
  unavailable: 'caution',
  unknown: 'neutral',
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
