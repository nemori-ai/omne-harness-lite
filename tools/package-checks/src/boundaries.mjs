import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve, isAbsolute, join } from 'node:path'
import ts from 'typescript'

export async function files(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await files(path))
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
    assert.ok(!children.some(child => child.name === 'package.json'), `family is not a package: ${root}`)
    for (const child of children.filter(child => child.isDirectory() && !child.name.startsWith('.'))) {
      const leaf = join(root, child.name)
      assert.ok((await readdir(leaf)).includes('package.json'), `responsibility leaf lacks package.json: ${leaf}`)
      const manifest = JSON.parse(await readFile(join(leaf, 'package.json'), 'utf8'))
      result.push({ root: leaf, manifest })
    }
  }
  assert.ok(result.length > 0, 'no product members')
  assert.equal(new Set(result.map(p => p.manifest.name)).size, result.length, 'duplicate package name')
  return result.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
}

export function imports(source, file = 'source.ts') {
  const found = []
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  function visit(node) {
    let specifier
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) specifier = node.argument.literal
    else if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) specifier = node.name
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) specifier = node.arguments[0]
    if (specifier && ts.isStringLiteralLike(specifier)) found.push(specifier.text)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return found
}

function packageName(specifier) {
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
}

export function validateImport(specifier, file, member, inventory, development = false) {
  if (specifier.startsWith('node:')) return
  if (specifier.startsWith('.')) {
    const target = relative(member.root, resolve(file, '..', specifier))
    assert.ok(target !== '..' && !target.startsWith('../') && !isAbsolute(target), `cross-package relative import: ${file}: ${specifier}`)
    return
  }
  assert.ok(!isAbsolute(specifier) && !specifier.startsWith('#') && !specifier.includes(':'), `non-package import: ${file}: ${specifier}`)
  const name = packageName(specifier)
  const dependencies = { ...member.manifest.dependencies, ...member.manifest.peerDependencies, ...(development ? member.manifest.devDependencies : {}) }
  assert.ok(name === member.manifest.name || name in dependencies, `undeclared dependency: ${file}: ${name}`)
  if (name.startsWith('@deepseek-ai/')) {
    assert.equal(name, '@deepseek-ai/cordis', `excluded DSH dependency: ${file}`)
    assert.equal(dependencies[name], '4.0.2', `official Cordis version: ${file}`)
  }
  const sibling = inventory.find(p => p.manifest.name === name)
  if (name.startsWith('@omne-harness-lite/')) assert.ok(sibling, `unknown product dependency: ${name}`)
  if (sibling) {
    const subpath = specifier === name ? '.' : '.' + specifier.slice(name.length)
    assert.ok(subpath in sibling.manifest.exports, `private package subpath: ${file}: ${specifier}`)
    if (name !== member.manifest.name) assert.equal(dependencies[name], 'workspace:*', `internal dependency must select workspace artifact: ${name}`)
  }
}

export function closure(member, inventory, visiting = new Set(), result = new Set()) {
  assert.ok(!visiting.has(member), `product dependency cycle: ${member.manifest.name}`)
  if (result.has(member)) return result
  visiting.add(member)
  for (const name of Object.keys({ ...member.manifest.dependencies, ...member.manifest.peerDependencies })) {
    if (!name.startsWith('@omne-harness-lite/')) continue
    const dependency = inventory.find(p => p.manifest.name === name)
    assert.ok(dependency, `unknown product dependency: ${name}`)
    closure(dependency, inventory, visiting, result)
  }
  visiting.delete(member)
  result.add(member)
  return result
}
