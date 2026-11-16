import { createRequire } from 'node:module'
import { Detector, MemoryStore, type IClone } from '@jscpd/core'
import { memberOf } from '../../deps/graph.ts'
import type { SourceFile } from '../../core/rule.ts'

const require = createRequire(import.meta.url)
const { Tokenizer } = require('@jscpd/tokenizer') as typeof import('@jscpd/tokenizer')

export interface CloneEnd {
  readonly path: string
  readonly member: string
  readonly start: number
  readonly end: number
}

export interface Clone {
  readonly a: CloneEnd
  readonly b: CloneEnd
  readonly lines: number
  readonly crossMember: boolean
  readonly bEndEstimated: boolean
}

export interface MemberDuplication {
  readonly member: string
  readonly lines: number
  readonly duplicatedLines: number
  readonly percent: number
}

export interface DuplicationResult {
  readonly clones: readonly Clone[]
  readonly members: readonly MemberDuplication[]
  readonly lines: number
  readonly duplicatedLines: number
  readonly percent: number
}

export interface DuplicationOptions {
  readonly minTokens: number
  readonly minLines: number
}

const round1 = (value: number) => Math.round(value * 10) / 10

function lineCount(text: string): number {
  if (text === '') return 0
  const lines = text.split('\n').length
  return text.endsWith('\n') ? lines - 1 : lines
}

function endOf(side: IClone['duplicationA']): CloneEnd {
  const member = memberOf(side.sourceId)?.path ?? ''
  return { path: side.sourceId, member, start: side.start.line, end: side.end.line }
}

export function plausibleEnd(
  a: { readonly start: number; readonly end: number },
  b: { readonly start: number; readonly end: number },
): { readonly end: number; readonly estimated: boolean } {
  const span = a.end - a.start
  if (b.end >= b.start && b.end - b.start <= 2 * span + 2) return { end: b.end, estimated: false }
  return { end: b.start + span, estimated: true }
}

export async function detectDuplication(
  files: readonly SourceFile[],
  options: DuplicationOptions,
): Promise<DuplicationResult> {
  const detector = new Detector(new Tokenizer(), new MemoryStore(), [], {
    minTokens: options.minTokens,
    minLines: options.minLines,
  })
  const found: IClone[] = []
  for (const file of [...files].sort((x, y) => x.path.localeCompare(y.path)))
    found.push(
      ...(await detector.detect(
        file.path,
        file.text,
        file.path.endsWith('.tsx') ? 'tsx' : 'typescript',
      )),
    )

  const covered = new Map<string, Set<number>>()
  const cover = (end: CloneEnd) => {
    const lines = covered.get(end.path) ?? new Set<number>()
    for (let line = end.start; line <= end.end; line += 1) lines.add(line)
    covered.set(end.path, lines)
  }
  const clones = found.map((clone): Clone => {
    const a = endOf(clone.duplicationA)
    const reported = endOf(clone.duplicationB)
    const { end, estimated } = plausibleEnd(a, reported)
    const b = { ...reported, end }
    cover(a)
    cover(b)
    return {
      a,
      b,
      lines: a.end - a.start + 1,
      crossMember: a.member !== b.member,
      bEndEstimated: estimated,
    }
  })
  clones.sort(
    (x, y) =>
      Number(y.crossMember) - Number(x.crossMember) ||
      y.lines - x.lines ||
      x.a.path.localeCompare(y.a.path) ||
      x.a.start - y.a.start,
  )

  const totals = new Map<string, { lines: number; duplicated: number }>()
  for (const file of files) {
    const member = memberOf(file.path)?.path
    if (member === undefined) continue
    const total = totals.get(member) ?? { lines: 0, duplicated: 0 }
    const lines = lineCount(file.text)
    total.lines += lines
    total.duplicated += [...(covered.get(file.path) ?? [])].filter(line => line <= lines).length
    totals.set(member, total)
  }
  const members = [...totals]
    .map(([member, total]) => ({
      member,
      lines: total.lines,
      duplicatedLines: total.duplicated,
      percent: total.lines === 0 ? 0 : round1((total.duplicated / total.lines) * 100),
    }))
    .sort((x, y) => y.percent - x.percent || x.member.localeCompare(y.member))
  const lines = members.reduce((sum, member) => sum + member.lines, 0)
  const duplicatedLines = members.reduce((sum, member) => sum + member.duplicatedLines, 0)
  return {
    clones,
    members,
    lines,
    duplicatedLines,
    percent: lines === 0 ? 0 : round1((duplicatedLines / lines) * 100),
  }
}
