import { createHash } from 'node:crypto'
import type { Place } from '@omne-harness/perf-harness'
import { clientOf } from './driver/client.ts'
import { startLab, type Readings, type StepLine } from './driver/lab.ts'
import { until } from './driver/process.ts'
import { requestsOf, roundMark, scriptOf, type RoundShape } from './script.ts'

export type Step = Readonly<{
  round: number
  step: number
  reads: number
  commits: number
  commitBytes: number
  requestBytes: number
  byHandler: Readonly<Record<string, number>>
  byParticipant: Readonly<Record<string, number>>
}>

export type Trajectory = Readonly<{
  steps: readonly Step[]
  digests: readonly string[]
  kinds: Readonly<Record<string, number>>
  wallMs: number
  processorMs: number | null
  requests: number
}>

const TENANT = /^tenant\/[^/]+\/[^/]+$/u

function domainNames(readings: Readings): ReadonlyMap<string, string> {
  const names = new Map<string, string>()
  const all = [...readings.reads, ...readings.commits, ...readings.participants]
  for (const { domain } of all)
    if (TENANT.test(domain) && !names.has(domain))
      names.set(domain, `tenant-${String(names.size + 1)}`)
  return names
}

type Flat = Readonly<{
  reads: number
  commits: number
  bytes: number
  handlers: Readonly<Record<string, number>>
  participants: Readonly<Record<string, number>>
}>

function flat(readings: Readings, names: ReadonlyMap<string, string>): Flat {
  const named = (domain: string): string => names.get(domain) ?? domain
  const handlers: Record<string, number> = {}
  for (const item of readings.reads) handlers[`${named(item.domain)}/${item.handler}`] = item.read
  const participants: Record<string, number> = {}
  for (const item of readings.participants)
    participants[`${named(item.domain)}/${item.participant}`] = item.committed
  return {
    reads: readings.reads.reduce((sum, item) => sum + item.read, 0),
    commits: readings.commits.reduce((sum, item) => sum + item.committed, 0),
    bytes: readings.commits.reduce((sum, item) => sum + item.bytes, 0),
    handlers,
    participants,
  }
}

function gained(before: Readonly<Record<string, number>>, after: Readonly<Record<string, number>>) {
  const out: Record<string, number> = {}
  for (const key of Object.keys(after).sort()) {
    const more = (after[key] ?? 0) - (before[key] ?? 0)
    if (more !== 0) out[key] = more
  }
  return out
}

export function stepsOf(lines: readonly StepLine[], rounds: readonly RoundShape[]): Step[] {
  const names = domainNames(
    lines.at(-1)?.storage ?? { reads: [], commits: [], participants: [], queries: [] },
  )
  const steps: Step[] = []
  let at = 0
  rounds.forEach((shape, index) => {
    for (let step = 1; step <= shape.steps.length; step += 1) {
      const from = lines[at + step - 1]
      const to = lines[at + step]
      if (from === undefined || to === undefined)
        throw new Error('the lab wrote fewer requests than the script holds')
      const a = flat(from.storage, names)
      const b = flat(to.storage, names)
      steps.push({
        round: index + 1,
        step,
        reads: b.reads - a.reads,
        commits: b.commits - a.commits,
        commitBytes: b.bytes - a.bytes,
        requestBytes: to.requestBytes,
        byHandler: gained(a.handlers, b.handlers),
        byParticipant: gained(a.participants, b.participants),
      })
    }
    at += requestsOf(shape)
  })
  return steps
}

const ENTRY = /^#\d+ ([a-z_.-]+): (.*)$/u
const CALL = /^\[tool (?:call \S+|result) (\S+?)\]/u

export function digestsOf(
  history: string,
): Readonly<{ digests: string[]; kinds: Record<string, number> }> {
  const digests: string[] = []
  const kinds: Record<string, number> = {}
  for (const line of history.split('\n')) {
    const entry = ENTRY.exec(line)
    if (entry === null) continue
    const [, kind = '', rest = ''] = entry
    kinds[kind] = (kinds[kind] ?? 0) + 1
    const said = kind === 'message.user' ? rest : (CALL.exec(rest)?.[1] ?? '')
    digests.push(createHash('sha256').update(`${kind}\n${said}`).digest('hex').slice(0, 16))
  }
  return { digests, kinds }
}

const ROUND_MS = 900_000

export async function runRounds(place: Place, rounds: readonly RoundShape[]): Promise<Trajectory> {
  const lab = await startLab({
    root: place.root,
    directory: place.dataDirectory,
    script: scriptOf(rounds),
  })
  try {
    const client = clientOf({
      root: place.root,
      directory: place.dataDirectory,
      server: lab.server,
    })
    const session = await client.session()
    const from = process.hrtime.bigint()
    let expected = 0
    let history = ''
    for (const [index, shape] of rounds.entries()) {
      expected += requestsOf(shape)
      await client.send(session, `please work ${roundMark(index + 1)}`)
      const want = expected
      await until(
        () => (lab.steps().length >= want ? true : undefined),
        `request ${String(want)}`,
        ROUND_MS,
      )
      history = await client.runsEnded(session, index + 1, ROUND_MS)
    }
    const wallMs = Number(process.hrtime.bigint() - from) / 1e6
    const lines = lab.steps()
    if (lines.length !== expected)
      throw new Error(
        `the lab answered ${String(lines.length)} requests, the script holds ${String(expected)}`,
      )
    return {
      steps: stepsOf(lines, rounds),
      ...digestsOf(history),
      wallMs,
      processorMs: lab.processorMs(),
      requests: lines.length,
    }
  } finally {
    await lab.stop()
  }
}
