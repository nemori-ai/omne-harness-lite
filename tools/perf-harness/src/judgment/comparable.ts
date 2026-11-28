export type ReadingKind = 'count' | 'clocked' | 'time' | 'ratio'

export type ResultHead = Readonly<{
  workload: string
  assembly: string
  facilityMajor: number
  machine: string
  stateQualified: boolean
  probesHold: boolean
}>

export type Comparison =
  | Readonly<{ verdict: 'comparable' }>
  | Readonly<{ verdict: 'side-by-side'; reason: string }>
  | Readonly<{ verdict: 'refused'; reason: string }>
  | Readonly<{ verdict: 'blocked'; reason: string }>

const sameQuestion = (a: ResultHead, b: ResultHead): string | null => {
  if (a.workload !== b.workload) return 'the workloads differ'
  if (a.assembly !== b.assembly) return 'the assemblies differ'
  if (a.facilityMajor !== b.facilityMajor) return 'the major versions of the facility differ'
  return null
}

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
