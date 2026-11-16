#!/usr/bin/env node
import { resolve } from 'node:path'
import { fileTree, listWorkspaceMembers } from '../core/workspace.ts'
import { checkDeclarations, renderDeclarationReport } from './compat.ts'
import { subjectRoot } from '../core/subject.ts'

const USAGE = `用法：omne-declarations [--root <检出目录>]
用 TypeScript 6 读全部有 build 脚本的成员 dist 里的声明。先构建。
  --root  被检查的检出，缺省取 OMNE_SUBJECT_ROOT，再取当前目录所在 Git 仓库的根。
退出 0 成员声明没有诊断；1 成员声明有诊断；2 用法错误或工具出错。`

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

if (process.argv.includes('--help')) {
  console.log(USAGE)
  process.exit(0)
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
