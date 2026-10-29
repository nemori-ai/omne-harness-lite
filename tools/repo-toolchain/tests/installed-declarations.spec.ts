// 已安装声明的进程内共享：同一解析设置拿同一个 SourceFile，换了 target 重新解析，安装目录外的文件不进缓存。
import { sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from '@typescript/typescript6'
import { describe, expect, it, vi } from 'vitest'
import { sharingInstalledDeclarations } from '../src/declarations/compat.ts'

const es2024: ts.CompilerOptions = { target: ts.ScriptTarget.ES2024 }
const lib = ts.getDefaultLibFilePath(es2024)
const unread = () => undefined

describe('sharing installed declarations', () => {
  it('returns one SourceFile per parse setting across hosts', () => {
    const first = sharingInstalledDeclarations(es2024, unread)(lib, ts.ScriptTarget.ES2024)
    expect(first?.fileName).toBe(lib)
    expect(sharingInstalledDeclarations(es2024, unread)(lib, ts.ScriptTarget.ES2024)).toBe(first)
  })

  it('parses again when the target differs', () => {
    const es2024File = sharingInstalledDeclarations(es2024, unread)(lib, ts.ScriptTarget.ES2024)
    const es5 = { target: ts.ScriptTarget.ES5 }
    const es5File = sharingInstalledDeclarations(es5, unread)(lib, ts.ScriptTarget.ES5)
    expect(es5File).not.toBe(es2024File)
    expect(es5File?.languageVersion).toBe(ts.ScriptTarget.ES5)
  })

  it('parses again when a compilation setting other than the target differs', () => {
    // 同一 target、同一解析参数，只换影响绑定的编译选项：键里的设置项要把它们分开。
    const commonJs = sharingInstalledDeclarations(
      { ...es2024, module: ts.ModuleKind.CommonJS },
      unread,
    )(lib, ts.ScriptTarget.ES2024)
    const nodeNext = sharingInstalledDeclarations(
      {
        ...es2024,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
      },
      unread,
    )(lib, ts.ScriptTarget.ES2024)
    expect(nodeNext).not.toBe(commonJs)
  })

  it('leaves files outside the installed directories to the host', () => {
    // 一个存在、读得到的文件，只是不在 lib 与类型根里。
    const own = fileURLToPath(import.meta.url)
      .split(sep)
      .join('/')
    const parsed = ts.createSourceFile(own, 'export {}', ts.ScriptTarget.ES2024)
    const read = vi.fn(() => parsed)
    const share = sharingInstalledDeclarations(es2024, read)
    expect(share(own, ts.ScriptTarget.ES2024)).toBe(parsed)
    share(own, ts.ScriptTarget.ES2024)
    expect(read).toHaveBeenCalledTimes(2)
  })
})
