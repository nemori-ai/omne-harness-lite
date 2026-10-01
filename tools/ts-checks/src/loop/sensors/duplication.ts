// 重复代码：检测交给 jscpd 的核心库（@jscpd/core 与 @jscpd/tokenizer 4.0.1，MIT），这里只做
// 范围、按成员汇总与排序。它按词法记号找相同的片段，改了名字的重复查不出。
import { createRequire } from 'node:module'
import { Detector, MemoryStore, type IClone } from '@jscpd/core'
import { memberOf } from '../../metrics/graph.ts'
import type { SourceFile } from '../../rule.ts'

// @jscpd/tokenizer 4.0.1 的 ESM 入口（dist/index.mjs）里有 141 处不带扩展名的
// `reprism/languages/*` 导入，而 reprism 没有 exports 映射，Node 的 ESM 解析找不到它们；
// 同一个包的 CommonJS 入口可用，所以只有这一个包经 require 取，类型取自包自己的声明。
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
  /** B 端止行是按 A 端行数推算的（库给的不可信），见 `plausibleEnd`。 */
  readonly bEndEstimated: boolean
}

export interface MemberDuplication {
  readonly member: string
  readonly lines: number
  readonly duplicatedLines: number
  /** 百分数。 */
  readonly percent: number
}

export interface DuplicationResult {
  /** 跨成员的排前面，再按行数从多到少。 */
  readonly clones: readonly Clone[]
  readonly members: readonly MemberDuplication[]
  readonly lines: number
  readonly duplicatedLines: number
  /** 全仓重复行占比，百分数，一位小数。 */
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

/**
 * B 端的止行。jscpd 4.0.1 把克隆往后扩时，B 端止行取自存储里同一哈希最先存下的那一帧，那一帧可能在别处
 * （同文件的另一段，甚至另一个文件），于是 B 端止行偶尔早于起行、或远超 A 端的长度、或超出文件末尾。
 * A 端是逐帧连续扫过来的，可信。B 端止行早于起行、或跨度超过 A 端的两倍加两行时，按 A 端行数从 B 端起行推算。
 */
export function plausibleEnd(
  a: { readonly start: number; readonly end: number },
  b: { readonly start: number; readonly end: number },
): { readonly end: number; readonly estimated: boolean } {
  const span = a.end - a.start
  if (b.end >= b.start && b.end - b.start <= 2 * span + 2) return { end: b.end, estimated: false }
  return { end: b.start + span, estimated: true }
}

/** 文件路径须相对于仓库根、落在成员里；调用方负责只给要量的那些（与度量同一口径）。 */
export async function detectDuplication(
  files: readonly SourceFile[],
  options: DuplicationOptions,
): Promise<DuplicationResult> {
  // Detector 会改写传进去的选项与校验器数组，所以每次都给新的。
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
