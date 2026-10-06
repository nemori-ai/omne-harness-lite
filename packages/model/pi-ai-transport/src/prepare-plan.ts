import { createHash } from 'node:crypto'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type {
  PlanExecutionContext,
  PlanFailure,
  PlanInput,
} from '@omne-harness-lite/model-request-runtime'
import { finiteLimits } from './input-limits.ts'
import { object } from './json.ts'
import { composeTransformRevision, type ImagePreparationRevision } from './meter-transform.ts'
import type {
  ImagePreparer,
  ImagePrepareInput,
  ImagePrepareRejection,
} from './image-preparation/types.ts'

function cap(input: PlanInput, metric: 'maxImageBytes' | 'maxRequestBytes'): number | null {
  let effective: number | null = null
  for (const value of finiteLimits(input.snapshot, metric)) {
    // Helper budgets are finite safe integers. Larger exact caps cannot bind a buffer
    // within this provider's finite resource policy; the final gate keeps the original cap.
    const decimal = ExactDecimal.from(value)
    const amount =
      decimal.compare(ExactDecimal.from(Number.MAX_SAFE_INTEGER)) > 0
        ? Number.MAX_SAFE_INTEGER
        : Number(decimal.toString())
    effective = effective === null ? amount : Math.min(effective, amount)
  }
  return effective
}
function replaceUrls(body: JsonObject, values: ReadonlyMap<string, string>): JsonObject {
  if (!Array.isArray(body.messages)) throw new TypeError('messages required')
  return {
    ...body,
    messages: body.messages.map((message, m) => {
      if (!object(message) || !Array.isArray(message.content)) return message
      return {
        ...message,
        content: message.content.map((part, p) => {
          const url = values.get(`${m}/${p}`)
          return url !== undefined && object(part) && object(part.image_url)
            ? { ...part, image_url: { ...part.image_url, url } }
            : part
        }),
      }
    }),
  }
}
function rejection(value: ImagePrepareRejection): PlanFailure {
  switch (value.reason) {
    case 'malformed_input':
    case 'malformed_image':
    case 'decode_failed':
      return { rejected: 'invalidInput', reason: 'malformed' }
    case 'aborted':
    case 'provider_unavailable':
      return { rejected: 'unavailable' }
    case 'exact_request_limit_exceeded':
      return {
        rejected: 'invalidInput',
        reason: 'input_limit_exceeded',
        basis: 'exact',
        metric: 'maxRequestBytes',
        actual: value.actualBytes,
        limit: value.limitBytes,
      }
    case 'no_candidate':
      return {
        rejected: 'invalidInput',
        reason: 'input_size_unavailable',
        metrics: [value.stage === 'per_image' ? 'maxImageBytes' : 'maxRequestBytes'],
      }
    default:
      return {
        rejected: 'invalidInput',
        reason: 'input_size_unavailable',
        metrics: ['maxImageBytes'],
      }
  }
}
type PreparedWire = { readonly body: JsonObject; readonly preparation?: ImagePreparationRevision }
/** Request-local projection: original PlanInput/history is already validated and stays intact. */
export async function preparePlanImages(
  body: JsonObject,
  input: PlanInput,
  execution: PlanExecutionContext,
  preparer?: ImagePreparer,
): Promise<{ readonly ok: PreparedWire } | PlanFailure> {
  const images: ImagePrepareInput[] = []
  const empty = new Map<string, string>()
  if (!Array.isArray(body.messages)) return { rejected: 'invalidInput', reason: 'malformed' }
  const maxImageBytes = cap(input, 'maxImageBytes')
  const maxRequestBytes = cap(input, 'maxRequestBytes')
  const imageFailure = collectImages(body.messages)
  if (imageFailure) return imageFailure
  for (const limit of finiteLimits(input.snapshot, 'maxImages'))
    if (ExactDecimal.from(images.length).compare(ExactDecimal.from(limit)) > 0)
      return {
        rejected: 'invalidInput',
        reason: 'input_limit_exceeded',
        metric: 'maxImages',
        basis: 'exact',
        actual: images.length,
        limit,
      }
  const nonImageWireBytes = Buffer.byteLength(writeJsonLossless(replaceUrls(body, empty)), 'utf8')
  if (!images.length) {
    if (maxRequestBytes !== null && nonImageWireBytes > maxRequestBytes)
      return {
        rejected: 'invalidInput',
        reason: 'input_limit_exceeded',
        basis: 'exact',
        metric: 'maxRequestBytes',
        actual: nonImageWireBytes,
        limit: maxRequestBytes,
      }
    return { ok: { body } }
  }
  if (!preparer) return { rejected: 'unavailable' }
  const preparation = Object.freeze({
    algorithmRevision: preparer.algorithmRevision,
    codecRevision: preparer.codecRevision,
    policyDigest: preparer.policyDigest,
  })
  // Validate the owned descriptor before invoking any preparation work.
  composeTransformRevision('descriptor-check', preparation)
  const result = await preparer.prepareRequestImages(
    { images, maxRequestBytes, nonImageWireBytes, signal: execution.signal },
    execution.reuseScope,
  )
  if ('rejected' in result) return rejection(result.rejected)
  if (execution.signal.aborted) return { rejected: 'unavailable' }
  const urls = preparedUrls(result)
  return { ok: { body: replaceUrls(body, urls), preparation } }

  function collectImages(messages: readonly JsonValue[]): PlanFailure | undefined {
    for (const [m, message] of messages.entries()) {
      if (!object(message) || !Array.isArray(message.content)) continue
      for (const [p, part] of message.content.entries()) {
        if (!object(part) || part.type !== 'image_url') continue
        const rejected = appendImage(part, m, p)
        if (rejected) return rejected
      }
    }
    return undefined
  }

  function appendImage(part: JsonObject, m: number, p: number): PlanFailure | undefined {
    const value = object(part.image_url) ? part.image_url.url : undefined
    const match =
      typeof value === 'string'
        ? /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/u.exec(value)
        : null
    const mediaType = match?.[1],
      encoded = match?.[2]
    if (!mediaType || !encoded || maxImageBytes === null)
      return { rejected: 'invalidInput', reason: 'malformed' }
    const bytes = Buffer.from(encoded, 'base64')
    if (!bytes.length || bytes.toString('base64') !== encoded)
      return { rejected: 'invalidInput', reason: 'malformed' }
    const position = `${m}/${p}`
    images.push({ position, bytes, mediaType, targetMaxBytes: maxImageBytes })
    empty.set(position, '')
    return undefined
  }

  function preparedUrls(
    result: Extract<
      Awaited<ReturnType<ImagePreparer['prepareRequestImages']>>,
      { prepared: unknown }
    >,
  ): Map<string, string> {
    if (result.prepared.images.length !== images.length)
      throw new TypeError('preparer image count mismatch')
    const urls = new Map<string, string>()
    for (const [index, image] of result.prepared.images.entries()) {
      const source = images[index]
      if (
        !source ||
        image.sourceDigest !== createHash('sha256').update(source.bytes).digest('hex') ||
        image.targetDigest !== createHash('sha256').update(image.bytes).digest('hex') ||
        image.policyDigest !== preparation.policyDigest ||
        image.transformRevision !== preparation.algorithmRevision
      )
        throw new TypeError('preparer result does not match fixed source/descriptor')
      urls.set(
        source.position,
        `data:${image.mediaType};base64,${Buffer.from(image.bytes).toString('base64')}`,
      )
    }
    return urls
  }
}
