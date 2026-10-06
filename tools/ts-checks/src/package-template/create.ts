import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileTree, listWorkspaceMembers, workspacePatterns } from '../testing/members.ts'
import { object, type Variant, type TemplateMarker } from './model.ts'
import { readTemplate, TEMPLATE_DIRECTORY } from './template.ts'

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
  if (!name.test(input.name) || !name.test(input.group))
    throw new Error('Use a lowercase leaf package name and group')
  if (input.variant === 'service-contract' && input.group !== 'core')
    throw new Error('Public Service definitions belong in packages/core')
  const root = resolve(input.root)
  const patterns = workspacePatterns(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'))
  if (!patterns.includes('packages/*/*')) throw new Error('Workspace does not adopt packages/*/*')
  for (const path of [root, join(root, 'packages'), join(root, 'packages', input.group)]) {
    if (!existsSync(path)) continue
    const stat = lstatSync(path)
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error(`Not a real package directory: ${path}`)
  }
  const target = join(root, 'packages', input.group, input.name)
  if (lstatSync(target, { throwIfNoEntry: false }) !== undefined)
    throw new Error(`Package target already exists: ${target}`)
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
        build: 'tsc -p tsconfig.build.json',
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
function render(input: CreateInput): Map<string, string> {
  const directory = input.templateDirectory ?? TEMPLATE_DIRECTORY
  const manifest = readTemplate(directory)
  const files = [...manifest.common, ...manifest.variants[input.variant]]
  if (files.length === 0) throw new Error('Template contains no files')
  const replacements: Record<string, string> = {
    PACKAGE_JSON: manifestText(input),
    PACKAGE_NAME: input.name,
    VARIANT: input.variant,
  }
  const result = new Map<string, string>()
  for (const file of files) {
    const text = readFileSync(join(directory, file.source), 'utf8').replace(
      /\{\{([A-Z_]+)\}\}/gu,
      (_, key: string) => {
        const value = replacements[key]
        if (value === undefined) throw new Error(`Unknown template variable: ${key}`)
        return value
      },
    )
    result.set(file.target, text)
  }
  return result
}
function writeNewPackage(target: string, files: ReadonlyMap<string, string>): void {
  mkdirSync(dirname(target), { recursive: true })
  // mkdir is the exclusive claim: a competing creator or dangling symlink fails here.
  mkdirSync(target)
  const owner = lstatSync(target)
  try {
    for (const [file, text] of files) {
      const path = join(target, file)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, text, { flag: 'wx' })
    }
  } catch (error) {
    const current = lstatSync(target, { throwIfNoEntry: false })
    if (current?.ino === owner.ino && current.dev === owner.dev && !current.isSymbolicLink())
      rmSync(target, { recursive: true })
    throw error
  }
}
/** Preview by default. Creation never installs dependencies or runs package code. */
export function createPackage(input: CreateInput): Creation {
  const target = checkLocation(input)
  const template = readTemplate(input.templateDirectory ?? TEMPLATE_DIRECTORY)
  const files = render(input)
  if (input.write === true) {
    // Recheck after rendering; do not let template validation bypass target safety.
    checkLocation(input)
    writeNewPackage(target, files)
  }
  return {
    path: `packages/${input.group}/${input.name}`,
    files: [...files.keys()],
    written: input.write === true,
    draft: true,
    template: { id: template.id, version: template.version, variant: input.variant },
  }
}
