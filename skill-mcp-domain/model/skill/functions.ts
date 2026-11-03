// Skill 限界上下文：纯函数（领域服务）。没有端口，可以穷举测试。
// 品牌只在这里授予：校验通过才得到 SkillName、PackagePath、SkillPackageSnapshot。

import { createHash } from 'node:crypto'
import { fail, succeed, type Bytes, type CapabilityId, type JsonLimits, type Outcome } from '../shared.ts'
import type { InspectRejectionCode } from './failures.ts'
import type {
  DeclaredProjection,
  EntryDigest,
  MediaType,
  PackageDigest,
  PackageEntry,
  PackagePath,
  SkillDefinition,
  SkillName,
  SkillPackageSnapshot,
} from './values.ts'

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function toSkillName(raw: string): Outcome<SkillName, 'invalid-name'> {
  if (raw.length < 1 || raw.length > 64 || !NAME.test(raw)) return fail('invalid-name')
  return succeed(raw as SkillName) // 唯一授予处：上一行已校验
}

/** 拒绝绝对路径、`..` 段、反斜杠与空段；去掉 `.` 段。 */
export function toPackagePath(raw: string): Outcome<PackagePath, 'bad-path'> {
  if (raw === '' || raw.startsWith('/') || raw.includes('\\') || raw.includes('\0')) return fail('bad-path')
  const segments: string[] = []
  for (const segment of raw.split('/')) {
    if (segment === '' || segment === '..') return fail('bad-path')
    if (segment !== '.') segments.push(segment)
  }
  if (segments.length === 0) return fail('bad-path')
  return succeed(segments.join('/') as PackagePath)
}

/** 草图用 SHA-256 十六进制；精确算法归 skill-contract 的 SPEC。 */
export function computeDigest(bytes: Bytes): EntryDigest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}` as EntryDigest
}

export type SnapshotDefect =
  | Readonly<{ kind: 'duplicate-path'; path: PackagePath }>
  | Readonly<{ kind: 'prefix-conflict'; file: PackagePath; nested: PackagePath }>

/**
 * Skill 包快照的唯一构造器（导出在 `./provider`，供来源实现调用）。
 * 一致性在构造时成立：路径唯一、无前缀冲突、内容摘要由条目算出。
 */
export function sealSnapshot(
  rootName: string,
  entries: readonly PackageEntry[],
): Outcome<SkillPackageSnapshot, SnapshotDefect> {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const files = new Set<string>()
  for (const entry of sorted) {
    if (files.has(entry.path)) return fail({ kind: 'duplicate-path', path: entry.path })
    files.add(entry.path)
  }
  // 逐级查祖先，不靠排序相邻：`a`、`a-b`、`a/b` 排序后 `a` 与 `a/b` 不相邻。
  for (const entry of sorted) {
    const segments = entry.path.split('/')
    for (let depth = 1; depth < segments.length; depth += 1) {
      const ancestor = segments.slice(0, depth).join('/')
      if (files.has(ancestor))
        return fail({ kind: 'prefix-conflict', file: ancestor as PackagePath, nested: entry.path })
    }
  }
  const hash = createHash('sha256')
  for (const entry of sorted) hash.update(`${entry.path}\0${entry.digest}\n`)
  const digest = `sha256:${hash.digest('hex')}` as PackageDigest
  return succeed(Object.freeze({ rootName, entries: Object.freeze(sorted), digest }) as SkillPackageSnapshot)
}

/** 由扩展名与内容推断；精确规则归 SPEC。缺席不表示文本。 */
export declare function inferMediaType(path: PackagePath, head: Bytes): MediaType | undefined

/** 控制文件不是资源。 */
export const CONTROL_FILES = ['SKILL.md', '.omne/skill.json'] as const
export function isControlFile(path: PackagePath): boolean {
  return (CONTROL_FILES as readonly string[]).includes(path)
}

/**
 * 解析控制文件的字节，按拒绝次序给出第一个拒绝原因。
 * 输入是快照与按需取字节的函数（不是端口：调用方已把来源柯里化进去）。
 */
export declare function parseSkillPackage(
  input: Readonly<{
    snapshot: SkillPackageSnapshot
    controlBytes: Readonly<{ manifest?: Bytes; declaration?: Bytes }>
    expectedName?: SkillName
    declarationLimits: JsonLimits
    isToolRef: (ref: CapabilityId) => boolean
    isSettingCategory: (category: string) => boolean
  }>,
): Outcome<SkillDefinition, Readonly<{ code: InspectRejectionCode; detail?: string }>>

/** 派生资产正文的声明投影，含 package.digest。 */
export function projectAssetBody(definition: SkillDefinition): DeclaredProjection {
  const { manifest, declaration, snapshot } = definition
  return {
    name: manifest.name,
    description: manifest.description,
    tools: declaration.dependencies,
    scripts: declaration.scripts,
    settings: declaration.settings,
    packageDigest: snapshot.digest,
  }
}
