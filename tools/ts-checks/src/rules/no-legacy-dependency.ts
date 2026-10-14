import ts from 'typescript'
import { isTestPath, type Rule, type SourceFile, type Violation } from '../rule.ts'
import { lineAt } from '../source-text.ts'
import { syntaxImports, syntaxOf, visitSyntax } from '../syntax.ts'

const LEGACY_PACKAGE = /@omne-harness-lite\//u
const LEGACY_TREE = /(?:apps|packages)\.0\.0\.1\.legacy(?:[/\\]|$)/u
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const

function dependencyViolations(file: SourceFile): Violation[] {
  let manifest: Record<string, unknown>
  try {
    manifest = JSON.parse(file.text) as Record<string, unknown>
  } catch {
    return [
      {
        rule: 'no-legacy-dependency',
        path: file.path,
        line: 1,
        message: 'package.json 无法解析，不能核对它有没有重新引入 legacy 依赖',
      },
    ]
  }
  const violations: Violation[] = []
  for (const field of DEPENDENCY_FIELDS) {
    const block = manifest[field]
    if (block === null || typeof block !== 'object' || Array.isArray(block)) continue
    for (const [name, version] of Object.entries(block)) {
      const declared = `${name} ${String(version)}`
      if (!LEGACY_PACKAGE.test(declared) && !LEGACY_TREE.test(declared)) continue
      const line = file.text.split('\n').findIndex(item => item.includes(name))
      violations.push({
        rule: 'no-legacy-dependency',
        path: file.path,
        line: line === -1 ? 1 : line + 1,
        message: `${field} 重新引入了 legacy 包或旧目录：${name}`,
      })
    }
  }
  return violations
}

const PATH_CALLS = new Set([
  'readFile',
  'readFileSync',
  'createReadStream',
  'readdir',
  'readdirSync',
  'stat',
  'statSync',
  'lstat',
  'lstatSync',
  'access',
  'accessSync',
  'existsSync',
  'open',
  'openSync',
  'join',
  'resolve',
  'URL',
])

function localInitializer(identifier: ts.Identifier): ts.Expression | undefined {
  for (
    let scope: ts.Node | undefined = identifier.parent;
    scope !== undefined;
    scope = scope.parent
  ) {
    if (
      ts.isFunctionLike(scope) &&
      scope.parameters.some(
        parameter => ts.isIdentifier(parameter.name) && parameter.name.text === identifier.text,
      )
    )
      return undefined
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue
    for (const statement of scope.statements) {
      if (!ts.isVariableStatement(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === identifier.text)
          return declaration.initializer
      }
    }
  }
  return undefined
}

function pathContainsLegacy(node: ts.Node, seen = new Set<ts.Node>()): boolean {
  if (seen.has(node)) return false
  seen.add(node)
  if (
    ts.isStringLiteralLike(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  )
    return LEGACY_TREE.test(node.text)
  if (ts.isIdentifier(node)) {
    const initializer = localInitializer(node)
    return initializer !== undefined && pathContainsLegacy(initializer, seen)
  }
  return ts.forEachChild(node, child => pathContainsLegacy(child, seen) || undefined) === true
}

function sourceViolations(file: SourceFile): Violation[] {
  if (file.path.endsWith('.md')) return []
  const syntax = syntaxOf(file)
  const violations: Violation[] = []
  for (const ref of syntaxImports(syntax)) {
    if (ref.specifier === undefined) continue
    const resolved = file.resolvedModules?.[ref.specifier]
    if (
      !LEGACY_PACKAGE.test(ref.specifier) &&
      !LEGACY_TREE.test(ref.specifier) &&
      (resolved === undefined || !LEGACY_TREE.test(resolved))
    )
      continue
    violations.push({
      rule: 'no-legacy-dependency',
      path: file.path,
      line: lineAt(file.text, ref.index),
      message: `源码重新引入了 legacy 依赖：${ref.specifier}`,
    })
  }
  const importedNames = new Map<string, string>()
  visitSyntax(syntax, node => {
    if (ts.isImportSpecifier(node))
      importedNames.set(node.name.text, node.propertyName?.text ?? node.name.text)
  })
  visitSyntax(syntax, node => {
    if (isTestPath(file.path)) {
      if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return
      const expression = node.expression
      const name = ts.isIdentifier(expression)
        ? (importedNames.get(expression.text) ?? expression.text)
        : ts.isPropertyAccessExpression(expression)
          ? expression.name.text
          : undefined
      if (
        name === undefined ||
        !PATH_CALLS.has(name) ||
        !(node.arguments ?? []).some(argument => pathContainsLegacy(argument))
      )
        return
    } else if (
      !(
        ts.isStringLiteralLike(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) ||
      !LEGACY_TREE.test(node.text)
    )
      return
    const already = violations.some(item => item.line === lineAt(file.text, node.getStart(syntax)))
    if (already) return
    violations.push({
      rule: 'no-legacy-dependency',
      path: file.path,
      line: lineAt(file.text, node.getStart(syntax)),
      message: `源码重新引用了 legacy 目录：${node.getText(syntax)}`,
    })
  })
  return violations
}

/** Blocks a package manifest or source file from depending on the legacy trees again. */
export const noLegacyDependency: Rule = {
  id: 'no-legacy-dependency',
  source: 'Issue #241 C5',
  description: 'package.json 与源码不得重新依赖 legacy 目录或 @omne-harness-lite 包',
  check(files) {
    const violations: Violation[] = []
    for (const file of files) {
      if (file.path === 'pnpm-workspace.yaml' || file.path.endsWith('/pnpm-workspace.yaml')) {
        if (LEGACY_TREE.test(file.text))
          violations.push({
            rule: this.id,
            path: file.path,
            line: 1,
            message: 'pnpm workspace 重新收录了 legacy 目录',
          })
        continue
      }
      if (file.path.endsWith('package.json')) violations.push(...dependencyViolations(file))
      else if (/\.[cm]?[jt]s$/u.test(file.path)) violations.push(...sourceViolations(file))
    }
    return violations
  },
}
