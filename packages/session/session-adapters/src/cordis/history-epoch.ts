import { decodeEpochId, type EpochId } from '@omne-harness/request-context-contract'

export function contextEpochOf(text: string): EpochId | undefined {
  let escaped = ''
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0
    escaped +=
      code <= 0x20 || code === 0x7f || character === '%'
        ? `%${code.toString(16).padStart(2, '0')}`
        : character
  }
  const decoded = decodeEpochId(escaped)
  return 'ok' in decoded ? decoded.ok : undefined
}

export function sessionEpochOf(epoch: string): string {
  return epoch.replace(/%([0-9a-f]{2})/gu, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  )
}
