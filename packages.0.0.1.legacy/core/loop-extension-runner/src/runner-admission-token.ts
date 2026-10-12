import { copyJsonValue, judgeContentBlock, type CallId } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { passKeys, runnerFormat } from './keys.ts'
import { OFFICIAL_ADMISSION_NAME, type AdmissionToken } from '@omne-harness-lite/tool-admission'
import { admissionArgumentDigest } from './admission-digest.ts'

const officialAdmissionName = OFFICIAL_ADMISSION_NAME
const prefix = 'admission.2.'
const invalid = Object.freeze({ invalidInput: true } as const)

/** A decoded locator is not authorization or evidence that a conclusion exists. */
export interface RunnerAdmissionTokenLocator {
  readonly callId: CallId
  readonly argumentDigest: string
  readonly finalKey: string
}

function officialFinalKey(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith(`${runnerFormat}/`)) return false
  const parts: unknown = JSON.parse(value.slice(runnerFormat.length + 1))
  if (!Array.isArray(parts) || parts.length !== 5 || typeof parts[3] !== 'string') return false
  const expected = passKeys({
    position: 'before_action',
    anchor: parts[3],
    extension: officialAdmissionName,
    occurrence: { kind: 'final' },
  })
  return !('invalidInput' in expected) && expected.final === value
}

function encode(locator: RunnerAdmissionTokenLocator): AdmissionToken {
  const tuple = [locator.callId, locator.argumentDigest, locator.finalKey]
  return `${prefix}${Buffer.from(JSON.stringify(tuple), 'utf8').toString('base64url')}` as AdmissionToken
}

/** Own and validate the call before encoding its intended official conclusion. */
export function encodeRunnerAdmissionToken(
  callInput: unknown,
  finalKey: unknown,
): AdmissionToken | typeof invalid {
  try {
    if (!officialFinalKey(finalKey)) return invalid
    const copied = copyJsonValue(callInput)
    if ('failed' in copied) return invalid
    const judged = judgeContentBlock(copied.ok)
    if (!('ok' in judged) || judged.ok.kind !== 'tool_call' || !('arguments' in judged.ok))
      return invalid
    return encode({
      callId: judged.ok.callId,
      argumentDigest: admissionArgumentDigest(judged.ok.arguments),
      finalKey,
    })
  } catch {
    return invalid
  }
}

/** Decode only the canonical formal encoding. Durable verification is a separate operation. */
export function decodeRunnerAdmissionToken(
  value: unknown,
): RunnerAdmissionTokenLocator | typeof invalid {
  if (typeof value !== 'string' || !value.startsWith(prefix)) return invalid
  try {
    const bytes = Buffer.from(value.slice(prefix.length), 'base64url')
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const tuple: unknown = JSON.parse(text)
    if (!Array.isArray(tuple) || tuple.length !== 3) return invalid
    const call = parseOpaqueIdentifier(tuple[0], 'CallId')
    if (
      !('ok' in call) ||
      typeof tuple[1] !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(tuple[1]) ||
      !officialFinalKey(tuple[2])
    )
      return invalid
    const locator = Object.freeze({
      callId: call.ok,
      argumentDigest: tuple[1],
      finalKey: tuple[2],
    })
    return encode(locator) === value ? locator : invalid
  } catch {
    return invalid
  }
}
