import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  isMediaKey,
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
import { collect, digestOf } from './bytes.ts'
import { isPortFailure, later, unavailable, writeFailure, type MediaDependencies } from './deps.ts'

export type Measured = Outcome<
  MediaFacts,
  Readonly<{ kind: 'type-mismatch' } | { kind: 'over-budget' }>
>

const invalidReference = fail<InvalidReference>({ kind: 'invalid-reference' })
const materialUnavailable = fail<MaterialUnavailable>({ kind: 'material-unavailable' })

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
    if (probed.ok.mediaType !== mediaType) return fail({ kind: 'type-mismatch' })
    const { widthPixels, heightPixels } = probed.ok
    return succeed({ kind: 'image', widthPixels, heightPixels })
  }

  /** Deletes an object that is marked deleting: its bytes first, its row last. */
  async function erase(row: MediaRow): Promise<boolean> {
    const store = storeOf(row.storage)
    if (store === undefined) return false
    if (row.write !== null && 'failure' in (await store.abort(row.write))) return false
    if ('failure' in (await store.remove(row.key))) return false
    return 'ok' in (await index.dropRow(row.key))
  }

  async function discard(row: MediaRow): Promise<void> {
    const marked = await index.markDeleting(row.key)
    if ('ok' in marked && marked.ok.marked) await erase({ ...row, state: 'deleting' })
  }

  /** Stages or merges in one transaction of the index; only then is the reference handed out. */
  async function settle(input: {
    row: MediaRow
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
    if (staged.ok.kind === 'merged') await erase({ ...row, state: 'deleting' })
    return succeed(committed(staged.ok.row))
  }

  /** The live row a reference of this tenant names, every item of the reference the same. */
  async function resolve(
    tenant: string | null,
    ref: ContentReference,
  ): Promise<Outcome<MediaRow, InvalidReference | MediaUnavailable>> {
    if (tenant === null || !isMediaKey(ref.key) || storeOf(ref.storage) === undefined)
      return invalidReference
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
    const opened = await storeOf(row.storage)?.open(row.key)
    if (opened === undefined) return materialUnavailable
    if ('failure' in opened)
      return opened.failure.kind === 'not-found' ? materialUnavailable : unavailable('store')
    const bytes = await collect(opened.ok)
    return digestOf(bytes) === row.digest ? succeed(bytes) : materialUnavailable
  }

  return { storeOf, committed, measure, erase, discard, settle, resolve, whole }
}

export type Objects = ReturnType<typeof createObjects>
