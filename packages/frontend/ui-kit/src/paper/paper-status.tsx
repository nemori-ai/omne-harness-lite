import { useLayoutEffect, useRef } from 'react'

import { cn } from '../lib/utils.ts'
import { type DataAttributes } from '../patterns/ai/data-attributes.ts'

const given = (info: React.ReactNode): boolean =>
  info !== undefined && info !== null && info !== false && info !== ''

export function PaperStatus({
  tools,
  info,
  className,
  ...data
}: DataAttributes & {
  readonly tools?: React.ReactNode
  readonly info?: React.ReactNode
  readonly className?: string
}): React.JSX.Element {
  const present = given(info)
  const kept = useRef<React.ReactNode>(null)
  useLayoutEffect(() => {
    if (present) kept.current = info
  })
  return (
    <div {...data} data-slot="paper-status" className={cn('omne-paper-status', className)}>
      {tools === undefined ? null : (
        <div data-slot="paper-status-tools" className="omne-paper-status-tools">
          {tools}
        </div>
      )}
      <div
        data-slot="paper-status-info"
        data-empty={present ? undefined : ''}
        aria-hidden={present ? undefined : true}
        className="omne-paper-status-info"
      >
        {present ? info : kept.current}
      </div>
    </div>
  )
}
