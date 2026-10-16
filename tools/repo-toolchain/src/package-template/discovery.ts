import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { workspacePatterns } from '../core/workspace.ts'
import { checkLayout } from './layout.ts'
import { readDomainTemplate } from './domain-template.ts'

function requireDirectory(root: string, path: string): void {
  if (!lstatSync(join(root, path), { throwIfNoEntry: false })?.isDirectory())
    throw new Error(
      `${path}: product discovery requires a real directory, not a link or other node`,
    )
}
function children(root: string, path: string, segment: string): string[] {
  requireDirectory(root, path)
  if (segment !== '*') return [`${path}/${segment}`]
  return readdirSync(join(root, path), { withFileTypes: true }).flatMap(entry => {
    const child = `${path}/${entry.name}`
    if (path.split('/').length === 2 && entry.name === 'docs' && entry.isDirectory()) {
      const layout = readDomainTemplate().layout
      const result = checkLayout(root, child, {
        ...layout,
        files: layout.files.filter(file => file.startsWith('docs/')).map(file => file.slice(5)),
      })
      if (result.tree.length === 0 || result.findings.length > 0)
        throw new Error(`${child}: product discovery rejects invalid group documentation`)
      return []
    }
    if (entry.isDirectory()) return [child]
    // Only group navigation files may occupy a non-directory slot. A wrong node kind
    // must not hide a group or member before the source resolver filters it out.
    if (
      entry.isFile() &&
      (['README.md', 'README_ZH.md', 'AGENTS.md', 'CLAUDE.md'].includes(entry.name) ||
        (path.split('/').length === 2 && entry.name === 'documentation.json'))
    )
      return []
    throw new Error(`${child}: product discovery rejects links and unexpected non-directory nodes`)
  })
}
/**
 * Temporary rule while legacy-refactor is in progress (https://github.com/nemori-ai/omne-harness-lite/issues/325): a member
 * directory with a README.md but neither `package.json` nor `src/` only holds planning documents
 * and is not a member yet. An empty or stray directory still fails discovery. Remove this rule
 * when legacy-refactor completes; every member directory then needs a manifest again.
 */
export function isPlannedMember(root: string, path: string): boolean {
  const has = (name: string) => lstatSync(join(root, path, name), { throwIfNoEntry: false })
  return (
    has('package.json') === undefined &&
    has('src') === undefined &&
    has('README.md')?.isFile() === true
  )
}
/** Verify filesystem candidates before the architecture resolver filters non-file manifests. */
export function discoverProducts(root: string): string[] {
  const patterns = workspacePatterns(
    readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'),
  ).filter(pattern => pattern.startsWith('packages/'))
  if (patterns.length === 0) throw new Error('No product package patterns: discovery is uncovered')
  const products = new Set<string>()
  for (const pattern of patterns) {
    const segments = pattern.split('/')
    if (segments.length !== 3 || segments.some(part => !/^(?:\*|[a-z][a-z0-9-]*)$/u.test(part)))
      throw new Error(`Unsupported product package pattern: ${pattern}`)
    let paths = ['packages']
    for (const segment of segments.slice(1))
      paths = paths.flatMap(path => children(root, path, segment))
    for (const path of paths) {
      requireDirectory(root, path)
      if (isPlannedMember(root, path)) continue
      if (!lstatSync(join(root, path, 'package.json'), { throwIfNoEntry: false })?.isFile())
        throw new Error(`${path}/package.json: product discovery requires a real manifest file`)
      products.add(path)
    }
  }
  return [...products].sort()
}
