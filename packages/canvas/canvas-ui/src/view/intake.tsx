import {
  CloseIcon,
  IconButton,
  InlineNotice,
  PaperSpot,
  type PaperPoint,
} from '@omne-harness/ui-kit'
import { useEffect, useMemo, useState, type JSX, type ReactNode } from 'react'
import { CANVAS_INTAKE, canvasIntake, type CanvasPlacing, type CanvasReference } from '../points.ts'
import { inConflict, OneThing, type CanvasHost } from './element.tsx'
import type { PlaceNear } from './sheet-layers.tsx'

/** Files dropped on the sheet, and where. */
export type Dropped = Readonly<{ id: string; at: PaperPoint; files: readonly File[] }>

/** How long a handing in that went whole stays after `done()`. */
export const INTAKE_STAYS_MS = 4000

const FILES = 'files'

type Tally = Readonly<{ asked: number; answered: number; why: string | undefined; done: boolean }>

export type IntakeProps = Readonly<{
  host: CanvasHost
  scope: string
  round: number
  dropped: Dropped
  /** Puts a reference near a spot: here, where the files were dropped. */
  placeNear: (near: PaperPoint) => PlaceNear
  close: () => void
}>

/** Where files were dropped: the intake put on `files` draws them; it stays while one did not go on the sheet. */
export function IntakeSpot(props: IntakeProps): JSX.Element {
  const { host, scope, round, dropped, placeNear, close } = props
  const [tally, setTally] = useState<Tally>({ asked: 0, answered: 0, why: undefined, done: false })
  const subject = useMemo(
    () => ({
      files: dropped.files,
      place(reference: CanvasReference, placing?: CanvasPlacing) {
        setTally(was => ({ ...was, asked: was.asked + 1 }))
        void placeNear(dropped.at)(reference, placing).then(placed =>
          setTally(was => ({
            ...was,
            answered: was.answered + 1,
            why: placed.kind === 'not' ? placed.why : was.why,
          })),
        )
      },
      done: () => setTally(was => ({ ...was, done: true })),
    }),
    [dropped, placeNear],
  )
  const whole =
    tally.done &&
    tally.why === undefined &&
    tally.answered === tally.asked &&
    tally.asked >= dropped.files.length
  useEffect(() => {
    if (!whole) return undefined
    const timer = setTimeout(close, INTAKE_STAYS_MS)
    return () => clearTimeout(timer)
  }, [whole, close])
  const fallback = (): ReactNode => {
    const owners = inConflict(host, CANVAS_INTAKE, FILES, scope)
    return (
      <InlineNotice tone="neutral" role="status" onDismiss={close}>
        {owners === undefined
          ? '这类东西现在放不上来。'
          : `这类东西现在放不上来：有两份收法，互相冲突：${owners}。`}
      </InlineNotice>
    )
  }
  return (
    <PaperSpot at={dropped.at} className="canvas-intake">
      <OneThing again={round} fallback={fallback}>
        {canvasIntake.draw(host, FILES, subject, fallback)}
      </OneThing>
      {tally.why === undefined ? null : (
        <InlineNotice tone="caution" role="status">
          {tally.why}
        </InlineNotice>
      )}
      {tally.done ? (
        <IconButton label="收起" size="icon-compact" onClick={close}>
          <CloseIcon aria-hidden="true" />
        </IconButton>
      ) : null}
    </PaperSpot>
  )
}
