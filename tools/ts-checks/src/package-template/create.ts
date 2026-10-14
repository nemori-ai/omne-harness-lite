import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileTree, listWorkspaceMembers, workspacePatterns } from '../testing/members.ts'
import { object, type Variant, type TemplateMarker } from './model.ts'
import { readTemplate, TEMPLATE_DIRECTORY } from './template.ts'
import { planDraft, requireNewTarget, writeDraft } from './draft.ts'

export interface CreateInput {
  readonly root: string
  readonly group: string
  readonly name: string
  readonly variant: Variant
  readonly write?: boolean
  readonly templateDirectory?: string
}
export interface Creation {
  readonly path: string
  readonly files: readonly string[]
  readonly written: boolean
  readonly draft: true
  readonly template: TemplateMarker
}
function checkLocation(input: CreateInput): string {
  const name = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u
  if (!name.test(input.name) || !name.test(input.group) || input.name === 'docs')
    throw new Error('Use a lowercase leaf package name and group')
  const root = resolve(input.root)
  const patterns = workspacePatterns(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'))
  if (!patterns.includes('packages/*/*')) throw new Error('Workspace does not adopt packages/*/*')
  const target = join(root, 'packages', input.group, input.name)
  requireNewTarget(target)
  if (
    listWorkspaceMembers(fileTree(root), []).some(
      member => member.name === `@omne-harness-lite/${input.name}`,
    )
  )
    throw new Error(`Workspace package name already exists: @omne-harness-lite/${input.name}`)
  return target
}
function manifestText(input: CreateInput): string {
  const rootManifest: unknown = JSON.parse(readFileSync(join(input.root, 'package.json'), 'utf8'))
  if (
    !object(rootManifest) ||
    !object(rootManifest['engines']) ||
    typeof rootManifest['engines']['node'] !== 'string'
  )
    throw new Error('Root package.json must declare engines.node')
  const entry = (name: string) => ({ types: `./dist/${name}.d.ts`, import: `./dist/${name}.js` })
  const binding = input.variant !== 'module'
  return JSON.stringify(
    {
      name: `@omne-harness-lite/${input.name}`,
      version: '0.0.0',
      private: true,
      type: 'module',
      description: `Draft ${input.name} package; complete the accepted public contract before delivery`,
      engines: rootManifest['engines'],
      exports: { '.': entry('index'), ...(binding ? { './cordis': entry('cordis') } : {}) },
      files: ['dist', 'README.md', 'README_ZH.md'],
      scripts: {
        build: 'rm -rf dist && tsc -p tsconfig.build.json',
        typecheck: 'tsc -p tsconfig.test.json',
        test: 'vitest run',
      },
      dependencies: binding ? { '@deepseek-ai/cordis': 'catalog:' } : {},
      devDependencies: { '@types/node': 'catalog:', typescript: 'catalog:', vitest: 'catalog:' },
    },
    null,
    2,
  )
}
/** Preview by default. Creation never installs dependencies or runs package code. */
export function createPackage(input: CreateInput): Creation {
  const target = checkLocation(input)
  const template = readTemplate(input.templateDirectory ?? TEMPLATE_DIRECTORY)
  const plan = planDraft(
    target,
    input.templateDirectory ?? TEMPLATE_DIRECTORY,
    [...template.common, ...template.variants[input.variant]],
    {
      PACKAGE_JSON: manifestText(input),
      PACKAGE_NAME: input.name,
      GROUP: input.group,
      VARIANT: input.variant,
    },
  )
  if (input.write === true) {
    // Recheck after rendering; do not let template validation bypass target safety.
    checkLocation(input)
    writeDraft(plan)
  }
  return {
    path: `packages/${input.group}/${input.name}`,
    files: [...plan.files.keys()],
    written: input.write === true,
    draft: true,
    template: { id: template.id, version: template.version, variant: input.variant },
  }
}
