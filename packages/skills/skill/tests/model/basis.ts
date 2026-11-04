// S3, no mixed versions. Every success of `read`, `list` and `export` names the pinned material
// (the basis given, or the adopted material of the reference) and gives only bytes of that
// material: the page is the slice of that material's entry, the listing is that material's
// entries, the export is every entry of it. The source content changes at every point of the
// operation (after the read check, the resolution, the snapshot, each `open`), with both kinds
// of source: one that keys bytes by the snapshot digest and one that gives the current bytes at
// the locator. A failure carries no content. Not vacuous: when the source holds the pinned
// material all along and nothing fails, the operation succeeds.
import { isDeepStrictEqual } from 'node:util'
import { isControlFile, PAGE_LIMIT, type SkillMaterialBasis } from '@omne-harness/skill-contract'
import {
  accessRequests,
  Ledger,
  okOf,
  onlyFailure,
  perform,
  PART_PATH,
  type AccessRequest,
  type Observation,
  type Report,
} from './explore.ts'
import {
  adoptedBasis,
  basisOf,
  bytesIn,
  materialByDigest,
  runOf,
  sealedOf,
  type Held,
  type Material,
  type MaterialIndex,
  type Schedule,
  type WorldSpec,
} from './world.ts'

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}

/** The material that `request` pins in `world`: its basis, or the adopted material. */
export function pinnedBasis(
  world: WorldSpec,
  request: AccessRequest,
): SkillMaterialBasis | undefined {
  return request.basis === undefined
    ? adoptedBasis(world, request.name)
    : basisOf(request.basis.name, request.basis.index)
}

function readBreak(
  material: Material,
  request: Extract<AccessRequest, { op: 'read' }>,
  ok: unknown,
): string | undefined {
  const entryPath = request.part === 'body' ? 'SKILL.md' : PART_PATH[request.part]
  const bytes = bytesIn(material, entryPath)
  if (bytes === undefined) return `a page of ${entryPath}, which the material does not hold`
  const region = request.part === 'body' ? bytes.subarray(material.bodyStart) : bytes
  const range = field(ok, 'range')
  const start = Number(field(range, 'start'))
  const length = Number(field(range, 'length'))
  if (field(ok, 'total') !== region.length)
    return `total ${String(field(ok, 'total'))}, the material has ${region.length}`
  const slice = region.slice(start, start + length)
  const content = field(ok, 'content')
  const given = field(content, 'kind') === 'text' ? field(content, 'text') : field(content, 'bytes')
  const expected = field(content, 'kind') === 'text' ? decoder.decode(slice) : slice
  return isDeepStrictEqual(given, expected)
    ? undefined
    : `the page is not the slice of the pinned material`
}

function listBreak(material: Material, ok: unknown): string | undefined {
  const entries = sealedOf(material.name, material.files).entries.filter(
    entry => !isControlFile(entry.path),
  )
  return isDeepStrictEqual(field(ok, 'resources'), entries)
    ? undefined
    : 'the listing is not the pinned material'
}

function exportBreak(material: Material, ok: unknown): string | undefined {
  const sealed = sealedOf(material.name, material.files)
  if (field(ok, 'digest') !== sealed.digest) return 'the export names another snapshot'
  const entries = field(ok, 'entries')
  if (!Array.isArray(entries) || entries.length !== sealed.entries.length)
    return 'the export is not every entry'
  for (const entry of sealed.entries) {
    const given: unknown = entries.find((item: unknown) => field(item, 'path') === entry.path)
    if (field(given, 'digest') !== entry.digest) return `${entry.path}: another digest`
    if (!isDeepStrictEqual(field(given, 'bytes'), bytesIn(material, entry.path)))
      return `${entry.path}: other bytes`
  }
  return undefined
}

/** The S3 check of one run; a message when it breaks. */
export function mixedBreak(
  world: WorldSpec,
  request: AccessRequest,
  observation: Observation,
): string | undefined {
  if ('thrown' in observation) return `threw ${observation.thrown}`
  const ok = okOf(observation)
  if (ok === undefined) return onlyFailure(observation) ? undefined : 'a failure with content'
  if (request.op === 'describe') return undefined
  const pinned = pinnedBasis(world, request)
  if (!isDeepStrictEqual(field(ok, 'basis'), pinned))
    return `the result names ${JSON.stringify(field(ok, 'basis'))}, pinned is ${JSON.stringify(pinned)}`
  const material = pinned === undefined ? undefined : materialByDigest(pinned.digest)
  if (material === undefined) return 'a success without a readable pinned material'
  switch (request.op) {
    case 'read':
      return readBreak(material, request, ok)
    case 'list':
      return listBreak(material, ok)
    case 'export':
      return exportBreak(material, ok)
    default: {
      const exhaustive: never = request
      return exhaustive
    }
  }
}

/** Whether nothing stands in the way of `request`: the source holds the lawful pinned material. */
function plainlyReadable(current: MaterialIndex, held: Held, request: AccessRequest): boolean {
  const index = request.basis?.index ?? current
  if (index !== 0 && index !== current) return false
  if (held !== index) return false
  if (request.op === 'read')
    return (
      request.part === 'body' || request.part === 'guide' || (request.part === 'new' && index === 1)
    )
  return true
}

const PAGES = [
  { start: 0, length: 8 },
  { start: 8, length: 8 },
  { start: 60, length: PAGE_LIMIT + 1 },
]

function requests(): AccessRequest[] {
  const bases = [undefined, { name: 'alpha', index: 0 }, { name: 'alpha', index: 1 }] as const
  const plain = accessRequests(['alpha'], bases, ['body', 'guide', 'new']).filter(
    item => item.op !== 'describe',
  )
  const paged = bases.flatMap(basis =>
    PAGES.map(
      range =>
        ({
          op: 'read',
          name: 'alpha',
          part: 'body',
          range,
          ...(basis === undefined ? {} : { basis }),
        }) as const,
    ),
  )
  return [...plain, ...paged]
}

export async function exploreBasis(): Promise<Report> {
  const ledger = new Ledger('S3 no mixed versions')
  const helds: readonly Held[] = [0, 1, 'none']
  for (const current of [0, 1] as const)
    for (const held of helds)
      for (const addressing of ['digest', 'locator'] as const) {
        const changes = [
          undefined,
          ...[1, 2, 3, 4, 5, 6].flatMap(after =>
            helds.filter(to => to !== held).map(to => ({ after, name: 'alpha', to }) as const),
          ),
        ]
        for (const change of changes) {
          const world: WorldSpec = {
            alpha: {
              state: { kind: 'adopted', current },
              readers: ['alice'],
              knownTo: ['alice'],
              held,
            },
            beta: { state: { kind: 'absent' }, readers: [], knownTo: [], held: 'none' },
            gamma: { state: { kind: 'absent' }, readers: [], knownTo: [], held: 'none' },
          }
          const schedule: Schedule = { addressing, ...(change === undefined ? {} : { change }) }
          for (const request of requests()) {
            const observation = await perform(runOf(world, schedule), 'alice', request)
            ledger.count()
            const broken = mixedBreak(world, request, observation)
            if (broken !== undefined)
              ledger.break({ world, schedule, who: 'alice', request, detail: broken })
            if (
              change === undefined &&
              plainlyReadable(current, held, request) &&
              okOf(observation) === undefined
            )
              ledger.break({
                world,
                schedule,
                who: 'alice',
                request,
                detail: `a plain read answered ${JSON.stringify(observation)}`,
              })
          }
        }
      }
  return ledger.report()
}
