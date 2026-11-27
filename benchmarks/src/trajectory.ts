import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Place as Location } from '@omne-harness/perf-harness'
import { clientOf } from './driver/client.ts'
import { firstFrame } from './driver/observe.ts'
import { startLab, type Lab, type Readings, type StepLine } from './driver/lab.ts'
import { until } from './driver/process.ts'
import { filled, inputOf, scriptOf, type Place, type RoundShape } from './script.ts'

export type Step = Readonly<{
  round: number
  step: number
  reads: number
  commits: number
  commitBytes: number
  requestBytes: number
  otherRequests: number
  byHandler: Readonly<Record<string, number>>
  byParticipant: Readonly<Record<string, number>>
}>

export type Opening = Readonly<{
  round: number
  cold: boolean
  otherRequests: number
  reads: number
  commits: number
  commitBytes: number
  requestBytes: number
  byHandler: Readonly<Record<string, number>>
}>

export type RoundEnd = Readonly<{
  round: number
  wallMs: number
  residentBytes: number | null
  stateBytes: number
}>

export type Trajectory = Readonly<{
  steps: readonly Step[]
  openings: readonly Opening[]
  watchings: readonly Watching[]
  rounds: readonly RoundEnd[]
  digests: readonly string[]
  kinds: Readonly<Record<string, number>>
  entryKinds: readonly string[]
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

type Open = Readonly<{ line: StepLine; place: Place; others: number }>

export function stepsOf(lines: readonly StepLine[], places: readonly (Place | null)[]): Step[] {
  const names = domainNames(
    lines.at(-1)?.storage ?? { reads: [], commits: [], participants: [], queries: [] },
  )
  const placed = lines.map(line => ({
    line,
    place: line.step === null ? undefined : (places[line.step] ?? undefined),
  }))
  const steps: Step[] = []
  let open = null as Open | null
  for (const { line, place } of placed) {
    if (place === undefined) {
      if (open !== null) open = { ...open, others: open.others + 1 }
      continue
    }
    if (open !== null && typeof open.place.step === 'number') {
      const a = flat(open.line.storage, names)
      const b = flat(line.storage, names)
      steps.push({
        round: open.place.round,
        step: open.place.step,
        reads: b.reads - a.reads,
        commits: b.commits - a.commits,
        commitBytes: b.bytes - a.bytes,
        requestBytes: line.requestBytes,
        otherRequests: open.others,
        byHandler: gained(a.handlers, b.handlers),
        byParticipant: gained(a.participants, b.participants),
      })
    }
    open = { line, place, others: 0 }
  }
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
  return { digests: digests.sort(), kinds }
}

const ROUND_MS = 900_000
const STALL_MS = 30_000

async function roundEnded(
  round: number,
  ends: () => number,
  requests: () => number,
  client: ReturnType<typeof clientOf>,
  session: string,
): Promise<string> {
  let seen = requests()
  let moved = Date.now()
  await until(
    async () => {
      if (ends() >= round) return true
      if (requests() !== seen) {
        seen = requests()
        moved = Date.now()
      }
      if (Date.now() - moved < STALL_MS) return undefined
      moved = Date.now()
      const history = await client.history(session)
      if ((history.match(/run\.terminal: /gu)?.length ?? 0) < round) return undefined
      const diagnostics = await client.omne(['read-session-diagnostics', '--session', session])
      const reason = /^\s*reason: (.+)$/mu.exec(diagnostics.stdout)?.[1] ?? 'no reason was given'
      throw new Error(`round ${String(round)} ended before the script did: ${reason}`)
    },
    `the last request of round ${String(round)}`,
    ROUND_MS,
  )
  return client.runsEnded(session, round, ROUND_MS)
}

export type Setup = Readonly<{
  files?: Readonly<Record<string, number>>
  compactionTrigger?: string
  rules?: readonly object[]
  restartBefore?: readonly number[]
  watchAfter?: readonly number[]
}>

export type Watching = Readonly<{
  round: number
  reads: number
  commits: number
  commitBytes: number
  requestBytes: number
  byHandler: Readonly<Record<string, number>>
  byParticipant: Readonly<Record<string, number>>
}>

const WATCHES = 5
const SETTLE_MS = 500
const SETTLE_LIMIT_MS = 60_000

async function settled(lab: Lab): Promise<void> {
  const commits = async (): Promise<number> =>
    (await lab.readings()).commits.reduce((sum, item) => sum + item.committed, 0)
  let last = await commits()
  await until(
    async () => {
      await new Promise(done => setTimeout(done, SETTLE_MS))
      const now = await commits()
      if (now === last) return true
      last = now
      return undefined
    },
    'the server to stop committing after the round',
    SETTLE_LIMIT_MS,
  )
}

async function watchingsOf(
  lab: Lab,
  round: number,
  requestBytes: number,
  open: () => Promise<string>,
): Promise<Watching[]> {
  const taken: Watching[] = []
  await settled(lab)
  for (let index = 0; index < WATCHES; index += 1) {
    const before = await lab.readings()
    const kind = await open()
    if (kind !== 'state') throw new Error(`the first frame of an observation was ${kind}`)
    const after = await lab.readings()
    const names = domainNames(after)
    const a = flat(before, names)
    const b = flat(after, names)
    taken.push({
      round,
      reads: b.reads - a.reads,
      commits: b.commits - a.commits,
      commitBytes: b.bytes - a.bytes,
      requestBytes,
      byHandler: gained(a.handlers, b.handlers),
      byParticipant: gained(a.participants, b.participants),
    })
  }
  return taken
}

const PDF_HEAD = '%PDF-1.4\n'
const PDF_TAIL = '\n%%EOF\n'

const documentOf = (bytes: number): string =>
  `${PDF_HEAD}${filled(bytes - PDF_HEAD.length - PDF_TAIL.length).replaceAll('\n', '\n%')}${PDF_TAIL}`.slice(
    0,
    bytes,
  )

function attachmentOf(place: Location, round: number, shape: RoundShape): string[] {
  if (shape.attachBytes === undefined) return []
  const file = join(place.dataDirectory, `attached-${String(round)}.pdf`)
  writeFileSync(file, documentOf(shape.attachBytes))
  return [file]
}

function openingOf(
  round: number,
  cold: boolean,
  before: Readonly<{ readings: Readings; requests: number }>,
  lines: readonly StepLine[],
  places: readonly (Place | null)[],
): Opening {
  const at = lines.findIndex(line => line.step !== null && places[line.step]?.round === round)
  const first = lines[at]
  if (first === undefined) throw new Error(`round ${String(round)} made no model request`)
  const names = domainNames(first.storage)
  const a = flat(before.readings, names)
  const b = flat(first.storage, names)
  return {
    round,
    cold,
    otherRequests: at - before.requests,
    reads: b.reads - a.reads,
    commits: b.commits - a.commits,
    commitBytes: b.bytes - a.bytes,
    requestBytes: first.requestBytes,
    byHandler: gained(a.handlers, b.handlers),
  }
}

export async function runRounds(
  place: Location,
  rounds: readonly RoundShape[],
  setup: Setup = {},
): Promise<Trajectory> {
  const { script, places } = scriptOf(rounds, setup.rules)
  const start = (): Promise<Lab> =>
    startLab({
      root: place.root,
      directory: place.dataDirectory,
      script,
      ...(setup.files === undefined ? {} : { files: setup.files }),
      ...(setup.compactionTrigger === undefined
        ? {}
        : { compactionTrigger: setup.compactionTrigger }),
    })
  let lab = await start()
  const steps: Step[] = []
  const openings: Opening[] = []
  const ends: RoundEnd[] = []
  const watchings: Watching[] = []
  let processorMs: number | null = 0
  let requests = 0
  const close = async (): Promise<void> => {
    const unanswered = lab.steps().filter(line => line.step === null).length
    if (unanswered > 0)
      throw new Error(
        `${String(unanswered)} model requests found no step of the script: the trajectory is not the one asked for`,
      )
    const used = lab.processorMs()
    processorMs = processorMs === null || used === null ? null : processorMs + used
    requests += lab.steps().length
    steps.push(...stepsOf(lab.steps(), places))
    await lab.stop()
  }
  try {
    const client = clientOf({
      root: place.root,
      directory: place.dataDirectory,
      server: lab.server,
    })
    const session = await client.session()
    const from = process.hrtime.bigint()
    let history = ''
    for (const [index, shape] of rounds.entries()) {
      const round = index + 1
      const cold = setup.restartBefore?.includes(round) === true
      if (cold) {
        await close()
        lab = await start()
      }
      const current = lab
      const before = { readings: await current.readings(), requests: current.steps().length }
      const ended = (): number =>
        current.steps().some(line => {
          const at = line.step === null ? undefined : places[line.step]
          return at?.round === round && at.step === 'end'
        })
          ? round
          : round - 1
      const sent = process.hrtime.bigint()
      await client.send(session, inputOf(round, shape), attachmentOf(place, round, shape))
      history = await roundEnded(round, ended, () => current.steps().length, client, session)
      ends.push({
        round,
        wallMs: Number(process.hrtime.bigint() - sent) / 1e6,
        residentBytes: current.residentBytes(),
        stateBytes: current.stateBytes(),
      })
      openings.push(openingOf(round, cold, before, current.steps(), places))
      if (setup.watchAfter?.includes(round) === true)
        watchings.push(
          ...(await watchingsOf(current, round, current.steps().at(-1)?.requestBytes ?? 0, () =>
            firstFrame({ directory: place.dataDirectory, server: current.server, session }),
          )),
        )
    }
    const wallMs = Number(process.hrtime.bigint() - from) / 1e6
    const entryKinds = await lab.entryKinds()
    await close()
    const expected = rounds.reduce((sum, shape) => sum + shape.steps.length, 0)
    if (steps.length !== expected)
      throw new Error(
        `the trajectory left ${String(steps.length)} steps, the script holds ${String(expected)}`,
      )
    return {
      steps,
      openings,
      watchings,
      rounds: ends,
      ...digestsOf(history),
      entryKinds,
      wallMs,
      processorMs,
      requests,
    }
  } catch (error) {
    await lab.stop()
    throw error
  }
}
