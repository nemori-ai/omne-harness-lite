import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import type { BlockRead, BlockReads } from '../model/block-reads.ts'

type ReadBlockProps = Readonly<{
  reads: BlockReads
  tenant: string | undefined
  session: string
  revision: string | null
  message: string
  block: string
  draw: (read: BlockRead | undefined) => ReactNode
}>

/** A block drawn with what the model read of it, read again when the log of the session moves. */
export function ReadBlock({
  reads,
  tenant,
  session,
  revision,
  message,
  block,
  draw,
}: ReadBlockProps) {
  const version = useSyncExternalStore(reads.subscribe, reads.version)
  useEffect(() => {
    if (tenant !== undefined) reads.want(tenant, session, revision)
  }, [reads, tenant, session, revision, version])
  return draw(tenant === undefined ? undefined : reads.readOf(tenant, session, message, block))
}
