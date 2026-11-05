// S2, whole unknown. A port answer that cannot be decided (`unknown`, malformed, a rejection, a
// synchronous throw, an answer that throws while it is read) ends the operation with one
// failure: `unknown` for the read check, the resolution and the lawful set; `source-unavailable`
// for the source (the `unavailable` row of the mapping). No port is called after it, nothing
// looks complete, nothing is thrown. For the catalog the relevant answers are the lawful set and
// the read checks of the identities that the request keeps; an independent oracle from the
// contract rules gives the whole expected answer, so a catalog that answers `unknown` everywhere
// does not pass either.
import { isDeepStrictEqual } from 'node:util'
import {
  accessRequests,
  failureKind,
  Ledger,
  okOf,
  onlyFailure,
  perform,
  type Observation,
  type Report,
  type Request,
} from './explore.ts'
import {
  DESCRIPTION_WORD,
  NAMES,
  runOf,
  undecides,
  type Fault,
  type FaultPoint,
  type IdentitySpec,
  type IdentityState,
  type Name,
  type Schedule,
  type TracedCall,
  type WorldSpec,
} from './world.ts'

export const UNDECIDED: readonly Fault[] = ['unknown', 'malformed', 'reject', 'throw', 'proxy']
export const SOURCE_FAULTS: readonly Fault[] = [
  'package-not-found',
  'entry-not-found',
  'bytes-mismatch',
  'outside-package',
  'unavailable',
  'entry-unreadable',
  'malformed',
  'reject',
  'throw',
  'proxy',
]
const SOURCE_UNDECIDED: readonly Fault[] = ['malformed', 'reject', 'throw', 'proxy']

/** What an undecided answer at `call` must turn the operation into. */
function expectedFor(call: TracedCall): string {
  return call.site.port === 'snapshot' || call.site.port === 'open'
    ? 'source-unavailable'
    : 'unknown'
}

/** The trace check of S2 for one run; a message when it breaks. */
export function wholeUnknownBreak(
  observation: Observation,
  trace: readonly TracedCall[],
): string | undefined {
  if ('thrown' in observation) return `threw ${observation.thrown}`
  const first = trace.findIndex(item => item.undecided)
  if (first === -1) return undefined
  const call = trace[first]
  if (call === undefined) return undefined
  const expected = expectedFor(call)
  if (failureKind(observation) !== expected)
    return `undecided ${call.site.port} answered ${JSON.stringify(observation)}, not ${expected}`
  if (!onlyFailure(observation)) return 'the failure carries more than the failure'
  if (first !== trace.length - 1)
    return `${trace.length - 1 - first} port calls after the undecided ${call.site.port}`
  return undefined
}

const ACCESS_STATES: readonly IdentityState[] = [
  { kind: 'adopted', current: 0 },
  { kind: 'adopted', current: 1 },
  { kind: 'no-digest' },
  { kind: 'stand-in' },
]

function accessWorld(state: IdentityState, held: IdentitySpec['held']): WorldSpec {
  return {
    alpha: { state, readers: ['alice'], knownTo: ['alice'], held },
    beta: {
      state: { kind: 'adopted', current: 0 },
      readers: ['alice'],
      knownTo: ['alice'],
      held: 0,
    },
    gamma: { state: { kind: 'absent' }, readers: [], knownTo: [], held: 'none' },
  }
}

const ACCESS_FAULTS: readonly FaultPoint[] = [
  ...UNDECIDED.map(fault => ({ site: { port: 'check', name: 'alpha' }, fault }) as const),
  ...UNDECIDED.map(fault => ({ site: { port: 'resolve', name: 'alpha' }, fault }) as const),
  ...SOURCE_FAULTS.map(fault => ({ site: { port: 'snapshot' }, fault }) as const),
  ...SOURCE_FAULTS.map(fault => ({ site: { port: 'open' }, fault }) as const),
  // The second entry of an export: the first entry passed, the package must not.
  ...SOURCE_UNDECIDED.map(
    fault => ({ site: { port: 'open', path: 'docs/guide.md' }, fault }) as const,
  ),
]

async function exploreAccess(ledger: Ledger): Promise<void> {
  const requests = accessRequests(
    ['alpha'],
    [undefined, { name: 'alpha', index: 0 }, { name: 'alpha', index: 1 }],
    ['body', 'guide', 'new', 'control', 'bad'],
  )
  for (const state of ACCESS_STATES)
    for (const held of [0, 1, 'none'] as const)
      for (const addressing of ['digest', 'locator'] as const)
        for (const point of [undefined, ...ACCESS_FAULTS]) {
          const world = accessWorld(state, held)
          const schedule: Schedule = {
            addressing,
            ...(point === undefined ? {} : { faults: [point] }),
          }
          for (const request of requests) {
            const run = runOf(world, schedule)
            const observation = await perform(run, 'alice', request)
            ledger.count()
            const broken = wholeUnknownBreak(observation, run.trace())
            if (broken !== undefined)
              ledger.break({ world, schedule, who: 'alice', request, detail: broken })
          }
        }
}

/** The search rule of the contract for the ASCII texts of this world. */
function searchKeeps(text: string, name: Name): boolean {
  const hay = `${name}\n${DESCRIPTION_WORD[name]} things.`.toLowerCase()
  return text
    .toLowerCase()
    .split(/\s/u)
    .every(word => hay.includes(word))
}

type Expected = 'unknown' | readonly string[]

/** The answer that the contract gives the catalog request of `alice`, written as sorted `name:kind`. */
export function catalogOracle(
  world: WorldSpec,
  faults: readonly FaultPoint[],
  request: Request,
): Expected {
  if (request.op === 'summaries' && request.names?.length === 0) return []
  const lawful = NAMES.filter(
    name => world[name].state.kind !== 'absent' && world[name].knownTo.includes('alice'),
  )
  const undecided = (port: string, name?: Name) =>
    faults.some(
      point =>
        point.site.port === port &&
        (name === undefined || ('name' in point.site && point.site.name === name)) &&
        undecides(point.fault),
    )
  if (undecided('adopted')) return 'unknown'
  if (
    lawful.some(name =>
      faults.some(point => point.site.port === 'item' && point.site.name === name),
    )
  )
    return 'unknown'
  const kept = lawful.filter(name => {
    if (request.op === 'summaries')
      return request.names === undefined || request.names.includes(name)
    if (request.op === 'search') return searchKeeps(request.text, name)
    return false
  })
  if (kept.some(name => undecided('check', name))) return 'unknown'
  return kept
    .filter(name => world[name].readers.includes('alice'))
    .map(name => `${name}:${world[name].state.kind === 'stand-in' ? 'stand-in' : 'adopted'}`)
    .sort()
}

/** The observed catalog answer in the form of the oracle, or `undefined` when it is neither. */
export function catalogSeen(observation: Observation): Expected | undefined {
  if (failureKind(observation) === 'unknown') return 'unknown'
  const entries = okOf(observation)
  if (!Array.isArray(entries)) return undefined
  return entries
    .map((entry: unknown) => {
      const kind = Reflect.get(Object(entry), 'kind')
      const capability: unknown = Reflect.get(Object(entry), 'capability')
      return `${String(Reflect.get(Object(capability), 'name'))}:${String(kind)}`
    })
    .sort()
}

export const CATALOG_REQUESTS: readonly Request[] = [
  { op: 'summaries' },
  { op: 'summaries', names: [] },
  { op: 'summaries', names: ['alpha'] },
  { op: 'summaries', names: ['beta'] },
  { op: 'summaries', names: ['alpha', 'beta', 'alpha'] },
  { op: 'summaries', names: ['gamma'] },
  { op: 'search', text: '' },
  { op: 'search', text: 'Reviews' },
  { op: 'search', text: 'beta' },
  { op: 'search', text: 'zzz' },
  { op: 'search', text: 'things' },
]

const CATALOG_FAULTS: readonly FaultPoint[] = [
  ...UNDECIDED.map(fault => ({ site: { port: 'adopted' }, fault }) as const),
  { site: { port: 'item', name: 'alpha' }, fault: 'malformed' },
  { site: { port: 'item', name: 'beta' }, fault: 'malformed' },
  ...UNDECIDED.map(fault => ({ site: { port: 'check', name: 'alpha' }, fault }) as const),
  ...UNDECIDED.map(fault => ({ site: { port: 'check', name: 'beta' }, fault }) as const),
  { site: { port: 'check', name: 'gamma' }, fault: 'unknown' },
]

const PRESENT: readonly IdentityState[] = [{ kind: 'adopted', current: 0 }, { kind: 'stand-in' }]

async function exploreCatalog(ledger: Ledger): Promise<void> {
  for (const alpha of [...PRESENT, { kind: 'absent' } as const])
    for (const alphaReaders of [['alice'], []] as const)
      for (const beta of PRESENT)
        for (const gammaPresent of [false, true])
          for (const point of [undefined, ...CATALOG_FAULTS]) {
            const world: WorldSpec = {
              alpha: { state: alpha, readers: alphaReaders, knownTo: ['alice'], held: 0 },
              beta: { state: beta, readers: ['alice'], knownTo: ['alice'], held: 0 },
              gamma: gammaPresent
                ? {
                    state: { kind: 'adopted', current: 0 },
                    readers: [],
                    knownTo: ['alice'],
                    held: 0,
                  }
                : { state: { kind: 'absent' }, readers: [], knownTo: [], held: 'none' },
            }
            const faults = point === undefined ? [] : [point]
            const schedule: Schedule = { addressing: 'digest', faults }
            for (const request of CATALOG_REQUESTS) {
              const run = runOf(world, schedule)
              const observation = await perform(run, 'alice', request)
              ledger.count()
              const expected = catalogOracle(world, faults, request)
              const seen = catalogSeen(observation)
              if (!isDeepStrictEqual(seen, expected))
                ledger.break({
                  world,
                  schedule,
                  who: 'alice',
                  request,
                  detail: `answered ${JSON.stringify(observation)}, the contract gives ${JSON.stringify(expected)}`,
                })
            }
          }
}

async function exploreInspection(ledger: Ledger): Promise<void> {
  const points: (FaultPoint | undefined)[] = [
    undefined,
    ...SOURCE_FAULTS.map(fault => ({ site: { port: 'snapshot' }, fault }) as const),
    ...SOURCE_FAULTS.map(fault => ({ site: { port: 'open', path: 'SKILL.md' }, fault }) as const),
    ...SOURCE_FAULTS.map(
      fault => ({ site: { port: 'open', path: '.omne/skill.json' }, fault }) as const,
    ),
  ]
  for (const held of [0, 1] as const)
    for (const point of points) {
      const world = accessWorld({ kind: 'adopted', current: held }, held)
      const schedule: Schedule = {
        addressing: 'digest',
        ...(point === undefined ? {} : { faults: [point] }),
      }
      const request: Request = { op: 'inspect', name: 'alpha' }
      const run = runOf(world, schedule)
      const observation = await perform(run, 'alice', request)
      ledger.count()
      const broken = wholeUnknownBreak(observation, run.trace())
      if (broken !== undefined) ledger.break({ world, schedule, request, detail: broken })
      // Not vacuous: a plain package inspects to a definition.
      if (point === undefined && okOf(observation) === undefined)
        ledger.break({
          world,
          schedule,
          request,
          detail: `a plain package answered ${JSON.stringify(observation)}`,
        })
    }
}

export async function exploreWholeUnknown(): Promise<Report> {
  const ledger = new Ledger('S2 whole unknown')
  await exploreAccess(ledger)
  await exploreCatalog(ledger)
  await exploreInspection(ledger)
  return ledger.report()
}
