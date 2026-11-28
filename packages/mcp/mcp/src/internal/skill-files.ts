import { writeJsonText } from '@omne-harness/json-text'
import type {
  McpSkill,
  ResourceContent,
  SkillFileEntry,
  SkillFileText,
} from '@omne-harness/mcp-contract'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import { parse } from 'yaml'

/** Files read and checked are kept in memory by digest, up to this many bytes in all. */
const CACHE_BYTES = 32 * 1024 * 1024

export type Checked =
  | Readonly<{ kind: 'text'; bytes: Uint8Array }>
  | Readonly<{ kind: 'changed' }>
  | Readonly<{ kind: 'not-text' }>

const CHANGED: Checked = { kind: 'changed' }
const NOT_TEXT: Checked = { kind: 'not-text' }

function bytesOf(content: ResourceContent): Uint8Array | undefined {
  if ('text' in content) return new TextEncoder().encode(content.text)
  try {
    return Uint8Array.from(atob(content.blob), char => char.charCodeAt(0))
  } catch {
    return undefined
  }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return `sha256:${[...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}

function frontmatterOf(text: string): unknown {
  const lines = text.replace(/^﻿/u, '').replaceAll('\r\n', '\n')
  if (!lines.startsWith('---\n')) return undefined
  const end = lines.indexOf('\n---', 3)
  const after = end < 0 ? undefined : lines.slice(end + 4)
  if (after === undefined || (after !== '' && !after.startsWith('\n'))) return undefined
  try {
    return parse(lines.slice(4, end + 1)) as unknown
  } catch {
    return undefined
  }
}

/** A value with the keys of every object in order, so two values that mean the same write the same. */
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered)
  if (typeof value !== 'object' || value === null) return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(record)
      .toSorted()
      .map(key => [key, ordered(record[key])]),
  )
}

const sameValue = (left: unknown, right: unknown): boolean =>
  left !== undefined && JSON.stringify(ordered(left)) === JSON.stringify(ordered(right))

/** A fetched file, held to its listing: the size and digest of its bytes, and for the skill's SKILL.md the frontmatter. */
export async function checkedFile(
  file: SkillFileEntry,
  skill: McpSkill,
  content: ResourceContent,
): Promise<Checked> {
  const bytes = bytesOf(content)
  if (bytes?.length !== file.size || (await sha256(bytes)) !== file.digest) return CHANGED
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return file.uri === skill.uri ? CHANGED : NOT_TEXT
  }
  if (file.uri === skill.uri) {
    const listed: unknown = JSON.parse(writeJsonText(skill.frontmatter))
    if (!sameValue(frontmatterOf(text), listed)) return CHANGED
  }
  return { kind: 'text', bytes }
}

const continues = (bytes: Uint8Array, at: number) => ((bytes[at] ?? 0) & 0xc0) === 0x80

/** The bytes from `start`, at most `length` of them, cut at whole characters; never empty before the end. */
export function sliceText(
  bytes: Uint8Array,
  range: Readonly<{ start: number; length: number }>,
): Outcome<SkillFileText, never> {
  const total = bytes.length
  let start = Math.min(Math.max(0, range.start), total)
  while (continues(bytes, start)) start += 1
  let end = Math.min(total, start + Math.max(1, range.length))
  while (continues(bytes, end)) end -= 1
  if (end === start && start < total) {
    end += 1
    while (continues(bytes, end)) end += 1
  }
  return succeed({ text: new TextDecoder().decode(bytes.subarray(start, end)), start, total })
}

export type SkillFileCache = Readonly<{
  get(file: SkillFileEntry): Uint8Array | undefined
  put(file: SkillFileEntry, bytes: Uint8Array): void
}>

/** Checked files by digest; the least recently read go first once the bytes pass the limit. */
export function createSkillFileCache(limit = CACHE_BYTES): SkillFileCache {
  const kept = new Map<string, Uint8Array>()
  let held = 0
  const keyOf = (file: SkillFileEntry) => `${file.digest}:${String(file.size)}`
  return {
    get(file) {
      const key = keyOf(file)
      const hit = kept.get(key)
      if (hit === undefined) return undefined
      kept.delete(key)
      kept.set(key, hit)
      return hit
    },
    put(file, bytes) {
      const key = keyOf(file)
      if (bytes.length > limit || kept.has(key)) return
      kept.set(key, bytes)
      held += bytes.length
      for (const [oldest, dropped] of kept) {
        if (held <= limit) break
        kept.delete(oldest)
        held -= dropped.length
      }
    },
  }
}
