import { createHash } from 'node:crypto'
import { jsonNumberSource } from '../../../packages/core/content-blocks/dist/index.js'

const digest = value => createHash('sha256').update(value).digest('hex')
const idHeaders = [
  'x-request-id',
  'x-openrouter-request-id',
  'x-generation-id',
  'x-openrouter-generation-id',
]

function safeIdentifier(value, secret) {
  if (typeof value !== 'string') return undefined
  const bytes = Buffer.byteLength(value, 'utf8')
  if (
    bytes <= 256 &&
    /^[A-Za-z0-9._:-]+$/.test(value) &&
    (secret === undefined || !value.includes(secret))
  )
    return value
  return { omitted: true, bytes, sha256: digest(value) }
}

function safeStatus(value) {
  if (value === undefined) return undefined
  try {
    const status = Number(jsonNumberSource(value))
    return Number.isSafeInteger(status) && status >= 0 && status <= 999_999 ? status : undefined
  } catch {
    return undefined
  }
}

function safeCode(value, secret) {
  if (typeof value !== 'string') return undefined
  if (value.length <= 64 && /^[A-Za-z0-9_.-]+$/.test(value) && !value.includes(secret ?? '\0'))
    return value
  return { omitted: true, bytes: Buffer.byteLength(value), sha256: digest(value) }
}

export function safeFailure(failure, secret) {
  if (!failure || typeof failure !== 'object') return null
  const statusCode = safeStatus(failure.statusCode)
  const upstream = failure.upstreamError
  return {
    cause: safeCode(failure.cause, secret),
    ...(failure.inBand === true ? { inBand: true } : {}),
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(typeof failure.localError === 'string'
      ? {
          localError: {
            bytes: Buffer.byteLength(failure.localError),
            sha256: digest(failure.localError),
          },
        }
      : {}),
    ...(upstream && typeof upstream === 'object'
      ? {
          upstreamError: {
            ...(upstream.code === undefined ? {} : { code: safeCode(upstream.code, secret) }),
            ...(typeof upstream.message === 'string'
              ? {
                  message: {
                    bytes: Buffer.byteLength(upstream.message),
                    sha256: digest(upstream.message),
                  },
                }
              : {}),
            ...(upstream.raw === undefined ? {} : { rawOmitted: true }),
          },
        }
      : {}),
  }
}

export function safeCausality(value, secret) {
  const failure = safeFailure(value?.failure, secret)
  const statusCode = safeStatus(value?.failure?.statusCode)
  const headers = value?.rawHeaders ?? value?.rawResponse?.headers
  const requestHeaders = {}
  if (headers && typeof headers === 'object') {
    for (const name of idHeaders) {
      const raw = Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1]
      const candidate = Array.isArray(raw) ? raw[0] : raw
      const safe = safeIdentifier(candidate, secret)
      if (safe !== undefined) requestHeaders[name] = safe
    }
  }
  return {
    failure,
    upstreamRequestId:
      safeIdentifier(value?.upstreamRequestId ?? value?.route?.upstreamRequestId, secret) ?? null,
    httpStatus:
      value?.failure?.inBand === true ||
      statusCode === undefined ||
      statusCode < 100 ||
      statusCode > 599
        ? null
        : statusCode,
    inBandStatusCode: value?.failure?.inBand === true ? (statusCode ?? null) : null,
    ...(Object.keys(requestHeaders).length ? { requestIdHeaders: requestHeaders } : {}),
  }
}
