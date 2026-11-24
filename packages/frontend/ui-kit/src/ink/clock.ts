const frameClock = (): number =>
  /* wall-clock: operation-timing -- Ink strokes are timed on the frame clock; presentation only. */ performance.now()

let source: () => number = frameClock

export const inkClock = {
  use(next: (() => number) | null): void {
    source = next ?? frameClock
  },
}

export const inkNow = (): number => source()
