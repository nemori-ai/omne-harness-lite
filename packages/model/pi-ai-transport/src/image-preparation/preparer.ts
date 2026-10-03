import { createHash } from 'node:crypto'
import {
  dataOnly,
  encodedSchema,
  inputSchema,
  metadataSchema,
  ownPolicy,
  validateCodec,
} from './validation.ts'
import { IMAGE_PREPARATION_ALGORITHM_REVISION } from './preset.ts'
import type {
  CodecFailure,
  CodecResult,
  DecodedImage,
  EncodedImage,
  ImageEncodeSpec,
  ImageMetadata,
  ImagePrepareInput,
  ImagePreparePolicy,
  ImagePrepareRejection,
  ImagePrepareResult,
  ImagePreparerResult,
  ImagePreparer,
  LoadedImageCodec,
  PreparedImage,
  PrepareRequestImagesInput,
} from './types.ts'

const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }
const preparers = new WeakSet<object>()
/** Package-internal provenance check; never a caller-controlled through flag. */
export function isImagePreparer(value: unknown): value is ImagePreparer {
  return typeof value === 'object' && value !== null && preparers.has(value)
}
export function imageWireBytes(image: EncodedImage): number {
  return (
    Buffer.byteLength(
      JSON.stringify(
        `data:${image.mediaType};base64,${Buffer.from(image.bytes).toString('base64')}`,
      ),
    ) - 2
  )
}
interface Candidate {
  ordinal: number
  image: EncodedImage | null
}
interface CacheEntry {
  table: Map<string, Candidate>
  key: string
  candidate: Candidate
  size: number
}
interface Cursor {
  input: ImagePrepareInput
  metadata: ImageMetadata
  decoded: DecodedImage
  sourceDigest: string
  specs: ImageEncodeSpec[]
  explored: number
  selected?: Candidate
  pending: Map<string, Candidate>
  closePromise?: Promise<void>
}
function closeDecoded(cursor: Cursor): Promise<void> {
  if (cursor.closePromise) return cursor.closePromise
  try {
    cursor.closePromise = cursor.decoded.close()
  } catch (error) {
    cursor.closePromise = Promise.reject(error)
  }
  return cursor.closePromise
}
class Rejection extends Error {
  constructor(readonly rejection: ImagePrepareRejection) {
    super(rejection.reason)
  }
}
function reject(rejection: ImagePrepareRejection): never {
  throw new Rejection(rejection)
}
function codecFailure(
  failure: CodecFailure['failure'],
  imageIndex: number,
  decoding: boolean,
): never {
  if (failure === 'bad_input')
    return reject({ reason: decoding ? 'decode_failed' : 'malformed_image', imageIndex })
  if (failure === 'unsupported') return reject({ reason: 'unsupported_encoding', imageIndex })
  return reject({
    reason: 'provider_unavailable',
    cause: failure === 'unavailable' ? 'codec_unavailable' : 'codec_failure',
  })
}
function specsFor(width: number, height: number, p: ImagePreparePolicy): ImageEncodeSpec[] {
  const inside = Math.min(1, p.maxWidth / width, p.maxHeight / height)
  return p.sizeScaleSteps.flatMap(scale =>
    p.outputFormats.flatMap(format =>
      (format === 'png' ? [null] : p.qualitySteps).map(quality => ({
        format,
        width: Math.max(1, Math.floor(width * inside * scale)),
        height: Math.max(1, Math.floor(height * inside * scale)),
        quality,
        pngCompressionLevel: 9,
        webpEffort: 4,
        alphaBackground: p.alphaBackground,
      })),
    ),
  )
}

export function createImagePreparer(
  policy: ImagePreparePolicy,
  explicitlyLoadedCodec: LoadedImageCodec,
): ImagePreparerResult {
  const p = ownPolicy(policy)
  validateCodec(explicitlyLoadedCodec)
  const codec = {
    ...explicitlyLoadedCodec,
    inputMediaTypes: [...explicitlyLoadedCodec.inputMediaTypes],
    outputFormats: [...explicitlyLoadedCodec.outputFormats],
    available: explicitlyLoadedCodec.available.bind(explicitlyLoadedCodec),
    inspect: explicitlyLoadedCodec.inspect.bind(explicitlyLoadedCodec),
    decode: explicitlyLoadedCodec.decode.bind(explicitlyLoadedCodec),
  }
  const available = codec.available()
  if (available !== true && available !== false) throw new TypeError('Invalid codec availability')
  if (!available) return { unavailable: true }
  const policyDigest = digest(JSON.stringify([p, { pngCompressionLevel: 9, webpEffort: 4 }]))
  let closed = false,
    closing: Promise<void> | undefined,
    inFlightBytes = 0,
    cacheBytes = 0
  const active = new Map<Promise<ImagePrepareResult>, AbortController>()
  let scopes = new WeakMap<object, Map<string, Candidate>>()
  const lru = new Map<Candidate, CacheEntry>()
  function remove(entry: CacheEntry) {
    entry.table.delete(entry.key)
    lru.delete(entry.candidate)
    cacheBytes -= entry.size
  }
  function clearScope(scope: object) {
    const table = scopes.get(scope)
    if (!table) return
    for (const entry of [...lru.values()]) if (entry.table === table) remove(entry)
    scopes.delete(scope)
  }
  function publish(table: Map<string, Candidate>, key: string, candidate: Candidate) {
    if (table.has(key)) return
    const size = candidate.image?.bytes.byteLength ?? 0
    if (size > p.maxCacheBytes) return
    while (lru.size >= p.maxCacheEntries || cacheBytes + size > p.maxCacheBytes) {
      const oldest = lru.values().next().value
      if (!oldest) break
      remove(oldest)
    }
    const owned: Candidate = {
      ordinal: candidate.ordinal,
      image: candidate.image
        ? { ...candidate.image, bytes: new Uint8Array(candidate.image.bytes) }
        : null,
    }
    table.set(key, owned)
    lru.set(owned, { table, key, candidate: owned, size })
    cacheBytes += size
  }
  function prepareRequestImages(
    input: PrepareRequestImagesInput,
    reuseScope?: object,
  ): Promise<ImagePrepareResult> {
    const refused = (rejected: ImagePrepareRejection) => Promise.resolve({ rejected })
    if (closed) return refused({ reason: 'provider_unavailable', cause: 'closed' })
    const admission = admitBatch()
    if ('refused' in admission) return admission.refused
    const { validated, sourceBytes } = admission
    inFlightBytes += sourceBytes
    let reserved = sourceBytes
    const own = validated.images.map(image => ({ ...image, bytes: new Uint8Array(image.bytes) }))
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    validated.signal.addEventListener('abort', onAbort, { once: true })
    let table: Map<string, Candidate> | undefined
    if (reuseScope) {
      table = scopes.get(reuseScope)
      if (!table) {
        table = new Map()
        scopes.set(reuseScope, table)
      }
    }
    const cursors: Cursor[] = []
    const reserve = (amount: number) => {
      if (!Number.isSafeInteger(amount) || amount + inFlightBytes > p.maxInFlightBytes)
        reject({ reason: 'provider_unavailable', cause: 'busy' })
      inFlightBytes += amount
      reserved += amount
    }
    const release = (amount: number) => {
      inFlightBytes -= amount
      reserved -= amount
    }
    const check = () => {
      if (controller.signal.aborted) reject({ reason: 'aborted' })
      const available = codec.available()
      if (available !== true)
        reject({
          reason: 'provider_unavailable',
          cause: available === false ? 'codec_unavailable' : 'codec_failure',
        })
    }
    async function next(cursor: Cursor, imageIndex: number): Promise<Candidate | undefined> {
      while (cursor.explored < Math.min(p.maxAttemptsPerImage, cursor.specs.length)) {
        check()
        const ordinal = ++cursor.explored
        const key = JSON.stringify([
          cursor.sourceDigest,
          cursor.input.mediaType,
          cursor.input.targetMaxBytes,
          policyDigest,
          codec.revision,
          IMAGE_PREPARATION_ALGORITHM_REVISION,
          ordinal,
        ])
        const cached = table?.get(key)
        if (cached) {
          const entry = lru.get(cached)
          if (entry) {
            lru.delete(cached)
            lru.set(cached, entry)
          }
          if (cached.image) {
            reserve(cached.image.bytes.byteLength)
            return {
              ordinal,
              image: { ...cached.image, bytes: new Uint8Array(cached.image.bytes) },
            }
          }
          continue
        }
        const spec = cursor.specs[ordinal - 1]
        if (!spec) continue
        if (unavailableSpec(spec, cursor)) {
          cursor.pending.set(key, { ordinal, image: null })
          continue
        }
        reserve(p.candidateMaxBytes)
        const encoded = await cursor.decoded.encode(spec)
        check()
        if ('failure' in encoded) {
          release(p.candidateMaxBytes)
          if (encoded.failure === 'unsupported') {
            cursor.pending.set(key, { ordinal, image: null })
            continue
          }
          codecFailure(encoded.failure, imageIndex, true)
        }
        const image = encodedImage(encoded, spec)
        release(p.candidateMaxBytes)
        if (image.bytes.byteLength > p.candidateMaxBytes) {
          continue
        }
        if (image.bytes.byteLength > cursor.input.targetMaxBytes) {
          cursor.pending.set(key, { ordinal, image: null })
          continue
        }
        reserve(image.bytes.byteLength)
        const candidate = { ordinal, image: { ...image, bytes: new Uint8Array(image.bytes) } }
        cursor.pending.set(key, candidate)
        return candidate
      }
      return undefined

      function encodedImage(encoded: { ok: EncodedImage }, spec: ImageEncodeSpec): EncodedImage {
        if (!dataOnly(encoded.ok))
          reject({ reason: 'provider_unavailable', cause: 'codec_failure' })
        const valid = encodedSchema.safeParse(encoded.ok)
        if (!valid.success) reject({ reason: 'provider_unavailable', cause: 'codec_failure' })
        const image = valid.data
        if (
          image.mediaType !== mime[spec.format] ||
          image.width > spec.width ||
          image.height > spec.height ||
          image.width < p.minWidth ||
          image.height < p.minHeight
        )
          reject({ reason: 'provider_unavailable', cause: 'codec_failure' })
        return image
      }

      function unavailableSpec(spec: ImageEncodeSpec, cursor: Cursor): boolean {
        if (
          spec.width < p.minWidth ||
          spec.height < p.minHeight ||
          !codec.outputFormats.includes(spec.format) ||
          (cursor.decoded.hasAlpha && spec.format === 'jpeg' && p.alphaBackground === null)
        )
          return true
        return false
      }
    }
    const task = runPreparation()
    active.set(task, controller)
    const completion = task.finally(() => {
      active.delete(task)
    })
    return completion

    async function runPreparation(): Promise<ImagePrepareResult> {
      try {
        check()
        checkNonImageBudget()
        for (const [i, image] of own.entries()) {
          checkSourceImage(image, i)
          const limits = { maxPixels: p.decodedMaxPixels, maxDimension: p.decodedMaxDimension }
          const inspected = await codec.inspect(image.bytes, limits)
          check()
          const metadata = inspectedMetadata(inspected, image, i)
          reserve(metadata.width * metadata.height * 4)
          const decodedResult = await codec.decode(image.bytes, metadata, limits)
          const decoded = requireDecoded(decodedResult, i)
          const cursor: Cursor = {
            input: image,
            metadata,
            decoded: decoded.ok,
            sourceDigest: digest(image.bytes),
            specs: specsFor(decoded.ok.width, decoded.ok.height, p),
            explored: 0,
            pending: new Map(),
          }
          cursors.push(cursor)
          check()
          selectOriginalImage(cursor, decoded, metadata, image)
          while (!cursor.selected) {
            const candidate = await next(cursor, i)
            selectPerImageCandidate(cursor, candidate, image, i)
          }
        }
        const total = () =>
          validated.nonImageWireBytes +
          cursors.reduce(
            (sum, c) => sum + (c.selected?.image ? imageWireBytes(c.selected.image) : 0),
            0,
          )
        if (validated.maxRequestBytes !== null && total() > validated.maxRequestBytes) {
          const ordered = cursorsByWireContribution()
          for (const { cursor, index } of ordered) {
            while (total() > validated.maxRequestBytes) {
              const candidate = await next(cursor, index)
              if (!candidate) break
              selectSmallerCandidate(cursor, candidate)
            }
            if (total() <= validated.maxRequestBytes) break
          }
          if (total() > validated.maxRequestBytes)
            reject({ reason: 'no_candidate', stage: 'request_total' })
        }
        check()
        const images = preparedImages()
        const drained = await Promise.allSettled(cursors.map(closeDecoded))
        requireDrained(drained)
        check()
        publishPreparedCandidates()
        return { prepared: { images, exploredThrough: cursors.map(cursor => cursor.explored) } }
      } catch (error) {
        return {
          rejected: preparationFailure(error),
        }
      } finally {
        const drained = await Promise.allSettled(cursors.map(closeDecoded))
        validated.signal.removeEventListener('abort', onAbort)
        inFlightBytes -= reserved
        if (drained.some(result => result.status === 'rejected'))
          return { rejected: { reason: 'provider_unavailable', cause: 'codec_failure' } }
      }
    }

    function admitBatch():
      | { validated: ReturnType<typeof inputSchema.parse>; sourceBytes: number }
      | { refused: Promise<ImagePrepareResult> } {
      const admissionRefused = (rejected: ImagePrepareRejection) => ({ refused: refused(rejected) })
      if (!dataOnly(input)) return admissionRefused({ reason: 'malformed_input', field: 'input' })
      const parsed = inputSchema.safeParse(input)
      if (!parsed.success)
        return admissionRefused({
          reason: 'malformed_input',
          field:
            parsed.error.issues[0]?.path
              .map(part => (typeof part === 'number' ? 'item' : String(part)))
              .join('.') || 'input',
        })
      const validated = parsed.data
      if (new Set(validated.images.map(image => image.position)).size !== validated.images.length)
        return admissionRefused({ reason: 'malformed_input', field: 'images.position' })
      if (reuseScope !== undefined && (reuseScope === null || typeof reuseScope !== 'object'))
        return admissionRefused({ reason: 'malformed_input', field: 'reuseScope' })
      if (validated.signal.aborted) return admissionRefused({ reason: 'aborted' })
      const source = sourceAdmission()
      if ('refused' in source) return source
      return { validated, sourceBytes: source.sourceBytes }

      function sourceAdmission():
        { sourceBytes: number } | { refused: Promise<ImagePrepareResult> } {
        try {
          const available = codec.available()
          if (available !== true)
            return admissionRefused({
              reason: 'provider_unavailable',
              cause: available === false ? 'codec_unavailable' : 'codec_failure',
            })
        } catch {
          return admissionRefused({ reason: 'provider_unavailable', cause: 'codec_failure' })
        }
        for (const [imageIndex, image] of validated.images.entries()) {
          if (image.bytes.byteLength > p.sourceMaxBytes)
            return admissionRefused({ reason: 'source_resource_limit', imageIndex })
        }
        const sourceBytes = validated.images.reduce(
          (total, image) => total + image.bytes.byteLength,
          0,
        )
        if (
          !Number.isSafeInteger(sourceBytes) ||
          active.size >= p.maxConcurrent ||
          sourceBytes + inFlightBytes > p.maxInFlightBytes
        )
          return admissionRefused({ reason: 'provider_unavailable', cause: 'busy' })
        return { sourceBytes }
      }
    }

    function inspectedMetadata(
      inspected: CodecResult<ImageMetadata>,
      image: ImagePrepareInput,
      i: number,
    ): ImageMetadata {
      if ('failure' in inspected) codecFailure(inspected.failure, i, false)
      if (!dataOnly(inspected.ok))
        reject({ reason: 'provider_unavailable', cause: 'codec_failure' })
      const valid = metadataSchema.safeParse(inspected.ok)
      if (!valid.success) reject({ reason: 'provider_unavailable', cause: 'codec_failure' })
      const metadata = valid.data
      if (metadata.mediaType !== image.mediaType)
        reject({ reason: 'malformed_image', imageIndex: i })
      if (metadata.pages !== 1) reject({ reason: 'animated_input', imageIndex: i })
      if (
        metadata.width > p.decodedMaxDimension ||
        metadata.height > p.decodedMaxDimension ||
        metadata.width * metadata.height > p.decodedMaxPixels
      )
        reject({ reason: 'source_resource_limit', imageIndex: i })
      return metadata
    }

    function selectOriginalImage(
      cursor: Cursor,
      decoded: { ok: DecodedImage },
      metadata: ImageMetadata,
      image: ImagePrepareInput,
    ): void {
      const swap = metadata.orientation >= 5
      if (
        decoded.ok.width !== (swap ? metadata.height : metadata.width) ||
        decoded.ok.height !== (swap ? metadata.width : metadata.height) ||
        decoded.ok.hasAlpha !== metadata.hasAlpha
      )
        reject({ reason: 'provider_unavailable', cause: 'codec_failure' })
      if (
        metadata.orientation === 1 &&
        image.bytes.byteLength <= image.targetMaxBytes &&
        image.bytes.byteLength <= p.candidateMaxBytes &&
        decoded.ok.width <= p.maxWidth &&
        decoded.ok.height <= p.maxHeight
      )
        cursor.selected = {
          ordinal: 0,
          image: {
            bytes: image.bytes,
            mediaType: image.mediaType,
            width: decoded.ok.width,
            height: decoded.ok.height,
          },
        }
    }

    function checkNonImageBudget(): void {
      if (
        validated.maxRequestBytes !== null &&
        validated.nonImageWireBytes > validated.maxRequestBytes
      )
        reject(
          own.length
            ? { reason: 'no_candidate', stage: 'request_total' }
            : {
                reason: 'exact_request_limit_exceeded',
                actualBytes: validated.nonImageWireBytes,
                limitBytes: validated.maxRequestBytes,
              },
        )
    }

    function preparedImages(): PreparedImage[] {
      const images: PreparedImage[] = cursors.map(cursor => {
        const candidate = cursor.selected
        if (!candidate?.image)
          return reject({ reason: 'provider_unavailable', cause: 'codec_failure' })
        reserve(candidate.image.bytes.byteLength)
        return {
          ...candidate.image,
          bytes: new Uint8Array(candidate.image.bytes),
          sourceDigest: cursor.sourceDigest,
          targetDigest: digest(candidate.image.bytes),
          transformRevision: IMAGE_PREPARATION_ALGORITHM_REVISION,
          policyDigest,
          changed: candidate.ordinal !== 0,
          candidateOrdinal: candidate.ordinal,
        }
      })
      return images
    }

    function publishPreparedCandidates(): void {
      if (table && reuseScope && scopes.get(reuseScope) === table)
        for (const cursor of cursors)
          for (const [key, candidate] of cursor.pending) publish(table, key, candidate)
    }

    function checkSourceImage(image: ImagePrepareInput, i: number): void {
      if (image.bytes.byteLength > p.sourceMaxBytes)
        reject({ reason: 'source_resource_limit', imageIndex: i })
      if (!codec.inputMediaTypes.includes(image.mediaType))
        reject({ reason: 'unsupported_encoding', imageIndex: i })
    }

    function requireDecoded(decoded: CodecResult<DecodedImage>, i: number): { ok: DecodedImage } {
      if ('failure' in decoded) {
        check()
        codecFailure(decoded.failure, i, true)
      }
      return decoded
    }

    function selectPerImageCandidate(
      cursor: Cursor,
      candidate: Candidate | undefined,
      image: ImagePrepareInput,
      i: number,
    ): void {
      if (!candidate) reject({ reason: 'no_candidate', stage: 'per_image', imageIndex: i })
      if (candidate.image && candidate.image.bytes.byteLength <= image.targetMaxBytes)
        cursor.selected = candidate
    }

    function cursorsByWireContribution() {
      return cursors
        .map((cursor, index) => ({ cursor, index }))
        .sort(
          (a, b) =>
            (b.cursor.selected?.image ? imageWireBytes(b.cursor.selected.image) : 0) -
              (a.cursor.selected?.image ? imageWireBytes(a.cursor.selected.image) : 0) ||
            a.index - b.index,
        )
    }

    function selectSmallerCandidate(cursor: Cursor, candidate: Candidate): void {
      const previous = cursor.selected
      if (
        candidate.image &&
        previous?.image &&
        candidate.image.bytes.byteLength <= cursor.input.targetMaxBytes &&
        imageWireBytes(candidate.image) < imageWireBytes(previous.image)
      ) {
        cursor.selected = candidate
      }
    }

    function requireDrained(drained: readonly PromiseSettledResult<void>[]): void {
      if (drained.some(result => result.status === 'rejected'))
        reject({ reason: 'provider_unavailable', cause: 'codec_failure' })
    }

    function preparationFailure(error: unknown): ImagePrepareRejection {
      return controller.signal.aborted
        ? { reason: 'aborted' }
        : error instanceof Rejection
          ? error.rejection
          : { reason: 'provider_unavailable', cause: 'codec_failure' }
    }
  }
  const preparer: ImagePreparer = Object.freeze({
    algorithmRevision: IMAGE_PREPARATION_ALGORITHM_REVISION,
    codecRevision: codec.revision,
    policyDigest,
    prepareRequestImages,
    clearScope,
    close() {
      closed = true
      closing ??= (async () => {
        for (const controller of active.values()) controller.abort()
        await Promise.all(active.keys())
        scopes = new WeakMap()
        lru.clear()
        cacheBytes = 0
      })()
      return closing
    },
  })
  preparers.add(preparer)
  return { ready: preparer }
}
