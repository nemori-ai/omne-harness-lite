import { useArrival } from '@omne-harness/ui-kit'
import { useRef, useState, type ReactNode } from 'react'

export interface Publication {
  readonly epoch: string
  readonly keys: readonly string[] | null
  readonly arrivals: ReadonlySet<string>
}

const NONE: ReadonlySet<string> = new Set()

export function unpublished(epoch: string): Publication {
  return { epoch, keys: null, arrivals: NONE }
}

export function publish(
  previous: Publication,
  keys: readonly string[],
  loaded: boolean,
  epoch: string,
): Publication {
  if (epoch !== previous.epoch) return { epoch, keys: loaded ? keys : null, arrivals: NONE }
  if (previous.keys === null) return loaded ? { epoch, keys, arrivals: NONE } : previous
  if (
    previous.keys.length === keys.length &&
    previous.keys.every((key, index) => key === keys[index])
  )
    return previous
  const known = new Set(previous.keys)
  const firstKnown = keys.findIndex(key => known.has(key))
  const arrivals = new Set(keys.filter((key, index) => !known.has(key) && index > firstKnown))
  return { epoch, keys, arrivals }
}

export function usePublication(
  epoch: string,
  keys: readonly string[],
  loaded: boolean,
): Publication {
  const [held, setHeld] = useState(() => publish(unpublished(epoch), keys, loaded, epoch))
  const next = publish(held, keys, loaded, epoch)
  if (next !== held) setHeld(next)
  return next
}

export function TranscriptRow({
  arriving,
  entry,
  found = false,
  children,
}: {
  readonly arriving: boolean
  /** The history entry this row shows, and whether it is the one a jump asked for. */
  readonly entry?: string
  readonly found?: boolean
  readonly children: ReactNode
}) {
  const node = useRef<HTMLDivElement>(null)
  useArrival(node, { still: !arriving })
  return (
    <div ref={node} className="omne-transcript-row" data-entry={entry} data-found={found}>
      {children}
    </div>
  )
}
