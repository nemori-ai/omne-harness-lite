// `real-manifests-sync`（R1-1，DP1-C5、DP1-C8）：真实行的声明与 `stubs.ts` 的同一行（去掉前缀）逐项相同。
// 等待装配页补丁的差额写在 `KNOWN_GAPS`，每条带补丁编号；补丁落地、线负责人同步 `stubs.ts` 后删掉对应条目。
import { describe, expect, test } from 'vitest'
import * as cordisExports from '../src/cordis.ts'
import { STUB_EXPORT, serveProfile } from '../src/profile.ts'
import { rowDeclarationOf, type RowDeclaration } from '../src/row.ts'
import type { RowId, RowManifest } from '../src/types.ts'
import { AA_FIXTURE_ROWS } from './fixtures/serve/index.ts'

/** 具名差额清单：行 → 补丁编号与该补丁落地后 `stubs.ts` 这一行会变成的样子（只写变化的字段）。 */
const KNOWN_GAPS: Readonly<
  Record<string, Readonly<{ patch: string; manifest: Partial<RowManifest> }>>
> = {}

const profile = serveProfile()

function sorted(names: readonly string[]): string[] {
  return [...names].sort()
}

function comparable(manifest: RowManifest) {
  return {
    provides: sorted(manifest.provides),
    injects: sorted(manifest.injects),
    phase: manifest.phase,
    sameProviderGroup: manifest.sameProviderGroup,
  }
}

/** 表里这一行的样子；`withGap` 时取差额落地后的样子（只用于 `./cordis` 的真实导出，夹具照表现状）。 */
function expectedFor(row: RowId, withGap: boolean): ReturnType<typeof comparable> {
  const table = profile.stubManifests.get(row)
  if (table === undefined) throw new Error(`row "${row}" is not in the stubs table`)
  const gap = withGap ? KNOWN_GAPS[row] : undefined
  return comparable(gap === undefined ? table : { ...table, ...gap.manifest })
}

function checkDeclared(exportName: string, plugin: unknown, withGap: boolean): RowDeclaration {
  const declaration = rowDeclarationOf(plugin)
  expect(declaration, `export "${exportName}" carries no declaration`).toBeDefined()
  if (declaration === undefined) throw new Error('unreachable')
  expect(
    comparable(declaration.manifest),
    `row "${declaration.row}" (export ${exportName})`,
  ).toEqual(expectedFor(declaration.row, withGap))
  return declaration
}

describe('real-manifests-sync', () => {
  test('every export of ./cordis except the stub is a declared row equal to its table row', () => {
    for (const [name, plugin] of Object.entries(cordisExports)) {
      if (name === STUB_EXPORT) continue
      checkDeclared(name, plugin, true)
    }
  })

  test('every fixture row with an AA row id equals its table row', () => {
    for (const [name, plugin] of Object.entries(AA_FIXTURE_ROWS)) {
      const declaration = checkDeclared(name, plugin, false)
      expect(profile.stubManifests.has(declaration.row)).toBe(true)
    }
  })

  test('the known gaps name rows of the table and a patch each', () => {
    for (const [row, gap] of Object.entries(KNOWN_GAPS)) {
      expect(profile.stubManifests.has(row as RowId), row).toBe(true)
      expect(gap.patch).toMatch(/^AAP-\d+$/)
    }
  })

  test('no name of serve mode carries the s0. prefix, in the table, the trusted table or any declaration', () => {
    const names: string[] = []
    for (const manifest of profile.stubManifests.values()) {
      names.push(...manifest.provides, ...manifest.injects)
    }
    for (const visible of profile.visibility.values()) names.push(...visible)
    for (const plugin of [...Object.values(cordisExports), ...Object.values(AA_FIXTURE_ROWS)]) {
      const declaration = rowDeclarationOf(plugin)
      if (declaration !== undefined)
        names.push(...declaration.manifest.provides, ...declaration.manifest.injects)
    }
    expect(names.filter(name => name.startsWith('s0.'))).toEqual([])
  })

  test('AAP-7: the table no longer lists agentHost as a provided name', () => {
    const provided = [...profile.stubManifests.values()].flatMap(m => m.provides)
    expect(provided).not.toContain('agentHost')
    expect(profile.stubManifests.get('agent-host' as RowId)?.provides).toContain(
      'agentPublicationAuthority',
    )
  })
})
