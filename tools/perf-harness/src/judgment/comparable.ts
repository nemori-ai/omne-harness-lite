export type ReadingKind = 'count' | 'time' | 'ratio'

/** What a result says of itself, as far as comparing it with another goes. */
export type ResultHead = Readonly<{
  workload: string
  assembly: string
  facilityMajor: number
  machine: string
  /** whether the state of the machine during the run met every line */
  stateQualified: boolean
  /** whether the probes stayed where the baseline of this machine has them */
  probesHold: boolean
}>

export type Comparison =
  | Readonly<{ verdict: 'comparable' }>
  /** the readings may stand beside each other, labelled; they are not one number and gate nothing */
  | Readonly<{ verdict: 'side-by-side'; reason: string }>
  | Readonly<{ verdict: 'refused'; reason: string }>
  | Readonly<{ verdict: 'blocked'; reason: string }>

const sameQuestion = (a: ResultHead, b: ResultHead): string | null => {
  if (a.workload !== b.workload) return 'the workloads differ'
  if (a.assembly !== b.assembly) return 'the assemblies differ'
  if (a.facilityMajor !== b.facilityMajor) return 'the major versions of the facility differ'
  return null
}

/** Whether two results may be compared, by the kind of reading: decided here, not by whoever reads the numbers. */
export function comparable(kind: ReadingKind, a: ResultHead, b: ResultHead): Comparison {
  const differs = sameQuestion(a, b)
  if (differs !== null) return { verdict: 'refused', reason: differs }
  if (kind === 'count') return { verdict: 'comparable' }
  const unfit = [a, b].find(head => !head.stateQualified)
  if (unfit !== undefined)
    return { verdict: 'blocked', reason: 'the state of a machine did not qualify' }
  if (kind === 'ratio')
    return a.machine === b.machine
      ? { verdict: 'comparable' }
      : { verdict: 'side-by-side', reason: 'ratios of two machine configurations' }
  if (a.machine !== b.machine)
    return { verdict: 'blocked', reason: 'absolute times of two machine configurations' }
  if (!a.probesHold || !b.probesHold)
    return { verdict: 'blocked', reason: 'the probes drifted from the baseline of this machine' }
  return { verdict: 'side-by-side', reason: 'absolute times of two runs gate nothing' }
}
