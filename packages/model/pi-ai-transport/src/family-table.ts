// The family table: an exact adoption of a supplier resolves to one record of one family package,
// and the binding comes from that family only. The table knows no wire format and no vendor. It
// never parses a name, never matches a prefix, never takes the latest revision and never hands
// a supplier to another family.
import type { Outcome } from '@omne-harness/operation-result'
import type { Adoption, Supplier, TransportFailure } from '@omne-harness/model-contract'
import { canonicalDigest, RecordPurityError } from './canonical-json.ts'
import type { PiFamilyBinding, PiFamilyContributions } from './family.ts'

/** What the table needs from any record. A family record type extends it. Pure JSON data. */
export type PiModelRecordHead = Readonly<{
  /** Opaque; never parsed. Several revisions of one model are several records. */
  name: string
  revision: string
  /** The supplier this record binds. The table refuses any other recipient or model. */
  route: Readonly<{ recipient: string; model: string }>
  /** `current`: published in official profiles. `frozen`: acquirable by exact adoption only. */
  status: 'current' | 'frozen'
}>

export type PiFamilySpec<R extends PiModelRecordHead> = Readonly<{
  /** The family package name, e.g. `@omne-harness/pi-ai-openai`. Becomes `Adoption.owner`. */
  owner: string
  records: readonly R[]
  /** Called only with the record whose adoption equals `supplier.adoption` and whose route matches. */
  acquire(
    record: R,
    supplier: Supplier,
    signal: AbortSignal,
  ): Promise<Outcome<PiFamilyBinding, TransportFailure>>
}>

/** The replay formats of one record: the `format` it produces and the formats it accepts. */
export type PiReplayFormats = Readonly<{ produces: string; accepts: readonly string[] }>

/** One record of a family with its adoption, and the acquire of its family bound to it. */
type FamilyEntry = Readonly<{
  adoption: Adoption
  record: PiModelRecordHead
  acquire(
    supplier: Supplier,
    signal: AbortSignal,
  ): Promise<Outcome<PiFamilyBinding, TransportFailure>>
}>

/**
 * Opaque. Only `defineFamily` makes one, so `composeFamilies` sees checked records only. The
 * private field makes the type nominal: no other value has this type, and no code outside this
 * module reads the entries.
 */
class PiFamilyHandle {
  readonly owner: string
  readonly #entries: readonly FamilyEntry[]

  constructor(owner: string, entries: readonly FamilyEntry[]) {
    this.owner = owner
    this.#entries = entries
    Object.freeze(this)
  }

  /** The entries of a handle, or `undefined` for any other value. */
  static entriesOf(value: unknown): readonly FamilyEntry[] | undefined {
    return typeof value === 'object' && value !== null && #entries in value
      ? value.#entries
      : undefined
  }
}

export type PiFamily = PiFamilyHandle

/**
 * The adoption of a record: `{ owner, name, revision, digest }`, where `digest` is the SHA-256 of
 * the canonical JSON of the whole record. The record holds wire data and rule names, so a change
 * of either changes the adoption. Throws `RangeError` when the record is not plain JSON data.
 */
export function recordAdoption(owner: string, record: PiModelRecordHead): Adoption {
  let digest: string
  try {
    digest = canonicalDigest(record)
  } catch (error) {
    if (error instanceof RecordPurityError)
      throw new RangeError(`record is not plain JSON data: ${error.message}`, { cause: error })
    throw error
  }
  return Object.freeze({ owner, name: record.name, revision: record.revision, digest })
}

/**
 * Checks the records once and returns the opaque family. Throws `RangeError` (an assembly defect)
 * when the owner is empty, `acquire` is not a function, a record is not plain JSON data or lacks
 * its head, two records share `(name, revision)`, or two `current` records share a route. The
 * table keeps a frozen copy of each record, so a later change of the caller's object cannot
 * change an adoption. Creates no tokenizer, connection or model instance.
 */
export function defineFamily<R extends PiModelRecordHead>(spec: PiFamilySpec<R>): PiFamily {
  const { owner, records, acquire } = spec
  if (typeof owner !== 'string' || owner.length === 0)
    throw new RangeError('family owner must be a non-empty string')
  if (typeof acquire !== 'function') throw new RangeError('family acquire must be a function')
  if (!Array.isArray(records)) throw new RangeError('family records must be an array')
  const revisions = new Set<string>()
  const currentRoutes = new Set<string>()
  const entries: FamilyEntry[] = []
  for (const [index, original] of records.entries()) {
    const adoption = recordAdoption(owner, original)
    checkHead(original, index)
    const revision = keyOf([original.name, original.revision])
    if (revisions.has(revision))
      throw new RangeError(`records[${index}] repeats name and revision ${revision}`)
    revisions.add(revision)
    if (original.status === 'current') {
      const route = keyOf([original.route.recipient, original.route.model])
      if (currentRoutes.has(route))
        throw new RangeError(`records[${index}] is a second current record of route ${route}`)
      currentRoutes.add(route)
    }
    const record = deepFreeze(structuredClone(original))
    entries.push(
      Object.freeze({
        adoption,
        record,
        acquire: (supplier: Supplier, signal: AbortSignal) => acquire(record, supplier, signal),
      }),
    )
  }
  return new PiFamilyHandle(owner, Object.freeze(entries))
}

function checkHead(record: PiModelRecordHead, index: number): void {
  const at = `records[${index}]`
  if (!isText(record.name)) throw new RangeError(`${at}.name must be a non-empty string`)
  if (!isText(record.revision)) throw new RangeError(`${at}.revision must be a non-empty string`)
  if (typeof record.route !== 'object' || record.route === null)
    throw new RangeError(`${at}.route must be an object`)
  if (!isText(record.route.recipient) || !isText(record.route.model))
    throw new RangeError(`${at}.route must have a non-empty recipient and model`)
  if (record.status !== 'current' && record.status !== 'frozen')
    throw new RangeError(`${at}.status must be current or frozen`)
}

/**
 * The one `PiFamilyContributions` that an assembly gives to `createPiTransport`. Throws
 * `RangeError` for a value that `defineFamily` did not make, a repeated owner or a repeated
 * adoption. `acquire` looks up all four fields of `supplier.adoption`:
 *
 * - miss: `unavailable`, `dependency` is the adoption owner, diagnostic `adoption-not-installed`;
 * - hit, other recipient or model: `invalid`, `field` `supplier.recipient` or `supplier.model`;
 * - hit, same route: the acquire of that family;
 * - the binding names another supplier or adoption: the binding is released, then `unavailable`
 *   with diagnostic `binding-mismatch`;
 * - the signal is aborted before the family is called, or when the family returns a binding: the
 *   binding is released, then `unavailable` with diagnostic `cancelled`.
 */
export function composeFamilies(families: readonly PiFamily[]): PiFamilyContributions {
  if (!Array.isArray(families)) throw new RangeError('families must be an array')
  const owners = new Set<string>()
  const table = new Map<string, FamilyEntry>()
  for (const family of families) {
    const entries = familyEntries(family)
    if (owners.has(family.owner)) throw new RangeError(`family owner ${family.owner} repeats`)
    owners.add(family.owner)
    for (const entry of entries) {
      const key = adoptionKey(entry.adoption)
      if (table.has(key)) throw new RangeError(`adoption ${key} is declared twice`)
      table.set(key, entry)
    }
  }
  return Object.freeze({
    acquire: (supplier: Supplier, signal: AbortSignal) => acquireFrom(table, supplier, signal),
  })
}

async function acquireFrom(
  table: ReadonlyMap<string, FamilyEntry>,
  supplier: Supplier,
  signal: AbortSignal,
): Promise<Outcome<PiFamilyBinding, TransportFailure>> {
  const { owner } = supplier.adoption
  const entry = table.get(adoptionKey(supplier.adoption))
  if (entry === undefined) return { failure: unavailable(owner, 'adoption-not-installed') }
  if (supplier.recipient !== entry.record.route.recipient)
    return { failure: { kind: 'invalid', field: 'supplier.recipient', reason: 'route-mismatch' } }
  if (supplier.model !== entry.record.route.model)
    return { failure: { kind: 'invalid', field: 'supplier.model', reason: 'route-mismatch' } }
  if (signal.aborted) return { failure: unavailable(owner, 'cancelled') }
  const acquired = await entry.acquire(supplier, signal)
  if (!('ok' in acquired)) return acquired
  const binding = acquired.ok
  const mismatch =
    !sameSupplier(binding.supplier, supplier) || !sameAdoption(binding.adoption, entry.adoption)
  if (!mismatch && !signal.aborted) return acquired
  await binding.release()
  return { failure: unavailable(owner, mismatch ? 'binding-mismatch' : 'cancelled') }
}

/**
 * The replay formats of the record that `adoption` names, read from the record. `null` when no
 * family declares the adoption or the record has no `replay.formats`.
 */
export function replayFormatsOf(
  families: readonly PiFamily[],
  adoption: Adoption,
): PiReplayFormats | null {
  const key = adoptionKey(adoption)
  for (const family of families) {
    const entry = familyEntries(family).find(item => adoptionKey(item.adoption) === key)
    if (entry !== undefined) return formatsOf(entry.record)
  }
  return null
}

function formatsOf(record: PiModelRecordHead): PiReplayFormats | null {
  const replay = memberOf(record, 'replay')
  const formats = replay === undefined ? undefined : memberOf(replay, 'formats')
  if (formats === undefined) return null
  const produces = memberOf(formats, 'produces')
  const accepts = memberOf(formats, 'accepts')
  if (typeof produces !== 'string' || !isTextArray(accepts)) return null
  return Object.freeze({ produces, accepts: Object.freeze([...accepts]) })
}

function memberOf(holder: unknown, key: string): unknown {
  if (typeof holder !== 'object' || holder === null) return undefined
  return Object.hasOwn(holder, key) ? Reflect.get(holder, key) : undefined
}

function isTextArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

/**
 * The adoption and the frozen record of each record of a family, in record order. For the
 * package's own testing entry; the root entry does not export it. Throws `RangeError` for a
 * value that `defineFamily` did not make.
 */
export function familyRecords(
  family: PiFamily,
): readonly Readonly<{ adoption: Adoption; record: PiModelRecordHead }>[] {
  return familyEntries(family).map(entry =>
    Object.freeze({ adoption: entry.adoption, record: entry.record }),
  )
}

function familyEntries(family: PiFamily): readonly FamilyEntry[] {
  const entries = PiFamilyHandle.entriesOf(family)
  if (entries === undefined) throw new RangeError('each family must come from defineFamily')
  return entries
}

function unavailable(dependency: string, diagnostic: string): TransportFailure {
  return { kind: 'unavailable', dependency, diagnostic }
}

function sameAdoption(left: Adoption, right: Adoption): boolean {
  return adoptionKey(left) === adoptionKey(right)
}

function sameSupplier(left: Supplier, right: Supplier): boolean {
  return (
    sameAdoption(left.adoption, right.adoption) &&
    left.recipient === right.recipient &&
    left.model === right.model &&
    left.credential.kind === right.credential.kind &&
    (left.credential.kind === 'factory' ||
      (right.credential.kind === 'tenant' && left.credential.id === right.credential.id))
  )
}

function adoptionKey(adoption: Adoption): string {
  return keyOf([adoption.owner, adoption.name, adoption.revision, adoption.digest])
}

function keyOf(parts: readonly string[]): string {
  return JSON.stringify(parts)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.getOwnPropertyNames(value)) deepFreeze(Reflect.get(value, key))
    Object.freeze(value)
  }
  return value
}
