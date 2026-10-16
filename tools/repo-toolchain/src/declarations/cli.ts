#!/usr/bin/env node
// 声明兼容检查入口：先构建，再用 TypeScript 6 读全部成员 dist 里的 `.d.ts`。
// 退出码 0 表示兼容，1 表示成员声明里有诊断，2 表示用法或工具出错。
import { resolve } from 'node:path'
import { fileTree, listWorkspaceMembers } from '../core/workspace.ts'
import { checkDeclarations, renderDeclarationReport } from './compat.ts'
import { subjectRoot } from '../core/subject.ts'

const USAGE = '用法：[--root <检出目录>]'

function main(argv: readonly string[]): number {
  let root = subjectRoot()
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1]
    if (argv[index] !== '--root' || value === undefined || value === '')
      throw new Error(`认不出的参数 ${argv[index] ?? ''}\n${USAGE}`)
    root = resolve(value)
    index += 1
  }
  const members = listWorkspaceMembers(fileTree(root), [])
    .filter(member => member.scripts['build'] !== undefined)
    .map(member => member.path)
  const report = checkDeclarations(root, members)
  for (const line of renderDeclarationReport(report)) console.log(line)
  return report.diagnostics.length === 0 ? 0 : 1
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
