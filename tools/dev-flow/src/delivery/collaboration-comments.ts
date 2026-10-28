import { canonical, digest } from '../integration/parse.ts'
import { commentMarker } from './events.ts'
import { InputError } from './protocol.ts'
import { collaborationJson } from './collaboration-json.ts'
import { parseCollaborationRecord } from './collaboration-parse.ts'
import { RECORD_MARKERS, type CollaborationRecord } from './collaboration-records.ts'

const FENCE = '```json omne-collaboration:v1'

export function encodeRecordComment(value: CollaborationRecord): string {
  const record = parseCollaborationRecord(value)
  return `<!-- ${RECORD_MARKERS[record.kind]} -->\n\n${FENCE}\n${canonical(record)}\n\`\`\`\n`
}

/** Recognizes machine records only. Author and authority checks belong to the REST reader. */
export function decodeRecordComment(body: string): CollaborationRecord | undefined {
  const marker = commentMarker(body)
  const entry = Object.entries(RECORD_MARKERS).find(([, value]) => value === marker)
  if (entry === undefined) return undefined
  const [kind, expected] = entry
  const lines = body.split('\n')
  if (lines[0] !== `<!-- ${expected} -->`) throw new InputError('collaboration-marker-invalid')
  const starts = lines.flatMap((line, index) =>
    line.startsWith('```json omne-collaboration:') ? [index] : [],
  )
  const start = starts[0]
  if (starts.length !== 1 || start === undefined || lines[start] !== FENCE)
    throw new InputError('collaboration-schema-fence-invalid')
  const end = lines.findIndex((line, index) => index > start && line === '```')
  if (end < 0) throw new InputError('collaboration-schema-fence-unclosed')
  const record = parseCollaborationRecord(collaborationJson(lines.slice(start + 1, end).join('\n')))
  if (record.kind !== kind) throw new InputError('collaboration-marker-kind-mismatch')
  return record
}

export function commentDigest(body: string): string {
  return digest(body)
}
