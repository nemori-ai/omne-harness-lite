export type FigureDoing = 'idle' | 'thinking' | 'looking' | 'writing' | 'background'

export type FigureMomentKind = 'received' | 'landed' | 'could-not'

/** A one-off fact: a new serial makes it a new one. */
export type FigureMoment = Readonly<{ kind: FigureMomentKind; serial: number }>

/** Data only: one module's report; the shell merges them all and draws the figure. */
export type FigureReport = Readonly<{
  doing: FigureDoing
  moment?: FigureMoment
  subject?: string
  /** The awaiting-answer count: decision cards waiting for the person, no other count. */
  waiting?: number
  waitingPage?: string
}>

/** The module that placed the page on show, and the page ids in slot order. */
export type FigureView = Readonly<{ foreground: object | undefined; pages: readonly string[] }>

export type MergedFigure = Readonly<{
  doing: FigureDoing
  moment?: FigureMoment
  subject?: string
  waiting: number
  waitingPage?: string
}>

/** What the shell service needs from the store: take a caller's report, withdraw a caller's report. */
export interface FigureBoard {
  report(owner: object, report: FigureReport): void
  withdraw(owner: object): void
}

export interface FigureStore extends FigureBoard {
  merged(view: FigureView): MergedFigure
  subscribe(listener: () => void): () => void
}

/** Front as reported, others only as background; counts add up; earliest waiting page wins. */
function merge(reports: ReadonlyMap<object, FigureReport>, view: FigureView): MergedFigure {
  const front = view.foreground === undefined ? undefined : reports.get(view.foreground)
  let behind = false
  let waiting = 0
  const asked = new Set<string>()
  for (const [owner, report] of reports) {
    if (owner !== view.foreground && report.doing !== 'idle') behind = true
    const count = report.waiting ?? 0
    waiting += count
    if (count > 0 && report.waitingPage !== undefined) asked.add(report.waitingPage)
  }
  const doing =
    front !== undefined && front.doing !== 'idle' ? front.doing : behind ? 'background' : 'idle'
  const waitingPage = view.pages.find(page => asked.has(page))
  return {
    doing,
    ...(front?.moment !== undefined && { moment: front.moment }),
    ...(front?.subject !== undefined && { subject: front.subject }),
    waiting,
    ...(waitingPage !== undefined && { waitingPage }),
  }
}

export function createFigureStore(): FigureStore {
  const reports = new Map<object, FigureReport>()
  const listeners = new Set<() => void>()

  function changed(): void {
    for (const listener of Array.from(listeners)) listener()
  }

  return {
    report(owner, report) {
      reports.set(owner, report)
      changed()
    },
    withdraw(owner) {
      if (reports.delete(owner)) changed()
    },
    merged: view => merge(reports, view),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
