import { existsSync, readFileSync, lstatSync } from 'node:fs'
import { join } from 'node:path'
import { object, type Finding, type Variant } from './model.ts'
import { safeRelative } from './template.ts'

export function readObject(path: string): Record<string, unknown> {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${path}: expected a real JSON file`)
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!object(value)) throw new Error(`${path}: expected JSON object`)
  return value
}
function exportTarget(value: unknown, member: string, root: string, findings: Finding[]): void {
  if (typeof value === 'string') {
    const path = value.replace(/^\.\//u, '')
    if (
      !value.startsWith('./') ||
      !safeRelative(path) ||
      !path.endsWith('.json') ||
      !existsSync(join(root, member, path))
    )
      findings.push({
        code: 'resource-export',
        path: `${member}/package.json`,
        reason: `Missing or unsupported public resource: ${value}`,
      })
    return
  }
  if (!object(value) || typeof value['types'] !== 'string' || typeof value['import'] !== 'string') {
    findings.push({
      code: 'export',
      path: `${member}/package.json`,
      reason: 'Export must declare types and import paths',
    })
    return
  }
  if (
    Object.keys(value).some(
      key => !['source', 'types', 'import', 'require', 'default'].includes(key),
    ) ||
    ['require', 'default'].some(key => value[key] !== undefined && value[key] !== value['import'])
  ) {
    findings.push({
      code: 'export-conditions',
      path: `${member}/package.json`,
      reason:
        'Rule set 2 supports source, types, import, and optional require/default pointing to the same runtime target',
    })
  }
  if (typeof value['source'] === 'string') {
    const stem = value['import'].replace(/^\.\/dist\//u, '').replace(/\.js$/u, '')
    const keys = Object.keys(value)
    if (value['source'] !== `./src/${stem}.ts` || keys.indexOf('source') > keys.indexOf('types'))
      findings.push({
        code: 'export-conditions',
        path: `${member}/package.json`,
        reason: 'source must be listed before types and point at the TypeScript entry',
      })
  }
  for (const [key, suffix] of [
    ['types', '.d.ts'],
    ['import', '.js'],
  ] as const) {
    const target = value[key] as string
    const path = target.replace(/^\.\//u, '')
    if (
      !safeRelative(path) ||
      !target.startsWith('./') ||
      !path.startsWith('dist/') ||
      !path.endsWith(suffix) ||
      path.includes('*')
    ) {
      findings.push({
        code: 'export',
        path: `${member}/package.json`,
        reason: `Unsupported ${key} export: ${target}`,
      })
      continue
    }
    const source = `src/${path.slice(5, -suffix.length)}.ts`
    if (!existsSync(join(root, member, source)))
      findings.push({
        code: 'export-source',
        path: `${member}/${source}`,
        reason: `No source for export ${target}`,
      })
  }
}
function checkConfigurations(root: string, member: string): Finding[] {
  const findings: Finding[] = []
  for (const file of ['tsconfig.build.json', 'tsconfig.test.json']) {
    const path = join(root, member, file)
    if (!existsSync(path)) continue
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink()) {
      findings.push({
        code: 'configuration',
        path: `${member}/${file}`,
        reason: 'Configuration must be a real file',
      })
      continue
    }
    const config = readObject(path)
    const options = config['compilerOptions']
    if (config['extends'] !== '../../../tsconfig.base.json' || !object(options)) {
      findings.push({
        code: 'configuration',
        path: `${member}/${file}`,
        reason: 'Use the shared root TypeScript configuration with explicit member options',
      })
      continue
    }
    const valid =
      file === 'tsconfig.build.json'
        ? options['rootDir'] === 'src' &&
          options['outDir'] === 'dist' &&
          options['noEmit'] !== true &&
          options['emitDeclarationOnly'] !== true &&
          options['declaration'] !== false
        : options['noEmit'] === true
    if (!valid)
      findings.push({
        code: 'configuration',
        path: `${member}/${file}`,
        reason: 'Build must emit src to dist; test configuration must not emit',
      })
  }
  return findings
}
function checkPublication(member: string, manifest: Record<string, unknown>): Finding[] {
  const files = manifest['files']
  if (!Array.isArray(files) || !files.includes('dist')) {
    return [
      {
        code: 'publication',
        path: `${member}/package.json`,
        reason: 'Explicit files must include dist',
      },
    ]
  }
  const exports = manifest['exports']
  if (!object(exports)) return []
  const targets = Object.values(exports).flatMap(value =>
    typeof value === 'string' ? [value] : object(value) ? [value['types'], value['import']] : [],
  )
  return targets
    .filter((target): target is string => typeof target === 'string')
    .filter(target => {
      const path = target.replace(/^\.\//u, '')
      return !files.some(
        file => typeof file === 'string' && (path === file || path.startsWith(`${file}/`)),
      )
    })
    .map(target => ({
      code: 'publication',
      path: `${member}/package.json`,
      reason: `Export is absent from the explicit package file list: ${target}`,
    }))
}
function canonicalEntry(value: unknown, stem: string): boolean {
  if (!object(value)) return false
  const keys = Object.keys(value)
  return (
    value['source'] === `./src/${stem}.ts` &&
    keys.indexOf('source') < keys.indexOf('types') &&
    value['types'] === `./dist/${stem}.d.ts` &&
    value['import'] === `./dist/${stem}.js`
  )
}
/** File contents and publishing checks accompany the complete tree comparison. */
export function checkStructure(
  root: string,
  member: string,
  manifest: Record<string, unknown>,
  variant: Variant,
  required: readonly string[],
): Finding[] {
  const findings: Finding[] = [
    ...checkConfigurations(root, member),
    ...checkPublication(member, manifest),
  ]
  const add = (code: string, reason: string) =>
    findings.push({ code, path: `${member}/package.json`, reason })
  for (const file of required) {
    const path = join(root, member, file)
    const stat = lstatSync(path, { throwIfNoEntry: false })
    if (!stat?.isFile() || stat.isSymbolicLink() || readFileSync(path, 'utf8').trim() === '')
      findings.push({
        code: 'required-file',
        path: `${member}/${file}`,
        reason: 'Missing or empty template resource',
      })
  }
  if (
    variant !== 'module' &&
    !lstatSync(join(root, member, 'src/cordis.ts'), { throwIfNoEntry: false })?.isFile()
  )
    findings.push({
      code: 'required-file',
      path: `${member}/src/cordis.ts`,
      reason: 'Binding variant requires the source binding entry',
    })
  if (variant === 'module' && existsSync(join(root, member, 'src/cordis.ts')))
    add('variant', 'Pure module variant cannot contain a binding entry')
  if (manifest['type'] !== 'module') add('esm', 'Package must declare type: module')
  if (!object(manifest['scripts'])) add('scripts', 'Missing scripts')
  else
    for (const key of ['build', 'typecheck', 'test']) {
      const script = manifest['scripts'][key]
      if (typeof script !== 'string' || script.trim() === '' || /passWithNoTests/u.test(script))
        add('scripts', `Missing or invalid ${key} script`)
    }
  const exports = manifest['exports']
  if (!object(exports) || !object(exports['.'])) add('exports', 'Missing explicit pure root export')
  else {
    if (!canonicalEntry(exports['.'], 'index'))
      add('exports', 'Pure root must resolve to dist/index in both declarations and runtime')
    for (const value of Object.values(exports)) exportTarget(value, member, root, findings)
    if (variant === 'module' && exports['./cordis'] !== undefined)
      add('variant', 'Use a binding variant for ./cordis')
    if (variant !== 'module' && exports['./cordis'] === undefined)
      add('variant', 'Binding variant requires ./cordis')
    if (variant !== 'module' && !canonicalEntry(exports['./cordis'], 'cordis'))
      add('exports', 'Binding entry must resolve to dist/cordis in both declarations and runtime')
  }
  for (const file of ['src/index.ts', 'src/cordis.ts', 'README.md', 'README_ZH.md']) {
    const path = join(root, member, file)
    const stat = lstatSync(path, { throwIfNoEntry: false })
    if (
      stat?.isFile() &&
      !stat.isSymbolicLink() &&
      readFileSync(path, 'utf8').includes('PACKAGE_TEMPLATE_DRAFT')
    )
      findings.push({
        code: 'draft',
        path: `${member}/${file}`,
        reason: 'Complete the accepted contract and remove the draft placeholder before adoption',
      })
  }
  return findings
}
