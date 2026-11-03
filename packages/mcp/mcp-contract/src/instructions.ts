// The byte bound of peer instructions.
import { isInstructionsDigest } from './brands.ts'
import { digestOf } from './digest.ts'
import type { BoundedInstructions } from './values.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8')

/** True for a UTF-8 continuation byte, which never starts a character. */
function isContinuation(byte: number | undefined): boolean {
  return byte !== undefined && (byte & 0xc0) === 0x80
}

/**
 * Cuts peer instructions to at most `byteLimit` UTF-8 bytes, at a whole character, and gives the
 * digest of the whole text before the cut. `byteLimit` is a positive safe integer; anything else
 * is a broken precondition and throws `RangeError`.
 */
export function boundInstructions(text: string, byteLimit: number): BoundedInstructions {
  if (!Number.isSafeInteger(byteLimit) || byteLimit < 1)
    throw new RangeError('byteLimit is a positive safe integer')
  const digest = digestOf(text, isInstructionsDigest)
  const bytes = encoder.encode(text)
  if (bytes.length <= byteLimit) return { text, truncated: false, digest }
  let cut = byteLimit
  while (cut > 0 && isContinuation(bytes[cut])) cut -= 1
  return { text: decoder.decode(bytes.subarray(0, cut)), truncated: true, digest }
}
