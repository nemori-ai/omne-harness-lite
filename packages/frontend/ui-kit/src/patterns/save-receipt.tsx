import { useRef } from 'react'

import { useArrival, useSettleCue } from '../motion/motion.ts'
import { StateWord } from './ai/state-word.tsx'
import { DoneIcon } from '../icons/index.ts'

export function SaveReceipt({
  at,
  className,
}: {
  readonly at: number | string | undefined
  readonly className?: string
}): React.JSX.Element | null {
  return at === undefined ? null : <SavedWord at={at} className={className} />
}

function SavedWord({
  at,
  className,
}: {
  readonly at: number | string
  readonly className?: string | undefined
}): React.JSX.Element {
  const node = useRef<HTMLSpanElement>(null)
  useArrival(node)
  useSettleCue(node, at)
  return (
    <span ref={node} role="status" className={className} data-testid="save-receipt">
      <StateWord state="saved" icon={DoneIcon} />
    </span>
  )
}
