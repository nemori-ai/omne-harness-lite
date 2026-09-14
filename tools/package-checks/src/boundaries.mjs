import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve, isAbsolute, join } from 'node:path'
import ts from 'typescript'

export async function files(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...(await files(path)))
    else result.push(path)
  }
  return result
}

export async function members(repo) {
  const result = []
  for (const family of await readdir(join(repo, 'packages'), { withFileTypes: true })) {
    if (!family.isDirectory()) continue
    const root = join(repo, 'packages', family.name)
    const children = await readdir(root, { withFileTypes: true })
    assert.ok(
      !children.some(child => child.name === 'package.json'),
      `family is not a package: ${root}`,
    )
    for (const child of children.filter(
      child => child.isDirectory() && !child.name.startsWith('.'),
    )) {
      const leaf = join(root, child.name)
      const leafEntries = await readdir(leaf, { withFileTypes: true })
      if (!leafEntries.some(entry => entry.name === 'package.json')) {
        assert.ok(
          !leafEntries.some(
            entry => entry.isDirectory() && ['src', 'tests', 'dist'].includes(entry.name),
          ),
          `product source lacks package.json: ${leaf}`,
        )
        continue
      }
      const manifest = JSON.parse(await readFile(join(leaf, 'package.json'), 'utf8'))
      result.push({ kind: 'package', root: leaf, manifest })
    }
  }
  for (const entry of await readdir(join(repo, 'apps'), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const root = join(repo, 'apps', entry.name)
    const appEntries = await readdir(root, { withFileTypes: true })
    if (!appEntries.some(candidate => candidate.name === 'package.json')) {
      assert.ok(
        !appEntries.some(
          candidate => candidate.isDirectory() && ['src', 'tests', 'dist'].includes(candidate.name),
        ),
        `application source lacks package.json: ${root}`,
      )
      continue
    }
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    result.push({ kind: 'app', root, manifest })
  }
  assert.ok(result.length > 0, 'no product members')
  assert.equal(
    new Set(result.map(p => p.manifest.name)).size,
    result.length,
    'duplicate package name',
  )
  return result.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
}

export function imports(source, file = 'source.ts') {
  const found = []
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  function visit(node) {
    let specifier
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      specifier = node.moduleSpecifier
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      specifier = node.argument.literal
    else if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) specifier = node.name
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    )
      specifier = node.arguments[0]
    if (specifier && ts.isStringLiteralLike(specifier)) found.push(specifier.text)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return found
}

function packageName(specifier) {
  return specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0]
}

function publicPath(path, label) {
  assert.equal(typeof path, 'string', `${label} declaration must be a string`)
  assert.ok(path.startsWith('./dist/'), `${label} declaration must target ./dist`)
  assert.ok(!path.split('/').includes('..'), `${label} declaration escapes dist`)
}

export function validateManifest(manifest, provenance) {
  assert.equal(manifest.private, true, `private package: ${manifest.name}`)
  assert.ok(
    manifest.exports && typeof manifest.exports === 'object' && !Array.isArray(manifest.exports),
    `public exports: ${manifest.name}`,
  )
  const entries = Object.entries(manifest.exports)
  assert.ok(entries.length > 0, `public exports: ${manifest.name}`)
  const upstreamDerived = Array.isArray(provenance.files) && provenance.files.length > 0
  if (!upstreamDerived) {
    assert.ok(
      '.' in manifest.exports,
      `project-owned package requires a default public export: ${manifest.name}`,
    )
  }
  if (entries.some(([key]) => key !== './baseline')) {
    assert.ok(
      '.' in manifest.exports,
      `target package requires a default public export: ${manifest.name}`,
    )
  }
  for (const [key, entry] of entries) {
    assert.ok(
      key === '.' || key.startsWith('./'),
      `invalid public export key: ${manifest.name}: ${key}`,
    )
    assert.ok(
      entry && typeof entry === 'object' && !Array.isArray(entry),
      `conditional public export: ${manifest.name}: ${key}`,
    )
    publicPath(entry.types, `types declaration: ${manifest.name}: ${key}`)
    publicPath(entry.import, `import declaration: ${manifest.name}: ${key}`)
  }
  for (const path of ['dist', 'README.md', 'provenance.json']) {
    assert.ok(
      manifest.files?.includes(path),
      `distribution files must include ${path}: ${manifest.name}`,
    )
  }
  assert.ok(
    typeof manifest.license === 'string' && manifest.license.length > 0,
    `package license declaration: ${manifest.name}`,
  )
  if (manifest.license !== 'UNLICENSED') {
    assert.ok(
      manifest.files.includes('LICENSE'),
      `declared license requires LICENSE: ${manifest.name}`,
    )
  }
  if (upstreamDerived) {
    assert.notEqual(
      manifest.license,
      'UNLICENSED',
      `derived package must retain its license: ${manifest.name}`,
    )
    assert.ok(
      manifest.files.includes('UPSTREAM.md'),
      `derived package must distribute UPSTREAM.md: ${manifest.name}`,
    )
  }
  if (provenance.repository === 'https://github.com/deepseek-ai/deepseek-harness') {
    assert.equal(
      manifest.license,
      'MIT',
      `DSH-derived package license must match MIT source: ${manifest.name}`,
    )
  }
}

function safeMemberPath(root, path, label) {
  assert.equal(typeof path, 'string', `${label} must be a string`)
  const absolute = resolve(root, path)
  const local = relative(root, absolute)
  assert.ok(
    local && local !== '..' && !local.startsWith('../') && !isAbsolute(local),
    `${label} escapes package: ${path}`,
  )
  return absolute
}

export async function validateProvenance(member, provenance, dshBaseline) {
  const { root, manifest } = member
  assert.equal(provenance.format, 1, `provenance format: ${manifest.name}`)
  assert.ok(
    typeof provenance.scope === 'string' && provenance.scope.length > 0,
    `provenance scope: ${manifest.name}`,
  )
  assert.ok(Array.isArray(provenance.files), `upstream source records: ${manifest.name}`)
  assert.ok(Array.isArray(provenance.project_files), `project source records: ${manifest.name}`)
  const upstreamDerived = provenance.files.length > 0
  if (!upstreamDerived) {
    assert.ok(
      !provenance.repository && !provenance.commit && !provenance.archive_sha256,
      `upstream identity without source records: ${manifest.name}`,
    )
  } else {
    assert.ok(
      typeof provenance.repository === 'string' && provenance.repository.length > 0,
      `upstream repository: ${manifest.name}`,
    )
    assert.match(provenance.commit ?? '', /^[0-9a-f]{40}$/, `upstream commit: ${manifest.name}`)
  }

  const isDsh = provenance.repository === 'https://github.com/deepseek-ai/deepseek-harness'
  if (isDsh) {
    assert.ok(dshBaseline, `missing DSH source baseline: ${manifest.name}`)
    assert.equal(provenance.commit, dshBaseline.commit, `DSH source commit: ${manifest.name}`)
  }

  const covered = new Set()
  const snapshots = new Set()
  for (const entry of provenance.files) {
    assert.ok(
      typeof entry.upstream_path === 'string' && entry.upstream_path.length > 0,
      `upstream source path: ${manifest.name}`,
    )
    assert.ok(
      typeof entry.changes === 'string' && entry.changes.length > 0,
      `source change account: ${manifest.name}: ${entry.upstream_path}`,
    )
    assert.ok(
      Array.isArray(entry.targets) && entry.targets.length > 0,
      `source targets: ${manifest.name}: ${entry.upstream_path}`,
    )
    assert.ok(
      !snapshots.has(entry.snapshot),
      `duplicate source snapshot: ${manifest.name}: ${entry.snapshot}`,
    )
    snapshots.add(entry.snapshot)
    const snapshot = await readFile(safeMemberPath(root, entry.snapshot, 'source snapshot'))
    const digest = createHash('sha256').update(snapshot).digest('hex')
    assert.equal(digest, entry.sha256, `source snapshot hash: ${manifest.name}: ${entry.snapshot}`)
    if (isDsh) {
      const source = dshBaseline.files.find(candidate => candidate.path === entry.upstream_path)
      if (source)
        assert.equal(
          entry.sha256,
          source.sha256,
          `DSH source hash: ${manifest.name}: ${entry.upstream_path}`,
        )
    }
    for (const target of entry.targets) {
      await readFile(safeMemberPath(root, target, 'source target'))
      covered.add(target)
    }
  }
  if (isDsh) {
    assert.ok(
      provenance.files.some(
        entry => entry.upstream_path === 'LICENSE' && entry.snapshot === 'LICENSE',
      ),
      `MIT provenance: ${root}`,
    )
  }

  const projectPaths = new Set()
  for (const entry of provenance.project_files) {
    assert.ok(
      typeof entry.purpose === 'string' && entry.purpose.length > 0,
      `project source purpose: ${manifest.name}: ${entry.path}`,
    )
    assert.ok(
      !projectPaths.has(entry.path),
      `duplicate project source: ${manifest.name}: ${entry.path}`,
    )
    projectPaths.add(entry.path)
    await readFile(safeMemberPath(root, entry.path, 'project source'))
    covered.add(entry.path)
  }

  const sourceFiles = await files(join(root, 'src'))
  assert.ok(
    sourceFiles.some(path => /\.(?:ts|mts|cts)$/.test(path)),
    `empty product member: ${root}`,
  )
  for (const file of sourceFiles) {
    const path = relative(root, file)
    assert.ok(covered.has(path), `unmapped active source: ${file}`)
  }
}

export function exportSpecifier(name, key) {
  return key === '.' ? name : `${name}/${key.slice(2)}`
}

export function validatePackedArtifact(member, provenance, paths) {
  const { manifest } = member
  for (const path of paths) {
    assert.ok(
      path.startsWith('dist/') ||
        ['package.json', 'LICENSE', 'README.md', 'UPSTREAM.md', 'provenance.json'].includes(path),
      `artifact contains non-distribution file: ${path}`,
    )
  }
  for (const entry of Object.values(manifest.exports)) {
    for (const path of [entry.types, entry.import]) {
      assert.ok(paths.includes(path.slice(2)), `missing public artifact: ${path}`)
    }
  }
  for (const path of ['README.md', 'provenance.json']) {
    assert.ok(paths.includes(path), `artifact missing ${path}: ${manifest.name}`)
  }
  if (manifest.license !== 'UNLICENSED') {
    assert.ok(paths.includes('LICENSE'), `artifact missing LICENSE: ${manifest.name}`)
  }
  if (provenance.files.length > 0) {
    assert.ok(
      paths.includes('UPSTREAM.md'),
      `derived artifact missing UPSTREAM.md: ${manifest.name}`,
    )
  }
}

export function nativeBuildPlan(rootManifest, lock, inventory) {
  const allowed = rootManifest.pnpm?.onlyBuiltDependencies ?? []
  assert.ok(Array.isArray(allowed), 'pnpm.onlyBuiltDependencies must be an array')
  for (const name of allowed) {
    assert.equal(name, 'fs-ext', `unsupported native build dependency: ${name}`)
  }
  const consumers = inventory.filter(member => {
    const dependencies = {
      ...member.manifest.dependencies,
      ...member.manifest.optionalDependencies,
    }
    return 'fs-ext' in dependencies
  })
  if (consumers.length === 0) return []
  for (const member of consumers) {
    const version = { ...member.manifest.dependencies, ...member.manifest.optionalDependencies }[
      'fs-ext'
    ]
    assert.equal(version, '2.1.1', `fs-ext must be pinned to 2.1.1: ${member.manifest.name}`)
  }
  assert.ok(allowed.includes('fs-ext'), 'fs-ext requires pnpm.onlyBuiltDependencies allowlisting')
  assert.match(lock, /(?:^|\s)'?fs-ext@2\.1\.1'?:/m, 'lock must contain fs-ext@2.1.1')
  const lines = lock.split(/\r?\n/)
  let inFsExt = false
  let inDependencies = false
  let exactNan = false
  for (const line of lines) {
    if (/^  \S/.test(line)) {
      inFsExt = /^  '?fs-ext@2\.1\.1'?:$/.test(line)
      inDependencies = false
      continue
    }
    if (!inFsExt) continue
    if (/^    dependencies:$/.test(line)) {
      inDependencies = true
      continue
    }
    if (/^    \S/.test(line)) {
      inDependencies = false
      continue
    }
    if (inDependencies && /^      nan: 2\.28\.0$/.test(line)) exactNan = true
  }
  assert.ok(exactNan, 'fs-ext lock must pin nan to 2.28.0')
  return ['fs-ext']
}

export function validateImport(specifier, file, member, inventory, development = false) {
  if (specifier.startsWith('node:')) return
  if (specifier.startsWith('.')) {
    const target = relative(member.root, resolve(file, '..', specifier))
    assert.ok(
      target !== '..' && !target.startsWith('../') && !isAbsolute(target),
      `cross-package relative import: ${file}: ${specifier}`,
    )
    return
  }
  assert.ok(
    !isAbsolute(specifier) && !specifier.startsWith('#') && !specifier.includes(':'),
    `non-package import: ${file}: ${specifier}`,
  )
  const name = packageName(specifier)
  const dependencies = {
    ...member.manifest.dependencies,
    ...member.manifest.peerDependencies,
    ...(development ? member.manifest.devDependencies : {}),
  }
  assert.ok(
    name === member.manifest.name || name in dependencies,
    `undeclared dependency: ${file}: ${name}`,
  )
  if (name.startsWith('@deepseek-ai/')) {
    assert.equal(name, '@deepseek-ai/cordis', `excluded DSH dependency: ${file}`)
    assert.equal(dependencies[name], '4.0.2', `official Cordis version: ${file}`)
  }
  const sibling = inventory.find(p => p.manifest.name === name)
  if (name.startsWith('@omne-harness-lite/'))
    assert.ok(sibling, `unknown product dependency: ${name}`)
  if (sibling) {
    const subpath = specifier === name ? '.' : '.' + specifier.slice(name.length)
    assert.ok(subpath in sibling.manifest.exports, `private package subpath: ${file}: ${specifier}`)
    if (name !== member.manifest.name)
      assert.equal(
        dependencies[name],
        'workspace:*',
        `internal dependency must select workspace artifact: ${name}`,
      )
  }
}

export function closure(member, inventory, visiting = new Set(), result = new Set()) {
  assert.ok(!visiting.has(member), `product dependency cycle: ${member.manifest.name}`)
  if (result.has(member)) return result
  visiting.add(member)
  for (const name of Object.keys({
    ...member.manifest.dependencies,
    ...member.manifest.peerDependencies,
  })) {
    if (!name.startsWith('@omne-harness-lite/')) continue
    const dependency = inventory.find(p => p.manifest.name === name)
    assert.ok(dependency, `unknown product dependency: ${name}`)
    closure(dependency, inventory, visiting, result)
  }
  visiting.delete(member)
  result.add(member)
  return result
}
