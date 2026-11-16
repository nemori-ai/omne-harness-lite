import type { Violation } from '@omne-harness/repo-toolchain/core/rule'
import { HYGIENE_BASELINE_PATH, LIMIT_KEYS, type HygieneBaseline } from './baseline.ts'
import { DOCUMENT_MESSAGE, isAllowedDocument } from './documents.ts'
import type { Measurements } from './measure.ts'

export const DOCUMENT_RULE = 'hygiene-document-allowlist'
export const COMMENT_RULE = 'hygiene-comment-forms'
export const SIZE_RULE = 'hygiene-size-bands'
export const RATCHET_RULE = 'hygiene-baseline-ratchet'

const LOOSE = '基线过宽，收紧到当前值'

export function documentViolations(current: Measurements, baseline: HygieneBaseline): Violation[] {
  const allowed = new Set(baseline.documents)
  return current.documents
    .filter(path => !allowed.has(path))
    .map(path => ({ rule: DOCUMENT_RULE, path, line: 1, message: DOCUMENT_MESSAGE }))
}

export function commentViolations(current: Measurements, baseline: HygieneBaseline): Violation[] {
  const out: Violation[] = []
  for (const [path, found] of current.comments) {
    const recorded = baseline.comments[path] ?? 0
    if (found.count > recorded)
      out.push({
        rule: COMMENT_RULE,
        path,
        line: found.firstLine,
        message:
          `注释违例 ${found.count} 条（禁止的形式 ${found.forms}、` +
          `${baseline.limits.commentRunLines} 行以上的注释块 ${found.runs}、` +
          `注释行数超线 ${found.dense}），基线 ${recorded} 条`,
      })
  }
  return out
}

export function sizeViolations(current: Measurements, baseline: HygieneBaseline): Violation[] {
  const out: Violation[] = []
  for (const [path, lines] of current.files) {
    const recorded = baseline.sizes.files[path]
    if (recorded === undefined || lines > recorded)
      out.push({
        rule: SIZE_RULE,
        path,
        line: 1,
        message: `文件 ${lines} 行，超过 ${baseline.limits.fileLines} 行的上限，基线 ${recorded ?? '无条目'}`,
      })
  }
  for (const [path, found] of current.functions) {
    const recorded = baseline.sizes.functions[path]
    if (recorded === undefined || found.count > recorded.count || found.longest > recorded.longest)
      out.push({
        rule: SIZE_RULE,
        path,
        line: found.longestLine,
        message:
          `超过 ${baseline.limits.functionLines} 行的函数 ${found.count} 个、最长 ${found.longest} 行；` +
          (recorded === undefined
            ? '基线无条目'
            : `基线 ${recorded.count} 个、最长 ${recorded.longest} 行`),
      })
  }
  return out
}

export function looseBaselineViolations(
  current: Measurements,
  baseline: HygieneBaseline,
  isPrivateMember: (directory: string) => boolean,
): Violation[] {
  const out: Violation[] = []
  const loose = (path: string, detail: string) =>
    out.push({ rule: RATCHET_RULE, path, line: 1, message: `${LOOSE}（${detail}）` })
  for (const path of baseline.documents) {
    if (!current.documentPaths.has(path)) loose(path, '文档已不存在')
    else if (isAllowedDocument(path, isPrivateMember)) loose(path, '文档已在白名单里')
  }
  for (const [path, recorded] of Object.entries(baseline.comments)) {
    if (!current.sourcePaths.has(path)) loose(path, '文件已不存在')
    else {
      const found = current.comments.get(path)?.count ?? 0
      if (found < recorded) loose(path, `注释违例 ${recorded} 条，现 ${found} 条`)
    }
  }
  for (const [path, recorded] of Object.entries(baseline.sizes.files)) {
    if (!current.sourcePaths.has(path)) loose(path, '文件已不存在')
    else {
      const found = current.files.get(path)
      if (found === undefined) loose(path, `已不超 ${baseline.limits.fileLines} 行`)
      else if (found < recorded) loose(path, `行数 ${recorded}，现 ${found}`)
    }
  }
  for (const [path, recorded] of Object.entries(baseline.sizes.functions)) {
    if (!current.sourcePaths.has(path)) loose(path, '文件已不存在')
    else {
      const found = current.functions.get(path)
      if (found === undefined) loose(path, `已无超过 ${baseline.limits.functionLines} 行的函数`)
      else if (found.count < recorded.count || found.longest < recorded.longest)
        loose(
          path,
          `超线函数 ${recorded.count} 个、最长 ${recorded.longest}，现 ${found.count} 个、最长 ${found.longest}`,
        )
    }
  }
  return out
}

export function growthViolations(current: HygieneBaseline, base: HygieneBaseline): Violation[] {
  const out: Violation[] = []
  const grew = (detail: string) =>
    out.push({
      rule: RATCHET_RULE,
      path: HYGIENE_BASELINE_PATH,
      line: 1,
      message: `基线对基点只许变短：${detail}`,
    })
  for (const key of LIMIT_KEYS)
    if (current.limits[key] > base.limits[key])
      grew(`limits.${key} ${current.limits[key]} 大于基点的 ${base.limits[key]}`)
  const baseDocuments = new Set(base.documents)
  for (const path of current.documents) if (!baseDocuments.has(path)) grew(`documents 新增 ${path}`)
  for (const [path, value] of Object.entries(current.comments)) {
    const before = base.comments[path]
    if (before === undefined) grew(`comments 新增 ${path}`)
    else if (value > before) grew(`comments ${path} 由 ${before} 变为 ${value}`)
  }
  for (const [path, value] of Object.entries(current.sizes.files)) {
    const before = base.sizes.files[path]
    if (before === undefined) grew(`sizes.files 新增 ${path}`)
    else if (value > before) grew(`sizes.files ${path} 由 ${before} 变为 ${value}`)
  }
  for (const [path, value] of Object.entries(current.sizes.functions)) {
    const before = base.sizes.functions[path]
    if (before === undefined) grew(`sizes.functions 新增 ${path}`)
    else if (value.count > before.count || value.longest > before.longest)
      grew(
        `sizes.functions ${path} 由 ${before.count} 个、最长 ${before.longest} 变为 ${value.count} 个、最长 ${value.longest}`,
      )
  }
  return out
}
