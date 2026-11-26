import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from 'react'
import type { FigureControl, FigureHand } from '@omne-harness/ui-kit'
import type { ShellSlots } from '@omne-harness/shell-contract'
import type { SceneFigure } from '../../desk/scene.ts'
import type { FigureDevice } from './device.ts'
import { figureLink } from './link.ts'
import type { LookFeed } from './look.ts'
import { PAGE_CLOCK, pageFigureSize, pageLook, watchPage } from './page-look.ts'
import type { Stay, StayDeps } from './stay.ts'

const nothing = () => undefined

type Moment = SceneFigure['moment']

const momentOf = (
  kind: NonNullable<Moment>['kind'] | undefined,
  serial: number | undefined,
): Moment => (kind === undefined || serial === undefined ? undefined : { kind, serial })

/** A page's hook over a way to make its stay: made on mount, given the login and the merged figure, dropped on unmount. */
export function stayHook(create: (deps: StayDeps) => Stay) {
  return function useStay(
    device: FigureDevice,
    control: RefObject<FigureControl | null>,
    signedIn: boolean,
    figure: SceneFigure,
    slots: ShellSlots,
    scope: Readonly<{ get(): string | undefined }>,
    changes: LookFeed,
  ): Readonly<{ away: boolean; hand: (hand: FigureHand) => boolean; recall: () => void }> {
    const [stay, setStay] = useState<Stay | null>(null)
    useEffect(() => {
      const made = create({
        device,
        link: figureLink(),
        control: () => control.current,
        size: pageFigureSize,
        look: pageLook,
        watch: watchPage,
        clock: PAGE_CLOCK,
        slots,
        scope: () => scope.get(),
        changes,
      })
      setStay(made)
      return () => made.dispose()
    }, [device, control, slots, scope, changes])
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
