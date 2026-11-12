// S7, the content comes only from the material of the requested identity. Without the premise
// PR1 and PR3, the resolution may answer `adopted` with the reference of another identity
// (`misdirect`, to each of the other two identities, readable by the observer or not) or, with a
// basis, with a reference whose source layer, asset version or digest is not the basis's. Every
// success must name the requested identity, and every page, listing and export must be bytes of a
// material of that identity (the S3 check against the pinned material). A misdirection that
// breaks the request is no answer: the operation answers `unknown` alone and calls no port after
// it (the S2 check). Not vacuous: without a fault, `describe` of the requested identity without a
// basis succeeds.
import { isDeepStrictEqual } from 'node:util'
import { isPackageDigest } from '@omne-harness/skill-contract'
import { mixedBreak } from './basis.ts'
import {
  accessRequests,
  Ledger,
  okOf,
  perform,
  type AccessRequest,
  type Observation,
  type Report,
} from './explore.ts'
import { wholeUnknownBreak } from './whole-unknown.ts'
import {
  CAPABILITY,
  materialByDigest,
  MISDIRECTIONS,
  misdirects,
  runOf,
  type FaultPoint,
  type IdentitySpec,
  type MaterialIndex,
  type Name,
  type Principal,
  type Schedule,
  type WorldSpec,
} from './world.ts'

const TARGET = 'alpha'

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}

/** The identity that a basis-like value names, and whose material its digest is. */
function namesTarget(basis: unknown): string | undefined {
  if (!isDeepStrictEqual(field(basis, 'capability'), CAPABILITY[TARGET]))
    return `names ${JSON.stringify(field(basis, 'capability'))}`
  const digest = field(basis, 'digest')
  const material = isPackageDigest(digest) ? materialByDigest(digest) : undefined
  if (material?.name !== TARGET) return `its digest is the material of ${material?.name ?? 'none'}`
  return undefined
}

/** The S7 check of one run; a message when it breaks. */
export function identityBreak(
  world: WorldSpec,
  request: AccessRequest,
  observation: Observation,
): string | undefined {
  const ok = okOf(observation)
  if (ok === undefined) return undefined
  if (request.op === 'describe') {
    if (!isDeepStrictEqual(field(ok, 'capability'), CAPABILITY[TARGET]))
      return `describe names ${JSON.stringify(field(ok, 'capability'))}`
    const material = field(ok, 'material')
    if (field(material, 'kind') !== 'pinned') return undefined
    const broken = namesTarget(field(material, 'basis'))
    return broken === undefined ? undefined : `the described material ${broken}`
  }
  const broken = namesTarget(field(ok, 'basis'))
  if (broken !== undefined) return `the result basis ${broken}`
  return mixedBreak(world, request, observation)
}

function worldOf(
  current: MaterialIndex,
  readers: Readonly<Record<Exclude<Name, typeof TARGET>, readonly Principal[]>>,
): WorldSpec {
  const other = (who: readonly Principal[], index: MaterialIndex): IdentitySpec => ({
    state: { kind: 'adopted', current: index },
    readers: who,
    knownTo: who,
    held: 0,
  })
  return {
    alpha: {
      state: { kind: 'adopted', current },
      readers: ['alice'],
      knownTo: ['alice'],
      held: current,
    },
    beta: other(readers.beta, 0),
    gamma: other(readers.gamma, 0),
  }
}

const FAULTS: readonly (FaultPoint | undefined)[] = [
  undefined,
  { site: { port: 'resolve', name: TARGET }, fault: 'misdirect', to: 'beta' },
  { site: { port: 'resolve', name: TARGET }, fault: 'misdirect', to: 'gamma' },
  ...MISDIRECTIONS.filter(item => item !== 'misdirect').map(
    fault => ({ site: { port: 'resolve', name: TARGET }, fault }) as const,
  ),
]

export async function exploreIdentity(): Promise<Report> {
  const ledger = new Ledger('S7 own material only')
  const requests = accessRequests(
    [TARGET],
    [undefined, { name: TARGET, index: 0 }, { name: TARGET, index: 1 }],
    ['body', 'guide', 'new'],
  )
  const readerSets: readonly (readonly Principal[])[] = [['alice'], []]
  for (const current of [0, 1] as const)
    for (const beta of readerSets)
      for (const gamma of readerSets)
        for (const addressing of ['digest', 'locator'] as const)
          for (const point of FAULTS) {
            const world = worldOf(current, { beta, gamma })
            const schedule: Schedule = {
              addressing,
              ...(point === undefined ? {} : { faults: [point] }),
            }
            for (const request of requests) {
              // A misdirection that the request cannot tell from an honest answer is not one.
              if (point !== undefined && !misdirects(point, request.basis)) continue
              const run = runOf(world, schedule)
              const observation = await perform(run, 'alice', request)
              ledger.count()
              const broken =
                identityBreak(world, request, observation) ??
                wholeUnknownBreak(observation, run.trace())
              if (broken !== undefined)
                ledger.break({ world, schedule, who: 'alice', request, detail: broken })
              if (
                point === undefined &&
                request.op === 'describe' &&
                request.basis === undefined &&
                okOf(observation) === undefined
              )
                ledger.break({
                  world,
                  schedule,
                  who: 'alice',
                  request,
                  detail: `a plain describe answered ${JSON.stringify(observation)}`,
                })
            }
          }
  return ledger.report()
}
