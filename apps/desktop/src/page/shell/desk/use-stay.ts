import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from 'react'
import type { FigureControl, FigureHand } from '@omne-harness/ui-kit'
import type { SceneFigure } from '../../desk/scene.ts'
import type { FigureDevice } from './device.ts'
import { figureLink } from './link.ts'
import type { LookFeed } from './look.ts'
import type { ShellNote } from '../say-note.ts'
import { PAGE_CLOCK, pageFigureSize, pageLook, watchPage } from './page-look.ts'
import type { Stay, StayDeps } from './stay.ts'

const nothing = () => undefined

type Moment = SceneFigure['moment']

const momentOf = (
  kind: NonNullable<Moment>['kind'] | undefined,
  serial: number | undefined,
): Moment => (kind === undefined || serial === undefined ? undefined : { kind, serial })

/** A page's hook over a way to make its stay: made once the shell's note is there, given the login and the merged figure, dropped on unmount. */
export function stayHook(create: (deps: StayDeps) => Stay) {
  return function useStay(
    device: FigureDevice,
    control: RefObject<FigureControl | null>,
    signedIn: boolean,
    figure: SceneFigure,
    scope: Readonly<{ get(): string | undefined }>,
    changes: LookFeed,
    note: ShellNote | null,
  ): Readonly<{ away: boolean; hand: (hand: FigureHand) => boolean; recall: () => void }> {
    const [stay, setStay] = useState<Stay | null>(null)
    useEffect(() => {
      if (note === null) return undefined
      const made = create({
        device,
        link: figureLink(),
        control: () => control.current,
        size: pageFigureSize,
        look: pageLook,
        watch: watchPage,
        clock: PAGE_CLOCK,
        scope: () => scope.get(),
        changes,
        note,
      })
      setStay(made)
      return () => made.dispose()
    }, [device, control, scope, changes, note])
    useEffect(() => stay?.signedIn(signedIn), [stay, signedIn])
    const { doing, moment, waiting } = figure
    const kind = moment?.kind
    const serial = moment?.serial
    useEffect(
      () => stay?.figure({ doing, moment: momentOf(kind, serial), waiting }),
      [stay, doing, kind, serial, waiting],
    )
    const subscribe = useCallback(
      (listener: () => void) => stay?.subscribe(listener) ?? nothing,
      [stay],
    )
    const away = useSyncExternalStore(subscribe, () => stay?.away() ?? false)
    return {
      away,
      hand: hand => stay?.hand(hand) ?? false,
      recall: () => stay?.recall(),
    }
  }
}
