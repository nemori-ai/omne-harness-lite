import type { CanvasBody, CanvasKindBody } from '@omne-harness/canvas-protocol'
import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import { InlineNotice, LoadingState, RetryIcon } from '@omne-harness/ui-kit'
import { useEffect, useState, type JSX } from 'react'
import {
  READING,
  UNREADABLE_TEXT,
  readKinds,
  readLook,
  type CanvasClient,
  type Reading,
} from '../model/reading.ts'
import { canvasPaper, canvasView } from '../parts.ts'

export type CanvasBackProps = Readonly<{ client: CanvasClient; tenant: string }>

type Reads = Readonly<{
  look: Reading<CanvasBody>
  kinds: Reading<readonly CanvasKindBody[]>
}>

const UNREAD: Reads = { look: READING, kinds: READING }

function useReads(client: CanvasClient, tenant: TenantId, round: number): Reads {
  const [reads, set] = useState<Reads>(UNREAD)
  useEffect(() => {
    let live = true
    set(UNREAD)
    void readLook(client, tenant).then(look => live && set(last => ({ ...last, look })))
    void readKinds(client, tenant).then(kinds => live && set(last => ({ ...last, kinds })))
    return () => {
      live = false
    }
  }, [client, tenant, round])
  return reads
}

/** The back of the application: the sheet of the tenant's canvas, as large as the server says it is. */
export function CanvasBack({ client, tenant }: CanvasBackProps): JSX.Element {
  const owner = readTenantText(tenant)
  return (
    <div className="canvas-view" aria-label="画布" tabIndex={0} {...canvasView.props}>
      {owner === undefined ? (
        <InlineNotice tone="neutral">读不懂当前的租户。</InlineNotice>
      ) : (
        <Canvas client={client} tenant={owner} />
      )}
    </div>
  )
}

function Canvas({ client, tenant }: Readonly<{ client: CanvasClient; tenant: TenantId }>) {
  const [round, reread] = useState(0)
  const { look } = useReads(client, tenant, round)
  switch (look.kind) {
    case 'reading':
      return <LoadingState label="正在读画布……" />
    case 'unreadable':
      return (
        <InlineNotice
          tone="neutral"
          action={{ label: '重试', icon: RetryIcon, onClick: () => reread(value => value + 1) }}
        >
          {UNREADABLE_TEXT[look.reason]}
        </InlineNotice>
      )
    case 'read':
      return <Sheet canvas={look.value} />
  }
}

function Sheet({ canvas }: Readonly<{ canvas: CanvasBody }>): JSX.Element {
  const { width, height } = canvas.sheet
  return (
    <div
      className="canvas-paper"
      role="img"
      aria-label={`纸，宽 ${String(width)}，高 ${String(height)}`}
      style={{
        width: `calc(${String(width)}px * var(--omne-size))`,
        height: `calc(${String(height)}px * var(--omne-size))`,
      }}
      {...canvasPaper.props}
    />
  )
}
