import ts from '@typescript/typescript6'
import { dirname, join, normalize } from 'node:path/posix'
import type { Rule, SourceFile, Violation } from '../rule.ts'
import { isTestPath } from '../rule.ts'
import { lineAt } from '../source-text.ts'
import { nodeName, syntaxImports, syntaxOf, visitSyntax } from '../syntax.ts'

const cliBootstrap = 'apps/cli/src/session-model-directory.ts'
const lookupEntry = '@omne-harness/model-profile-directory-local/local-credentials'
const bootstrap = 'examples/model-invocation-minimal-demo/src/bootstrap.ts'
const directory = 'packages/model/model-profile-directory-local/src/'
const custodian = 'packages/infra/credential-custodian-local/src/'
const bindingEntry = '@omne-harness/model-profile-directory-local/tx-reads'
const readerAdapter = 'examples/model-invocation-minimal-demo/src/assembly-inputs.ts'
const replicaEntry = '@omne-harness/credential-custodian-local/model-replica'
type Token = string
type Value = ReadonlySet<Token>
const empty: Value = new Set()
function nested(key: string, token: string): string {
  // Preserve recognition while bounding cyclic aggregate aliases.
  return token.split(':').length >= 4 ? `?:${token.split(':').at(-1) ?? ''}` : `${key}:${token}`
}
const value = (...tokens: Token[]): Value => new Set(tokens)
const restricted = new Set([
  'binding-factory',
  'replica-factory',
  'lookup-factory',
  'binding-reader',
  'replica',
  'read',
  'store',
  'close',
  'options',
  'lookup-config',
  'reader-port',
  'reader-adapter',
])
function sensitive(input: Value): boolean {
  return [...input].some(token => restricted.has(token.split(':').at(-1) ?? ''))
}
function merge(...inputs: Value[]): Value {
  return new Set(inputs.flatMap(input => [...input]))
}
function pathOf(file: SourceFile): string {
  const path = file.path.replaceAll('\\', '/').replace(/^\.\//u, '')
  if (/^(?:model|infra)\//u.test(path)) return `packages/${path}`
  if (path.startsWith('cli/')) return `apps/${path}`
  if (path.startsWith('model-invocation-minimal-demo/')) return `examples/${path}`
  return path
}
function target(file: SourceFile, specifier: string): string {
  return (
    file.resolvedModules?.[specifier] ??
    (specifier.startsWith('.') ? normalize(join(dirname(pathOf(file)), specifier)) : specifier)
  )
}
function moduleKind(
  file: SourceFile,
  specifier: string,
): 'binding' | 'replica' | 'lookup' | 'reader-adapter' | undefined {
  const resolved = target(file, specifier)
  if (
    resolved === bindingEntry ||
    /^(?:packages\/model\/model-profile-directory-local\/(?:src|dist)\/|@omne-harness\/model-profile-directory-local\/(?:src\/)?)tx-reads(?:\.d)?(?:\.[cm]?[jt]s)?$/u.test(
      resolved,
    )
  )
    return 'binding'
  if (
    resolved === replicaEntry ||
    /^(?:packages\/infra\/credential-custodian-local\/(?:src|dist)\/|@omne-harness\/credential-custodian-local\/(?:src\/)?)model-replica(?:\.d)?(?:\.[cm]?[jt]s)?$/u.test(
      resolved,
    )
  )
    return 'replica'
  if (
    resolved === lookupEntry ||
    /^(?:packages\/model\/model-profile-directory-local\/(?:src|dist)\/|@omne-harness\/model-profile-directory-local\/(?:src\/)?)local-credentials(?:\.d)?(?:\.[cm]?[jt]s)?$/u.test(
      resolved,
    )
  )
    return 'lookup'
  if (resolved === readerAdapter) return 'reader-adapter'
  return undefined
}
function isRestrictedEntry(kind: ReturnType<typeof moduleKind>): boolean {
  return kind === 'binding' || kind === 'replica' || kind === 'lookup'
}
function isLookupDependency(name: string | undefined): boolean {
  return name === 'LocalCredentialLookupConfig' || name === 'LocalCredentialLookupDependencies'
}
function member(input: Value, key: string): Value {
  const result = new Set<string>()
  for (const token of input) {
    if (token.startsWith(`${key}:`)) result.add(token.slice(key.length + 1))
    if (token === 'replica' && ['storeBoundReplica', 'readBoundReplicaIn', 'close'].includes(key))
      result.add(
        key === 'storeBoundReplica' ? 'store' : key === 'readBoundReplicaIn' ? 'read' : 'close',
      )
    if (token === 'context' && key === 'boundCredentialReplicaReader') result.add('reader-port')
    if (token === 'reader-port' && key === 'readIn') result.add('read')
    if (token === 'options' && key === 'readCredentialBindingIn') result.add('binding-reader')
    if (token === 'lookup-config' && key === 'readBoundReplicaIn') result.add('read')
  }
  return result
}
function property(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression))
    return node.argumentExpression.text
  if (ts.isComputedPropertyName(node) && ts.isStringLiteralLike(node.expression))
    return node.expression.text
  return undefined
}
function scope(node: ts.Node): ts.Node {
  let current: ts.Node | undefined = node.parent
  while (current !== undefined) {
    if (ts.isSourceFile(current) || ts.isBlock(current) || ts.isFunctionLike(current))
      return current
    current = current.parent
  }
  return node
}
function functionName(node: ts.Node): string | undefined {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isMethodDeclaration(node)
  )
    return nodeName(node.name)
  if (ts.isArrowFunction(node)) {
    const parent = node.parent
    if (ts.isVariableDeclaration(parent)) return nodeName(parent.name)
    if (ts.isPropertyAssignment(parent)) return nodeName(parent.name)
  }
  return undefined
}
function within(node: ts.Node, name: string): boolean {
  let current: ts.Node | undefined = node
  while (current !== undefined) {
    if (
      functionName(current) === name ||
      (ts.isVariableDeclaration(current) && nodeName(current.name) === name)
    )
      return true
    current = current.parent
  }
  return false
}
function appOperation(node: ts.Node, name: string, owner: string): boolean {
  let current: ts.Node | undefined = node
  while (current !== undefined) {
    const named = functionName(current)
    if (named !== undefined) return named === name && within(current.parent, owner)
    current = current.parent
  }
  return false
}
function inTypes(node: ts.Node): boolean {
  let current: ts.Node | undefined = node
  while (current !== undefined && !ts.isSourceFile(current)) {
    if (ts.isTypeNode(current) || ts.isInterfaceDeclaration(current)) return true
    current = current.parent
  }
  return false
}

function inReaderAdapter(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent
  while (current !== undefined) {
    if (ts.isClassDeclaration(current)) return current.name?.text === 'ReplicaReader'
    current = current.parent
  }
  return false
}
function custodianReadTypeOnly(syntax: ts.SourceFile, path: string, specifier: string): boolean {
  if (path !== `${custodian}types.ts` || specifier !== '@omne-harness/model-profile-directory')
    return false
  return syntax.statements.every(statement => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== specifier
    )
      return true
    const clause = statement.importClause
    const bindings = clause?.namedBindings
    return (
      clause?.name === undefined &&
      bindings !== undefined &&
      ts.isNamedImports(bindings) &&
      bindings.elements.length > 0 &&
      bindings.elements.every(
        element =>
          (clause?.isTypeOnly || element.isTypeOnly) &&
          (element.propertyName ?? element.name).text === 'ReadBoundReplicaIn',
      )
    )
  })
}

/** Local lexical def-use only. Unknown transfers of recognized restricted values fail closed. */
export const modelCredentialBoundary: Rule = {
  id: 'model-credential-boundary',
  source:
    'D-075; model-profile-directory v3 V3-10; credential-custodian-local rev2 MCR-V7; D-092 AB-5/AB-6',
  description:
    'separate import, construction, transfer, execution and cleanup permissions for model credentials',
  check(files) {
    const violations: Violation[] = []
    for (const file of files) {
      if (isTestPath(file.path)) continue
      const path = pathOf(file)
      const syntax = syntaxOf(file)
      const seen = new Set<string>()
      const report = (node: ts.Node, message: string): void => {
        const line = lineAt(file.text, node.getStart(syntax))
        const key = `${line}:${message}`
        if (seen.has(key)) return
        seen.add(key)
        violations.push({ rule: this.id, path: file.path, line, message })
      }
      const directoryOwner = path.startsWith(directory)
      const component = path === `${custodian}model-replica.ts`
      const isApp = path === bootstrap || path === cliBootstrap
      const p1r = (node: ts.Node): boolean =>
        (path === `${directory}cordis.ts` && within(node, 'localCredentialLookupPlugin')) ||
        (path === `${directory}local-credentials.ts` &&
          within(node, 'createLocalCredentialLookup') &&
          within(node, 'value'))
      const adapter = (node: ts.Node): boolean =>
        path === readerAdapter && within(node, 'readIn') && inReaderAdapter(node)
      const app = (node: ts.Node, operation: string): boolean =>
        isApp &&
        appOperation(
          node,
          operation,
          path === cliBootstrap ? 'createSessionModelDirectory' : 'createAcceptanceApplication',
        )
      const bindings = new Map<ts.Node, Map<string, Set<string>>>()
      const types = new Map<string, string>()
      const symbol = (name: string, at: ts.Node): Set<string> | undefined => {
        let current: ts.Node | undefined = at
        while (current !== undefined) {
          const found = bindings.get(current)?.get(name)
          if (found !== undefined) return found
          current = current.parent
        }
        return undefined
      }
      const declare = (name: string, at: ts.Node): Set<string> => {
        const owner = scope(at)
        let names = bindings.get(owner)
        if (names === undefined) {
          names = new Map()
          bindings.set(owner, names)
        }
        let tokens = names.get(name)
        if (tokens === undefined) {
          tokens = new Set()
          names.set(name, tokens)
        }
        return tokens
      }
      const typeValue = (node: ts.TypeNode | undefined): Value => {
        if (node === undefined) return empty
        if (ts.isUnionTypeNode(node)) return merge(...node.types.map(typeValue))
        if (!ts.isTypeReferenceNode(node) || !ts.isIdentifier(node.typeName)) return empty
        const name =
          types.get(node.typeName.text) ??
          (component || directoryOwner ? node.typeName.text : undefined)
        if (name === 'Context') return value('context')
        if (
          name === 'BoundCredentialReplicaReader' ||
          name === 'BoundCredentialReplicaReaderService'
        )
          return value('reader-port')
        if (name === 'ModelReplicaCustodian') return value('replica')
        if (name === 'ReadCredentialBindingIn') return value('binding-reader')
        if (name === 'ReadBoundReplicaIn') return value('read')
        if (component && name === 'ModelReplicaOptions') return value('options')
        if (directoryOwner && isLookupDependency(name)) return value('lookup-config')
        return empty
      }
      for (const ref of syntaxImports(syntax)) {
        if (ref.specifier === undefined) continue
        const resolved = target(file, ref.specifier)
        if (
          path.startsWith(custodian) &&
          (resolved === '@omne-harness/model-profile-directory' ||
            resolved.startsWith('@omne-harness/model-profile-directory/') ||
            resolved === '@omne-harness/model-profile-directory-local' ||
            resolved.startsWith('@omne-harness/model-profile-directory-local/') ||
            resolved.startsWith('packages/model/model-profile-directory-local/')) &&
          !custodianReadTypeOnly(syntax, path, ref.specifier)
        ) {
          violations.push({
            rule: this.id,
            path: file.path,
            line: lineAt(file.text, ref.index),
            message:
              'CCL must receive the directory reader as a function dependency, never reverse import directory',
          })
        }
        const kind = moduleKind(file, ref.specifier)
        if (!isRestrictedEntry(kind)) continue
        const permitted =
          kind === 'replica' ? path.startsWith(custodian) || isApp : directoryOwner || isApp
        if (!permitted)
          violations.push({
            rule: this.id,
            path: file.path,
            line: lineAt(file.text, ref.index),
            message: 'restricted model credential entry has no import permission at this path',
          })
      }
      visitSyntax(syntax, node => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
          const kind = moduleKind(file, node.moduleSpecifier.text)
          const clause = node.importClause
          const named = clause?.namedBindings
          const exports =
            kind === 'binding'
              ? value('createCredentialBindingReader:binding-factory')
              : kind === 'replica'
                ? value('createModelReplicaCustodian:replica-factory')
                : kind === 'lookup'
                  ? value('createLocalCredentialLookup:lookup-factory')
                  : kind === 'reader-adapter'
                    ? value('ReplicaReader:reader-adapter')
                    : empty
          if (clause?.name !== undefined && exports.size !== 0)
            report(node, 'restricted entry does not provide a default runtime import')
          if (named !== undefined && ts.isNamespaceImport(named)) {
            for (const token of exports) declare(named.name.text, named).add(token)
          }
          if (named !== undefined && ts.isNamedImports(named)) {
            for (const spec of named.elements) {
              const original = (spec.propertyName ?? spec.name).text
              if (
                kind !== undefined ||
                target(file, node.moduleSpecifier.text).startsWith(custodian) ||
                target(file, node.moduleSpecifier.text).startsWith(directory) ||
                [
                  '@omne-harness/credential-custodian-local',
                  '@omne-harness/model-profile-directory',
                  '@omne-harness/model-profile-directory/cordis',
                  '@deepseek-ai/cordis',
                ].includes(node.moduleSpecifier.text)
              )
                types.set(spec.name.text, original)
              if (clause?.isTypeOnly || spec.isTypeOnly) continue
              const imported = member(exports, original)
              if (
                node.moduleSpecifier.text === '@omne-harness/model-profile-directory/cordis' &&
                original === 'BOUND_CREDENTIAL_REPLICA_READER'
              )
                declare(spec.name.text, spec).add('reader-key')
              if (isRestrictedEntry(kind) && imported.size === 0)
                report(spec, 'restricted entry runtime import is not an approved factory')
              for (const token of imported) declare(spec.name.text, spec).add(token)
            }
          }
        }
        if (
          component &&
          ts.isFunctionDeclaration(node) &&
          node.name !== undefined &&
          within(node.parent, 'createModelReplicaCustodian')
        ) {
          const token =
            node.name.text === 'storeBoundReplica'
              ? 'store'
              : node.name.text === 'readBoundReplicaIn'
                ? 'read'
                : node.name.text === 'close'
                  ? 'close'
                  : undefined
          if (token !== undefined) declare(node.name.text, node).add(token)
        }
        if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
          const names = (name: ts.BindingName): void => {
            if (ts.isIdentifier(name)) declare(name.text, node)
            else
              for (const element of name.elements)
                if (ts.isBindingElement(element)) names(element.name)
          }
          names(node.name)
        }
      })
      const evaluate = (node: ts.Node | undefined): Value => {
        if (node === undefined) return empty
        if (ts.isIdentifier(node)) return symbol(node.text, node) ?? empty
        if (node.kind === ts.SyntaxKind.ThisKeyword) {
          let owner: ts.Node | undefined = node.parent
          while (owner !== undefined && !ts.isClassDeclaration(owner)) owner = owner.parent
          if (owner === undefined || !ts.isClassDeclaration(owner)) return empty
          const tokens = new Set<string>()
          for (const member of owner.members) {
            const declarations = ts.isConstructorDeclaration(member)
              ? member.parameters.filter(parameter =>
                  ts.isParameterPropertyDeclaration(parameter, member),
                )
              : ts.isPropertyDeclaration(member)
                ? [member]
                : []
            for (const declaration of declarations) {
              const key = nodeName(declaration.name)
              if (key === undefined) continue
              for (const token of typeValue(declaration.type)) tokens.add(nested(key, token))
            }
          }
          return tokens
        }
        if (
          ts.isParenthesizedExpression(node) ||
          ts.isAwaitExpression(node) ||
          ts.isAsExpression(node) ||
          ts.isTypeAssertionExpression(node) ||
          ts.isNonNullExpression(node)
        )
          return evaluate(node.expression)
        if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
          const key = property(node)
          return key === undefined ? empty : member(evaluate(node.expression), key)
        }
        if (ts.isCallExpression(node)) {
          const called = evaluate(node.expression)
          if (
            (ts.isPropertyAccessExpression(node.expression) ||
              ts.isElementAccessExpression(node.expression)) &&
            property(node.expression) === 'get' &&
            evaluate(node.expression.expression).has('context')
          ) {
            const key = node.arguments[0]
            if (
              key !== undefined &&
              ((ts.isStringLiteralLike(key) && key.text === 'boundCredentialReplicaReader') ||
                evaluate(key).has('reader-key'))
            )
              return value('reader-port')
          }
          if (
            node.expression.getText(syntax) === 'Object.freeze' &&
            symbol('Object', node) === undefined
          )
            return evaluate(node.arguments[0])
          return merge(
            called.has('binding-factory') ? value('binding-reader') : empty,
            called.has('replica-factory') ? value('replica') : empty,
            member(called, 'callback'),
          )
        }
        if (ts.isConditionalExpression(node))
          return merge(evaluate(node.whenTrue), evaluate(node.whenFalse))
        if (
          ts.isBinaryExpression(node) &&
          [
            ts.SyntaxKind.QuestionQuestionToken,
            ts.SyntaxKind.BarBarToken,
            ts.SyntaxKind.AmpersandAmpersandToken,
          ].includes(node.operatorToken.kind)
        )
          return merge(evaluate(node.left), evaluate(node.right))
        if (ts.isArrayLiteralExpression(node))
          return new Set(
            node.elements.flatMap(element =>
              [...evaluate(element)].map(token => nested('array', token)),
            ),
          )
        if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) return arrowValue(node)
        if (ts.isObjectLiteralExpression(node)) {
          const tokens = new Set<string>()
          for (const prop of node.properties) {
            if (ts.isSpreadAssignment(prop)) {
              for (const token of evaluate(prop.expression)) tokens.add(token)
            } else if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
              const key = nodeName(prop.name) ?? property(prop.name)
              const input = evaluate(ts.isPropertyAssignment(prop) ? prop.initializer : prop.name)
              for (const token of input) tokens.add(nested(key ?? '?', token))
            }
          }
          return tokens
        }
        return empty
      }
      function arrowValue(node: ts.ArrowFunction): Value {
        const invoked = ts.isCallExpression(node.body) ? evaluate(node.body.expression) : empty
        const capturedRead = invoked.has('read') ? value('read') : empty
        return new Set(
          [...merge(evaluate(node.body), capturedRead)].map(token => nested('callback', token)),
        )
      }
      let changed = false
      const add = (into: Set<string> | undefined, input: Value): void => {
        if (into === undefined) return
        for (const token of input)
          if (!into.has(token)) {
            into.add(token)
            changed = true
          }
      }
      const bind = (name: ts.BindingName, at: ts.Node, input: Value): void => {
        if (ts.isIdentifier(name)) add(symbol(name.text, at), input)
        else
          for (const element of name.elements) {
            if (!ts.isBindingElement(element)) continue
            if (ts.isArrayBindingPattern(name)) {
              bind(element.name, at, member(input, 'array'))
              continue
            }
            const key =
              nodeName(element.propertyName ?? element.name) ??
              property(element.propertyName ?? element.name)
            bind(
              element.name,
              at,
              element.dotDotDotToken !== undefined
                ? input
                : key === undefined
                  ? empty
                  : member(input, key),
            )
          }
      }
      // A finite monotone pass handles declarations before assignment and ordinary aliases.
      do {
        changed = false
        visitSyntax(syntax, node => {
          if (ts.isVariableDeclaration(node) || ts.isParameter(node))
            bind(
              node.name,
              node,
              merge(
                typeValue(node.type),
                evaluate(node.initializer),
                ts.isParameter(node) &&
                  p1r(node) &&
                  ts.isMethodDeclaration(node.parent) &&
                  nodeName(node.parent.name) === 'apply' &&
                  node.parent.parameters[0] === node
                  ? value('context')
                  : empty,
              ),
            )
          if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isIdentifier(node.left)
          )
            add(symbol(node.left.text, node), evaluate(node.right))
        })
      } while (changed)
      function lookupConstruction(node: ts.CallExpression): boolean {
        return (
          (path === `${directory}cordis.ts` && p1r(node)) ||
          (path === cliBootstrap && app(node, 'start'))
        )
      }
      function readerExecution(node: ts.CallExpression): boolean {
        return component || p1r(node) || adapter(node)
      }
      function replicaArgument(node: ts.CallExpression, argument: ts.Expression): boolean {
        return (
          app(node, 'start') &&
          evaluate(node.expression).has('replica-factory') &&
          node.arguments[0] === argument
        )
      }
      function lookupArgument(
        node: ts.CallExpression,
        argument: ts.Expression,
        input: Value,
      ): boolean {
        return (
          lookupConstruction(node) &&
          evaluate(node.expression).has('lookup-factory') &&
          node.arguments[0] === argument &&
          [...input].every(
            token =>
              token === 'readBoundReplicaIn:read' || token === 'readBoundReplicaIn:callback:read',
          )
        )
      }
      const legalCall = (node: ts.CallExpression, token: string): boolean => {
        if (token === 'binding-factory') return directoryOwner || app(node, 'start')
        if (token === 'replica-factory') return app(node, 'start')
        if (token === 'lookup-factory') return lookupConstruction(node)
        if (token === 'binding-reader') return component || p1r(node)
        if (token === 'read') return readerExecution(node)
        if (token === 'store') return component || app(node, 'publishCredential')
        if (token === 'close') return component || app(node, 'closeResources')
        return false
      }
      const legalArgument = (
        node: ts.CallExpression,
        argument: ts.Expression,
        input: Value,
      ): boolean => {
        const called = evaluate(node.expression)
        if (replicaArgument(node, argument))
          return [...input].every(token => token === 'readCredentialBindingIn:binding-reader')
        if (lookupArgument(node, argument, input)) return true
        // The component may delegate its typed options to same-file private helpers.
        if (
          component &&
          [...input].every(token => token === 'options') &&
          ((ts.isIdentifier(node.expression) &&
            syntax.statements.some(
              statement =>
                ts.isFunctionDeclaration(statement) &&
                statement.name?.text === node.expression.getText(syntax) &&
                !statement.modifiers?.some(
                  modifier => modifier.kind === ts.SyntaxKind.ExportKeyword,
                ),
            )) ||
            node.expression.getText(syntax) === 'Object.freeze')
        )
          return true
        return false
      }
      let replicaConstructions = 0
      visitSyntax(syntax, node => {
        if (inTypes(node)) return
        if (
          ts.isExportDeclaration(node) &&
          node.moduleSpecifier !== undefined &&
          ts.isStringLiteralLike(node.moduleSpecifier)
        ) {
          const kind = moduleKind(file, node.moduleSpecifier.text)
          if (
            ((kind === 'binding' || kind === 'lookup') && !directoryOwner) ||
            (kind === 'replica' && !path.startsWith(custodian)) ||
            kind === 'reader-adapter'
          )
            report(node, 'restricted model credential symbols cannot be re-exported')
        }
        if (ts.isCallExpression(node)) {
          const called = evaluate(node.expression)
          if (isApp && called.has('replica-factory') && ++replicaConstructions > 1)
            report(node, 'application must have one model replica construction site')
          for (const token of called)
            if (restricted.has(token) && !legalCall(node, token))
              report(node, `${token} execution is outside its permitted semantic function`)
          for (const argument of node.arguments) {
            const input = evaluate(argument)
            if (sensitive(input) && !legalArgument(node, argument, input))
              report(
                argument,
                'restricted closure or component escapes through an unapproved argument',
              )
          }
          if (
            (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
              (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
            node.arguments[0] !== undefined &&
            ts.isStringLiteralLike(node.arguments[0])
          ) {
            const kind = moduleKind(file, node.arguments[0].text)
            if (isRestrictedEntry(kind))
              report(node, 'restricted model credential entry requires a static import')
          }
        }
        if (
          (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
          property(node) !== undefined &&
          sensitive(evaluate(node.expression)) &&
          !evaluate(node.expression).has('options') &&
          !evaluate(node.expression).has('lookup-config') &&
          evaluate(node).size === 0
        )
          report(node, 'restricted value member is not an approved operation')
        if (
          ts.isElementAccessExpression(node) &&
          property(node) === undefined &&
          sensitive(evaluate(node.expression))
        )
          report(node, 'computed restricted member must be a statically known literal')
        if (
          ts.isNewExpression(node) &&
          evaluate(node.expression).has('reader-adapter') &&
          !app(node, 'start')
        )
          report(node, 'replica reader service construction is outside application start')
        if (ts.isNewExpression(node))
          for (const argument of node.arguments ?? [])
            if (
              sensitive(evaluate(argument)) &&
              !(
                app(node, 'start') &&
                evaluate(node.expression).has('reader-adapter') &&
                node.arguments?.[1] === argument &&
                [...evaluate(argument)].every(token => token === 'readIn:read')
              )
            )
              report(
                argument,
                'restricted closure or component escapes into an unapproved constructor',
              )
        if (ts.isThrowStatement(node) && sensitive(evaluate(node.expression)))
          report(node, 'restricted closure or component cannot escape through throw')
        if (ts.isTemplateSpan(node) && sensitive(evaluate(node.expression)))
          report(node, 'restricted closure or component cannot be rendered into text')
        const returned = ts.isReturnStatement(node)
          ? node.expression
          : ts.isArrowFunction(node) && !ts.isBlock(node.body)
            ? node.body
            : undefined
        if (
          sensitive(evaluate(returned)) &&
          !(
            component &&
            functionName(ts.isArrowFunction(node) ? node : node.parent.parent) ===
              'createModelReplicaCustodian' &&
            [...evaluate(returned)].every(token =>
              ['storeBoundReplica:store', 'readBoundReplicaIn:read', 'close:close'].includes(token),
            )
          )
        )
          report(
            ts.isReturnStatement(node) ? node : (returned ?? node),
            'restricted closure or component cannot escape through return',
          )
        if (ts.isExportAssignment(node) && sensitive(evaluate(node.expression)))
          report(node, 'restricted closure or component cannot escape through export')
        if (
          ts.isExportSpecifier(node) &&
          sensitive(symbol((node.propertyName ?? node.name).text, node) ?? empty)
        )
          report(node, 'restricted closure or component cannot be locally re-exported')
        if (
          ts.isVariableStatement(node) &&
          node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)
        )
          for (const declaration of node.declarationList.declarations)
            if (
              sensitive(evaluate(declaration.initializer)) ||
              (ts.isIdentifier(declaration.name) &&
                sensitive(symbol(declaration.name.text, declaration) ?? empty))
            )
              report(declaration, 'restricted closure or component cannot be an exported variable')
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          (!ts.isIdentifier(node.left) || symbol(node.left.text, node) === undefined) &&
          sensitive(evaluate(node.right))
        )
          report(node, 'restricted closure or component cannot escape into an object assignment')
        if (
          ts.isSpreadAssignment(node) &&
          sensitive(evaluate(node.expression)) &&
          !(component && [...evaluate(node.expression)].every(token => token === 'options'))
        )
          report(node, 'restricted closure or component cannot be spread into another object')
      })
    }
    return violations
  },
}
