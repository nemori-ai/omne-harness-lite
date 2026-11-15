import { useEffect, useRef, useState } from 'react'

import { IconButton } from '../icon-button.tsx'
import { CopyIcon, DoneIcon } from '../../icons/index.ts'

const CONFIRMATION_MS = 1500

export function CopyButton({
  value,
  label,
  copiedLabel,
  failedLabel,
  size,
  className,
}: {
  readonly value: string

  readonly label: string

  readonly copiedLabel: string

  readonly failedLabel?: string

  readonly size?: 'icon' | 'icon-compact'
  readonly className?: string
}): React.JSX.Element {
  const revert = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [outcome, setOutcome] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    return () => clearTimeout(revert.current)
  }, [])

  const copy = async (): Promise<void> => {
    let copied = false
    try {
      await navigator.clipboard.writeText(value)
      copied = true
    } catch {
      copied = false
    }
    setOutcome(copied ? 'copied' : 'failed')
    clearTimeout(revert.current)
    revert.current = setTimeout(() => setOutcome('idle'), CONFIRMATION_MS)
  }

  const name =
    outcome === 'copied' ? copiedLabel : outcome === 'failed' ? (failedLabel ?? label) : label

  return (
    <IconButton
      label={name}
      {...(size !== undefined && { size })}
      className={className}
      onClick={() => void copy()}
    >
      {outcome === 'copied' ? <DoneIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
    </IconButton>
  )
}
