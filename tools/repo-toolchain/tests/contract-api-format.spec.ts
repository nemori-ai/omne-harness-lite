import { describe, expect, it } from 'vitest'
import {
  parseSnapshot,
  renderSnapshot,
  SNAPSHOT_FORMAT,
  SnapshotFormatError,
  type ApiSnapshot,
} from '../src/declarations/api-format.ts'

const SNAPSHOT: ApiSnapshot = {
  packageName: '@fixture/a',
  entries: [
    { subpath: './testing', file: 'testing/index.d.ts', exports: [] },
    {
      subpath: '.',
      file: 'index.d.ts',
      exports: [
        { name: 'Unit', typeOnly: true, origin: { kind: 'file', path: 'unit.d.ts' } },
        {
          name: 'Shape',
          renamedFrom: 'Registry',
          typeOnly: false,
          origin: { kind: 'file', path: 'registry.d.ts' },
        },
        { name: 'Id', typeOnly: false, origin: { kind: 'package', name: '@fixture/base' } },
        { name: 'ns', typeOnly: false, origin: { kind: 'namespace', path: 'a.d.ts' } },
        { name: 'ns.A', typeOnly: false, origin: { kind: 'file', path: 'a.d.ts' } },
      ],
    },
  ],
  files: [
    { path: 'unit.d.ts', code: "export declare const Unit: 'm';" },
    { path: 'a/types.d.ts', code: 'export interface Box {\n    a: string;\n}' },
    { path: 'index.d.ts', code: "export { Unit } from './unit.ts';" },
  ],
}

describe('contract API snapshot format', () => {
  it('writes a versioned, sorted document and reads the same model back', () => {
    const text = renderSnapshot(SNAPSHOT)
    expect(text.split('\n').slice(0, 5)).toEqual([
      '# @fixture/a 的 API 快照',
      '',
      `<!-- omne-contract-api 快照格式 ${SNAPSHOT_FORMAT} -->`,
      '',
      '> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。',
    ])
    // Entries by subpath with their exports by name, then declaration files by path.
    expect(text.match(/^## .*$/gmu)).toEqual([
      '## 入口 `.` · `index.d.ts`',
      '## 入口 `./testing` · `testing/index.d.ts`',
      '## 声明文件 `a/types.d.ts`',
      '## 声明文件 `index.d.ts`',
      '## 声明文件 `unit.d.ts`',
    ])
    expect(text.match(/^- .*$/gmu)).toEqual([
      '- `Id` · 包 `@fixture/base`',
      '- `Shape` = `Registry` · `registry.d.ts`',
      '- `Unit` 仅类型 · `unit.d.ts`',
      '- `ns` · 命名空间 `a.d.ts`',
      '- `ns.A` · `a.d.ts`',
    ])
    expect(text).toContain('## 入口 `./testing` · `testing/index.d.ts`\n\n（无）\n')
    expect(text).toContain(
      '## 声明文件 `a/types.d.ts`\n\n```ts\nexport interface Box {\n    a: string;\n}\n```',
    )
    const back = parseSnapshot(text)
    expect(renderSnapshot(back)).toBe(text)
    expect(back.entries.find(entry => entry.subpath === '.')?.exports).toContainEqual({
      name: 'Shape',
      renamedFrom: 'Registry',
      typeOnly: false,
      origin: { kind: 'file', path: 'registry.d.ts' },
    })
  })

  it('refuses another format version, unknown lines and duplicates instead of guessing', () => {
    const text = renderSnapshot(SNAPSHOT)
    expect(() => parseSnapshot(text.replace(`快照格式 ${SNAPSHOT_FORMAT}`, '快照格式 99'))).toThrow(
      /格式 99，本工具读格式 1；用本工具重新 --write/u,
    )
    expect(() => parseSnapshot(text.replace(/<!--.*-->\n/u, ''))).toThrow(SnapshotFormatError)
    expect(() => parseSnapshot(text.replace('（无）', 'stray text'))).toThrow(/认不出：stray text/u)
    expect(() =>
      parseSnapshot(`${text}\n## 声明文件 \`unit.d.ts\`\n\n\`\`\`ts\nx\n\`\`\`\n`),
    ).toThrow(/重复了声明文件 unit.d.ts/u)
    expect(() =>
      parseSnapshot(text.replace('- `Unit` 仅类型 · `unit.d.ts`', '- `Id` · `unit.d.ts`')),
    ).toThrow(/重复了导出 Id/u)
    expect(() =>
      parseSnapshot(
        text.replace('## 声明文件 `index.d.ts`\n\n```ts', '## 声明文件 `index.d.ts`\n\ncode'),
      ),
    ).toThrow(/没有 ts 代码块/u)
  })
})
