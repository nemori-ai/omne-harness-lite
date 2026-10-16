import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { workspacePatterns } from '../core/workspace.ts'
import { checkLayout } from './layout.ts'
import { checkDirectories, planDraft, writeDraft } from './draft.ts'
import { DOMAIN_TEMPLATE_DIRECTORY, groupName, readDomainTemplate } from './domain-template.ts'
import type { Finding, PackageScan } from './model.ts'
import { isPlannedMember } from './discovery.ts'

export interface DomainCreationInput {
  readonly root: string
  readonly group: string
  readonly write?: boolean
  readonly templateDirectory?: string
}
export function createDomain(input: DomainCreationInput) {
  const root = resolve(input.root),
    group = groupName(input.group)
  if (
    !workspacePatterns(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')).includes(
      'packages/*/*',
    )
  )
    throw new Error('Workspace does not adopt packages/*/*')
  const directory = input.templateDirectory ?? DOMAIN_TEMPLATE_DIRECTORY
  const template = readDomainTemplate(directory)
  const plan = planDraft(join(root, 'packages', group), directory, template.common, {
    GROUP: group,
  })
  if (input.write === true) writeDraft(plan)
  return {
    path: `packages/${group}`,
    files: [...plan.files.keys()],
    written: input.write === true,
    draft: true,
    template: { id: template.id, version: template.version },
  }
}
export interface DomainScan {
  readonly path: string
  readonly template: { readonly id: 'package-domain'; readonly version: string }
  readonly coverage: 'current-template-only'
  readonly structure: 'pass' | 'fail'
  readonly tree: PackageScan['tree']
  readonly members: readonly string[]
  /** Member directories with neither manifest nor `src/`: planning only, see `isPlannedMember`. */
  readonly planned: readonly string[]
  readonly findings: readonly Finding[]
}
export function scanDomains(root: string, groups?: readonly string[]): DomainScan[] {
  root = resolve(root)
  checkDirectories(join(root, 'packages'))
  const names =
    groups ??
    readdirSync(join(root, 'packages'), { withFileTypes: true }).flatMap(entry => {
      if (entry.isDirectory() || entry.isSymbolicLink()) return [entry.name]
      if (
        entry.isFile() &&
        ['README.md', 'README_ZH.md', 'AGENTS.md', 'CLAUDE.md'].includes(entry.name)
      )
        return []
      throw new Error(`packages/${entry.name}: unexpected group node`)
    })
  const template = readDomainTemplate()
  return names.map(name => {
    const path = `packages/${groupName(name)}`
    checkDirectories(join(root, path))
    const members = readdirSync(join(root, path), { withFileTypes: true })
      .filter(
        entry =>
          entry.name !== 'docs' &&
          entry.isDirectory() &&
          lstatSync(join(root, path, entry.name, 'package.json'), {
            throwIfNoEntry: false,
          })?.isFile(),
      )
      .map(entry => entry.name)
    const planned = readdirSync(join(root, path), { withFileTypes: true })
      .filter(
        entry =>
          entry.name !== 'docs' &&
          entry.isDirectory() &&
          isPlannedMember(root, `${path}/${entry.name}`),
      )
      .map(entry => entry.name)
    const result = checkLayout(root, path, {
      ...template.layout,
      ignoredDirectories: [...members, ...planned],
    })
    const findings = [...result.findings]
    for (const file of template.requiredFiles)
      if (!result.tree.some(node => node.path === file && node.kind === 'file'))
        findings.push({
          code: 'required',
          path: `${path}/${file}`,
          reason: 'Missing required domain document',
        })
    for (const node of result.tree) {
      if (node.kind !== 'file' || !node.path.endsWith('.md')) continue
      if (readFileSync(join(root, path, node.path), 'utf8').includes('DOMAIN_TEMPLATE_DRAFT'))
        findings.push({
          code: 'draft',
          path: `${path}/${node.path}`,
          reason: 'Complete the domain documentation draft',
        })
    }
    return {
      path,
      template: { id: template.id, version: template.version },
      coverage: 'current-template-only',
      structure: findings.length === 0 ? 'pass' : 'fail',
      tree: result.tree,
      members: members.map(member => `${path}/${member}`),
      planned: planned.map(member => `${path}/${member}`),
      findings,
    }
  })
}
