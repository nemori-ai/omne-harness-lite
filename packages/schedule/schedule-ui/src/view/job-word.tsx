import { StateWord, StatusPill } from '@omne-harness/ui-kit'
import type { JSX } from 'react'
import type { Word } from '../model/jobs.ts'

/** Where a Job stands, in its pill. */
export function JobWord({ word }: Readonly<{ word: Word }>): JSX.Element {
  return (
    <StatusPill tone={word.tone}>
      {word.state === undefined ? word.word : <StateWord state={word.state} />}
    </StatusPill>
  )
}
