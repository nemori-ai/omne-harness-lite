import { lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Finding, LayoutRules, PackageScan } from './model.ts'

function matches(pattern: string, path: string): boolean {
  const expression = pattern
    .split('/')
    .map(part =>
      part === '**'
        ? '(?:[^/]+/)*'
        : `${part
            .split('*')
            .map(text => text.replace(/[.+?^${}()|[\]\\]/gu, '\\$&'))
            .join('[^/]*')}/`,
    )
    .join('')
    .replace(/\/$/u, '')
  return new RegExp(`^${expression}$`, 'u').test(path)
}

/** Visit every owned node, including untracked files and empty directories. Never follow links. */
export function checkLayout(root: string, member: string, rules: LayoutRules) {
  const tree: PackageScan['tree'][number][] = []
  const excludedDirectories: string[] = []
  const findings: Finding[] = []
  const add = (path: string, reason: string) =>
    findings.push({ code: 'layout', path: `${member}/${path}`, reason })
  function visit(relative: string): void {
    for (const name of readdirSync(join(root, member, relative)).sort()) {
      const path = relative === '' ? name : `${relative}/${name}`
      const stat = lstatSync(join(root, member, path))
      if (relative === '' && rules.ignoredDirectories.includes(name) && stat.isDirectory()) {
        excludedDirectories.push(path)
        continue
      }
      const kind = stat.isSymbolicLink()
        ? 'symlink'
        : stat.isDirectory()
          ? 'directory'
          : stat.isFile()
            ? 'file'
            : 'other'
      tree.push({ path, kind })
      if (kind === 'directory') visit(path)
    }
  }
  visit('')
  const allowedFiles = tree.filter(
    node => node.kind === 'file' && rules.files.some(pattern => matches(pattern, node.path)),
  )
  const expectedDirectories = new Set(rules.requiredDirectories)
  for (const file of allowedFiles) {
    const parts = file.path.split('/')
    for (let i = 1; i < parts.length; i += 1) expectedDirectories.add(parts.slice(0, i).join('/'))
  }
  for (const node of tree) {
    if (node.kind === 'directory') {
      if (!expectedDirectories.has(node.path)) add(node.path, 'Undeclared or empty directory')
      else if (!allowedFiles.some(file => file.path.startsWith(`${node.path}/`)))
        add(node.path, 'Declared directory has no template file slot')
    } else if (node.kind !== 'file')
      add(node.path, `Template requires real files/directories, observed ${node.kind}`)
    else if (!allowedFiles.includes(node))
      add(node.path, 'File has no declared template slot or is in the wrong location')
  }
  for (const path of rules.requiredDirectories)
    if (!tree.some(node => node.path === path && node.kind === 'directory'))
      add(path, 'Missing required directory')
  for (const group of rules.requiredFileGroups)
    if (
      allowedFiles.filter(file => group.patterns.some(pattern => matches(pattern, file.path)))
        .length < group.minimum
    )
      add(
        group.patterns.join(' | '),
        `Require at least ${group.minimum} file(s) in this declared group`,
      )
  for (const companion of rules.companions) {
    if (!tree.some(node => node.path === companion.path)) continue
    for (const path of companion.requires)
      if (
        !tree.some(
          node => node.path === path && (node.kind === 'file' || node.kind === 'directory'),
        )
      )
        add(path, `Required companion of ${companion.path}`)
  }
  return { tree, excludedDirectories, findings }
}
