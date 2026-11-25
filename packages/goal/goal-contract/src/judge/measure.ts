import type { GoalBody, MetricId } from '../body.ts'
import type { ObservedCall } from './material.ts'
import { latestRun } from './pack.ts'

const STEP = /^(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[(0|[1-9][0-9]*)\])/u

/** The steps of a value path such as `.p95_ms` or `.runs[0].ms`; null when it is not such a path. */
function stepsOf(path: string): readonly (string | number)[] | null {
  const steps: (string | number)[] = []
  let rest = path.trim()
  while (rest !== '') {
    const found = STEP.exec(rest)
    if (found === null) return null
    steps.push(found[1] ?? Number(found[2]))
    rest = rest.slice(found[0].length)
  }
  return steps.length === 0 ? null : steps
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** The JSON a command printed: its whole output, or else the last line of it that is JSON. */
function printed(output: string): unknown {
  const whole = parsed(output.trim())
  if (whole !== undefined) return whole
  const lines = output.split('\n').map(line => line.trim())
  return lines.map(parsed).findLast(value => typeof value === 'object' && value !== null)
}

function at(value: unknown, steps: readonly (string | number)[]): unknown {
  let here = value
  for (const step of steps) {
    if (typeof here !== 'object' || here === null) return undefined
    here = (here as Readonly<Record<string | number, unknown>>)[step]
  }
  return here
}

export type Measured = Readonly<{ value: number; ref: string }>

/** The number of each metric as the latest run of its command printed it. A metric whose command did not run, failed, or printed no number there is not read. */
export function measuredOf(
  body: Pick<GoalBody, 'metrics'>,
  calls: readonly ObservedCall[],
): Readonly<Partial<Record<MetricId, Measured>>> {
  const read: Partial<Record<MetricId, Measured>> = {}
  for (const metric of body.metrics) {
    const run = latestRun(calls, metric.measure.command)
    const steps = stepsOf(metric.measure.path)
    if (run === undefined || run.exit !== 0 || steps === null) continue
    const value = at(printed(run.output), steps)
    if (typeof value === 'number' && Number.isFinite(value))
      read[metric.id] = { value, ref: run.ref }
  }
  return read
}
