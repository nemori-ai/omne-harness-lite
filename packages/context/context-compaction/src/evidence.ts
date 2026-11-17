import { createHash } from 'node:crypto'
import { compactionRequestText, type CompactionTaskRef } from '@omne-harness/agent-contract'

export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value)
    .filter(([, member]) => member !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, member]) => `${JSON.stringify(key)}:${canonical(member)}`)
    .join(',')}}`
}

export const digestText = (text: string) =>
  `sha256:${createHash('sha256').update(text).digest('hex')}`
export const digest = (value: unknown) => digestText(canonical(value))
export const compactionRequestDigest = (request: Parameters<typeof compactionRequestText>[0]) =>
  digestText(compactionRequestText(request))

export function taskEvidence(ref: CompactionTaskRef, kind: string, payload: unknown) {
  return {
    owner: ref.authority,
    record: `${kind}/${digest([ref.tenant, ref.task])}`,
    revision: '1',
    digest: digest({ ref, kind, payload }),
  }
}
