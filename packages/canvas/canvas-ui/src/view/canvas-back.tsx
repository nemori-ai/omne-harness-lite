import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import { IconButton, InlineNotice, LoadingState, RetryIcon, TurnIcon } from '@omne-harness/ui-kit'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type JSX } from 'react'
import { CanvasDriver } from '../model/canvas-driver.ts'
import type { CanvasPreferences } from '../model/preferences.ts'
import { UNREADABLE_TEXT, type CanvasClient } from '../model/reading.ts'
import { canvasView } from '../parts.ts'
import type { CanvasHost } from './element.tsx'
import type { Place } from './sheet-layers.tsx'
import { SheetView } from './sheet-view.tsx'

/** Calls the listener when the kinds the server makes public may have changed. */
export type KindsFollow = (listener: () => void) => () => void

export type CanvasBackProps = Readonly<{
  client: CanvasClient
  tenant: string
  host: CanvasHost
  preferences: CanvasPreferences
  followKinds?: KindsFollow
  /** The shell's turn to the front, drawn as the mark in the corner. */
  turn: () => void
  /** The shell's home on the front, pressed through the seat of the figure. */
  home: () => void
}>

/** The back of the application: the tenant's canvas, as the server last said it is. */
export function CanvasBack(props: CanvasBackProps): JSX.Element {
  const owner = useMemo(() => readTenantText(props.tenant), [props.tenant])
  return (
    <div className="canvas-view" aria-label="画布" {...canvasView.props}>
      {owner === undefined ? (
        <InlineNotice tone="neutral">读不懂当前的租户。</InlineNotice>
      ) : (
        <Canvas key={props.tenant} {...props} owner={owner} />
      )}
      <IconButton label="翻到正面" className="canvas-turn" onClick={() => props.turn()}>
        <TurnIcon aria-hidden="true" />
      </IconButton>
    </div>
  )
}

function Canvas({ client, owner, ...rest }: CanvasBackProps & Readonly<{ owner: TenantId }>) {
  const [driver, setDriver] = useState<CanvasDriver | undefined>(undefined)
  useEffect(() => {
    const made = new CanvasDriver({ client, tenant: owner })
    setDriver(made)
    made.start()
    return () => made.dispose()
  }, [client, owner])
  return driver === undefined ? (
    <LoadingState label="正在读画布……" />
  ) : (
    <Driven driver={driver} {...rest} />
  )
}

function Driven({
  driver,
  tenant,
  host,
  preferences,
  followKinds,
  home,
}: Omit<CanvasBackProps, 'client' | 'turn'> & Readonly<{ driver: CanvasDriver }>) {
  const state = useSyncExternalStore(driver.subscribe, driver.getState)
  const place = useCallback<Place>(
    (reference, near, size) => driver.place(reference, near, size),
    [driver],
  )
  const lookAway = useCallback(
    (limit: number, before?: number) => driver.lookAway(limit, before),
    [driver],
  )
  useEffect(() => followKinds?.(() => driver.rereadKinds()), [driver, followKinds])
  const { look, kinds } = state
  if (look.kind === 'reading') return <LoadingState label="正在读画布……" />
  if (look.kind === 'unreadable')
    return (
      <InlineNotice
        tone="neutral"
        action={{ label: '重试', icon: RetryIcon, onClick: () => void driver.reread() }}
      >
        {UNREADABLE_TEXT[look.reason]}
      </InlineNotice>
    )
  if (kinds.kind === 'reading') return <LoadingState label="正在读画布……" />
  return (
    <SheetView
      host={host}
      scope={tenant}
      canvas={look.value}
      state={state}
      preferences={preferences}
      send={command => void driver.send(command)}
      place={place}
      lookAway={lookAway}
      dismiss={() => driver.dismiss()}
      home={home}
    />
  )
}
