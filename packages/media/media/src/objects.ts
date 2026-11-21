import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  modalityOf,
  sniffMediaType,
  wavFacts,
  type ByteStore,
  type Committed,
  type ContentReference,
  type Holder,
  type InvalidReference,
  type MaterialUnavailable,
  type MediaFacts,
  type MediaRow,
  type MediaUnavailable,
  type MediaUnknown,
} from '@omne-harness/media-contract'
import { collect, digestOf, partsOf } from './bytes.ts'
import { isPortFailure, later, unavailable, writeFailure, type MediaDependencies } from './deps.ts'

export type Measured = Outcome<
  MediaFacts,
  Readonly<{ kind: 'type-mismatch' } | { kind: 'over-budget' }>
>

const invalidReference = fail<InvalidReference>({ kind: 'invalid-reference' })
const materialUnavailable = fail<MaterialUnavailable>({ kind: 'material-unavailable' })

/** Where an object is and whose it is: all that deleting it or staging it needs of its row. */
export type Placed = Pick<MediaRow, 'key' | 'tenant' | 'storage' | 'write' | 'mediaType'>

type Storing = Readonly<{
  storeOf(name: string): ByteStore | undefined
  discard(row: Placed): Promise<void>
  settle(input: {
    row: Placed
    digest: string
    bytes: number
    facts: MediaFacts
    holder: Holder | null
  }): Promise<Outcome<Committed, MediaUnavailable | MediaUnknown | { kind: 'not-uploading' }>>
}>

function keeping(deps: MediaDependencies, { storeOf, discard, settle }: Storing) {
  const { index } = deps

  async function write(row: Placed, bytes: Uint8Array): Promise<boolean> {
    const target = storeOf(row.storage)
    if (target === undefined) return false
    const begun = await target.begin(row.key)
    if ('failure' in begun) return false
    let sequence = 0
    for (const part of partsOf(bytes, deps.config.partBytes)) {
      if ('failure' in (await target.append(begun.ok.write, sequence, part))) return false
      sequence += 1
    }
    return 'ok' in (await target.seal(begun.ok.write, sequence))
  }

  /** Stores bytes a referrer inside the server brings and holds them for it, in one step. */
  async function keep(input: {
    tenant: string
    mediaType: string
    bytes: Uint8Array
    facts: MediaFacts
    holder: Holder
  }): Promise<Outcome<Committed, MediaUnavailable | MediaUnknown>> {
    const { tenant, mediaType, bytes } = input
    const key = deps.newKey()
    const inserted = await index.insertUploading({
      key,
      tenant,
      storage: deps.writeTo,
      mediaType,
      bytes: bytes.byteLength,
      upload: null,
      expiresAt: later(deps.clock, deps.config.uploadTtlMs),
    })
    if ('failure' in inserted) return writeFailure('index', inserted.failure)
    const row = { key, tenant, storage: deps.writeTo, mediaType, write: null }
    if (!(await write(row, bytes))) {
      await discard(row)
      return unavailable('store')
    }
    const settled = await settle({
      row,
      digest: digestOf(bytes),
      bytes: bytes.byteLength,
      facts: input.facts,
      holder: input.holder,
    })
    if ('ok' in settled) return settled
    return settled.failure.kind === 'not-uploading' ? unavailable('index') : fail(settled.failure)
  }

  return keep
}

export function createObjects(deps: MediaDependencies) {
  const { index, image } = deps
  const storeOf = (name: string): ByteStore | undefined =>
    deps.stores.find(store => store.name === name)

  function committed(row: MediaRow): Committed {
    return {
      ref: {
        storage: row.storage,
        key: row.key,
        mediaType: row.mediaType,
        bytes: String(row.bytes),
        digest: row.digest ?? '',
      },
      facts: row.facts ?? { kind: 'file' },
    }
  }

  async function measure(mediaType: string, bytes: Uint8Array): Promise<Measured> {
    if (sniffMediaType(bytes) !== mediaType) return fail({ kind: 'type-mismatch' })
    const modality = modalityOf(mediaType)
    if (modality === 'file') return succeed({ kind: 'file' })
    if (modality === 'voice') {
      const facts = wavFacts(bytes)
      return facts === null ? fail({ kind: 'type-mismatch' }) : succeed({ kind: 'voice', ...facts })
    }
    const probed = await image.probe(bytes)
    if ('failure' in probed)
      return fail({ kind: probed.failure.kind === 'over-budget' ? 'over-budget' : 'type-mismatch' })
    const { widthPixels, heightPixels } = probed.ok
    return succeed({ kind: 'image', widthPixels, heightPixels })
  }

  /** Deletes an object that is marked deleting: its bytes first, its row last. */
  async function erase(row: Placed): Promise<boolean> {
    const store = storeOf(row.storage)
    if (store === undefined) return false
    if (row.write !== null && 'failure' in (await store.abort(row.write))) return false
    if ('failure' in (await store.remove(row.key))) return false
    return 'ok' in (await index.dropRow(row.tenant, row.key))
  }

  async function discard(row: Placed): Promise<void> {
    const marked = await index.markDeleting(row.tenant, row.key)
    if ('ok' in marked && marked.ok.marked) await erase(row)
  }

  /** Stages or merges in one transaction of the index; only then is the reference handed out. */
  async function settle(input: {
    row: Placed
    digest: string
    bytes: number
    facts: MediaFacts
    holder: Holder | null
  }): Promise<Outcome<Committed, MediaUnavailable | MediaUnknown | { kind: 'not-uploading' }>> {
    const { row } = input
    const staged = await index.stageOrMerge({
      key: row.key,
      tenant: row.tenant,
      mediaType: row.mediaType,
      bytes: input.bytes,
      digest: input.digest,
      facts: input.facts,
      expiresAt: later(deps.clock, deps.config.stagingTtlMs),
      holder: input.holder,
    })
    if ('failure' in staged)
      return isPortFailure(staged.failure)
        ? writeFailure('index', staged.failure)
        : fail(staged.failure)
    if (staged.ok.kind === 'merged') await erase(row)
    return succeed(committed(staged.ok.row))
  }

  /** The live row a reference of this tenant names, every item of the reference the same. */
  async function resolve(
    tenant: string,
    ref: ContentReference,
  ): Promise<Outcome<MediaRow, InvalidReference | MediaUnavailable>> {
    const row = await index.readLive(ref.key, tenant)
    if ('failure' in row)
      return row.failure.kind === 'not-found' ? invalidReference : unavailable('index')
    const same = committed(row.ok).ref
    const matches =
      same.storage === ref.storage &&
      same.mediaType === ref.mediaType &&
      same.bytes === ref.bytes &&
      same.digest === ref.digest
    return matches ? succeed(row.ok) : invalidReference
  }

  /** Bytes that do not match the digest of their row are not handed out. */
  async function whole(
    row: MediaRow,
  ): Promise<Outcome<Uint8Array, MaterialUnavailable | MediaUnavailable>> {
    const store = storeOf(row.storage)
    if (store === undefined) return unavailable('store')
    const opened = await store.open(row.key)
    if ('failure' in opened)
      return opened.failure.kind === 'not-found' ? materialUnavailable : unavailable('store')
    const bytes = await collect(opened.ok)
    return digestOf(bytes) === row.digest ? succeed(bytes) : materialUnavailable
  }

  const keep = keeping(deps, { storeOf, discard, settle })
  return { storeOf, committed, measure, erase, discard, settle, resolve, whole, keep }
}

export type Objects = ReturnType<typeof createObjects>
