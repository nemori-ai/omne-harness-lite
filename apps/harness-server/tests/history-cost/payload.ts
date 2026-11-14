import { createHash } from 'node:crypto'

export type PayloadKind = 'inline' | 'text'

export const INLINE_THRESHOLD = 16_384
export const PAGE_BYTES = 8192
export const PAYLOAD_FILE = 'history-cost-payload.txt'
export const PAYLOAD_SCRIPT = `cat ${PAYLOAD_FILE}`

function textOf(bytes: number): string {
  const first = 'HISTORY-COST-BEGIN 中文🙂\n'
  const last = '\nHISTORY-COST-END\n'
  return first + 'x'.repeat(bytes - Buffer.byteLength(first + last)) + last
}

export function payload(kind: PayloadKind) {
  const body = kind === 'inline' ? textOf(4096) : textOf(32_768)
  return {
    kind,
    body,
    bytes: Buffer.byteLength(body),
    digest: createHash('sha256').update(body).digest('hex'),
  }
}
