import ts from 'typescript'
import { memberEdges } from '../metrics/graph.ts'
import { nodeName, visitSyntax } from '../syntax.ts'
import type {
  ActualExtraction,
  Fact,
  FactKind,
  ImportFact,
  ImportUnknown,
  PackageImport,
  Snapshot,
  Unknown,
} from './actual-model.ts'
import { StaticResolver, type ResolvedString } from './resolve.ts'
import { actualFactIdentity } from './actual-model.ts'

const SERVICE_KINDS = new Set<FactKind>([
  'defines',
  'provides',
  'injects',
  'optional',
  'contributes',
])
const dispatch = new Set(['emit', 'parallel', 'serial', 'bail', 'waterfall'])
const property = (
  node: ts.ObjectLiteralExpression,
  name: string,
): ts.ObjectLiteralElementLike | undefined =>
  node.properties.find(item => 'name' in item && nodeName(item.name) === name)
function expression(node: ts.ObjectLiteralElementLike | undefined): ts.Node | undefined {
  if (node === undefined) return undefined
  if (ts.isPropertyAssignment(node)) return node.initializer
  if (ts.isShorthandPropertyAssignment(node)) return node.name
  if (ts.isMethodDeclaration(node)) return node
  return undefined
}
const tag = (node: ts.Node, name: string): string | undefined => {
  const found = ts.getJSDocTags(node).find(item => item.tagName.text === name)?.comment
  return typeof found === 'string' ? found.trim() : undefined
}
interface Plugin {
  readonly name: string
  readonly member: string
  readonly node: ts.Node
  readonly apply?: ts.FunctionLikeDeclaration
  readonly inject?: ts.Node
  readonly serviceClass?: ts.ClassDeclaration
}
interface WalkContext {
  readonly member: string
  readonly plugin?: string
  readonly scope: string
  readonly required: ReadonlySet<string>
  readonly contexts: ReadonlySet<ts.Symbol>
  readonly keys: ReadonlyMap<ts.Symbol, string>
}

class Extractor {
  readonly resolver: StaticResolver
  readonly facts = new Map<string, Fact>()
  readonly unknown = new Map<string, Unknown>()
  readonly attempts = new Set<string>()
  readonly failed = new Set<string>()
  readonly imports: ImportFact[] = []
  readonly packageImports: PackageImport[] = []
  readonly importUnknown: ImportUnknown[] = []
  readonly factOccurrences = new Map<string, Fact>()
  readonly plugins: Plugin[] = []
  readonly registeredObjects = new Set<ts.ObjectLiteralExpression>()
  readonly visited = new Set<string>()
  readonly ownedFunctions = new Set<ts.FunctionLikeDeclaration>()
  readonly snapshot: Snapshot
  constructor(snapshot: Snapshot) {
    this.snapshot = snapshot
    this.resolver = new StaticResolver(snapshot)
  }

  add(
    kind: FactKind,
    key: string,
    node: ts.Node,
    context: Pick<WalkContext, 'member' | 'plugin' | 'scope'>,
    extra: Partial<Fact> = {},
  ): void {
    const id = [
      context.member,
      context.plugin ?? '',
      context.scope,
      kind,
      key,
      extra.mode ?? '',
      extra.target ?? '',
      extra.symbol ?? '',
    ].join('|')
    const fact: Fact = {
      ...this.resolver.site(node),
      member: context.member,
      scope: context.scope,
      ...(context.plugin === undefined ? {} : { plugin: context.plugin }),
      kind,
      key,
      ...extra,
      id,
    }
    this.facts.set(id, fact)
    this.factOccurrences.set(JSON.stringify([actualFactIdentity(fact), fact.path, node.pos]), fact)
  }
  key(
    kind: FactKind,
    node: ts.Node | undefined,
    context: WalkContext,
    extra: Partial<Fact> = {},
  ): string | undefined {
    if (node === undefined) return undefined
    const site = this.resolver.site(node)
    const identity = JSON.stringify([site.path, node.pos, context.plugin, context.scope, kind])
    const serviceIdentifier = SERVICE_KINDS.has(kind)
    if (serviceIdentifier) this.attempts.add(identity)
    const result =
      this.resolver.string(node) ??
      (ts.isIdentifier(node) && this.resolver.symbol(node) !== undefined
        ? this.parameterKey(node, context)
        : undefined)
    if (result === undefined) {
      if (serviceIdentifier) this.failed.add(identity)
      this.unknown.set(identity, {
        ...site,
        member: context.member,
        ...(context.plugin === undefined ? {} : { plugin: context.plugin }),
        scope: context.scope,
        kind,
        expression: node.getText(),
        reason: 'Expression has no static string value in this revision',
        serviceIdentifier,
      })
      return undefined
    }
    this.add(kind, result.value, node, context, {
      expression: node.getText(),
      expressionShape: ts.SyntaxKind[node.kind],
      ...(result.declaration === undefined ? {} : { declaration: result.declaration }),
      ...extra,
    })
    return result.value
  }
  parameterKey(node: ts.Node, context: WalkContext): ResolvedString | undefined {
    const symbol = this.resolver.symbol(node)
    const key = symbol === undefined ? undefined : context.keys.get(symbol)
    return key === undefined ? undefined : { value: key }
  }
  contextType(node: ts.TypeNode | undefined): boolean {
    return this.resolver.typeImported(node, 'Context', '@deepseek-ai/cordis')
  }
  isContext(node: ts.Node, context: WalkContext, seen = new Set<ts.Node>()): boolean {
    node = this.resolver.unwrap(node)
    if (seen.has(node)) return false
    seen.add(node)
    const symbol = this.resolver.symbol(ts.isPropertyAccessExpression(node) ? node.name : node)
    if (symbol !== undefined && context.contexts.has(symbol)) return true
    const decl = this.resolver.declaration(ts.isPropertyAccessExpression(node) ? node.name : node)
    if (
      decl !== undefined &&
      (ts.isParameter(decl) ||
        ts.isPropertyDeclaration(decl) ||
        ts.isPropertySignature(decl) ||
        ts.isVariableDeclaration(decl))
    ) {
      if (this.contextType(decl.type)) return true
      if (ts.isVariableDeclaration(decl) && decl.initializer !== undefined)
        return this.isContext(decl.initializer, context, seen)
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ThisKeyword &&
      node.name.text === 'ctx'
    ) {
      let parent: ts.Node | undefined = node.parent
      while (parent !== undefined && !ts.isClassDeclaration(parent)) parent = parent.parent
      return parent !== undefined && this.serviceBase(parent) !== undefined
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'extend'
    )
      return this.isContext(node.expression.expression, context, seen)
    return (
      ts.isNewExpression(node) &&
      this.resolver.imported(node.expression, 'Context', '@deepseek-ai/cordis')
    )
  }
  contextBearing(node: ts.Node, context: WalkContext): boolean {
    if (this.isContext(node, context)) return true
    const value = this.resolver.value(node)
    if (value !== undefined && ts.isObjectLiteralExpression(value))
      return value.properties.some(item => {
        const field = expression(item)
        return field !== undefined && this.isContext(field, context)
      })
    const type = this.resolver.checker.getTypeAtLocation(node)
    return type
      .getProperties()
      .some(symbol =>
        symbol.declarations?.some(
          decl =>
            (ts.isPropertySignature(decl) || ts.isPropertyDeclaration(decl)) &&
            this.contextType(decl.type),
        ),
      )
  }
  serviceBase(node: ts.ClassDeclaration): ts.Expression | undefined {
    const base = node.heritageClauses?.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword)
      ?.types[0]?.expression
    if (base === undefined) return undefined
    if (this.resolver.imported(base, 'Service', '@deepseek-ai/cordis')) return base
    const decl = this.resolver.declaration(base)
    return decl !== undefined && ts.isClassDeclaration(decl) && this.serviceBase(decl) !== undefined
      ? base
      : undefined
  }
  classKey(node: ts.ClassDeclaration, seen = new Set<ts.ClassDeclaration>()): ts.Node | undefined {
    if (seen.has(node)) return undefined
    seen.add(node)
    const provide = node.members.find(
      item =>
        ts.isPropertyDeclaration(item) &&
        item.modifiers?.some(mod => mod.kind === ts.SyntaxKind.StaticKeyword) &&
        nodeName(item.name) === 'provide',
    )
    if (provide !== undefined && ts.isPropertyDeclaration(provide)) return provide.initializer
    const base = this.serviceBase(node)
    const decl = base === undefined ? undefined : this.resolver.declaration(base)
    if (decl !== undefined && ts.isClassDeclaration(decl)) return this.classKey(decl, seen)
    let key: ts.Node | undefined
    const constructor = node.members.find(ts.isConstructorDeclaration)
    if (constructor?.body !== undefined)
      visitSyntax(constructor.body, child => {
        if (ts.isCallExpression(child) && child.expression.kind === ts.SyntaxKind.SuperKeyword)
          key = child.arguments[1]
      })
    return key
  }
  tags(node: ts.Node): Partial<Fact> {
    const contract = tag(node, 'contract'),
      owner = tag(node, 'owner'),
      mode = tag(node, 'mode')
    return {
      ...(contract === undefined ? {} : { contract }),
      ...(owner === undefined ? {} : { owner }),
      ...(mode === undefined ? {} : { mode }),
    }
  }
  empty(member: string): WalkContext {
    return { member, scope: 'top', required: new Set(), contexts: new Set(), keys: new Map() }
  }

  interfaceMembers(
    node: ts.InterfaceDeclaration,
    seen = new Set<ts.InterfaceDeclaration>(),
  ): ts.TypeElement[] {
    if (seen.has(node)) return []
    seen.add(node)
    const members = [...node.members]
    for (const clause of node.heritageClauses ?? [])
      for (const type of clause.types) {
        const declaration = this.resolver.declaration(type.expression)
        if (declaration !== undefined && ts.isInterfaceDeclaration(declaration))
          members.push(...this.interfaceMembers(declaration, seen))
      }
    return members
  }
  pluginType(node: ts.TypeNode | undefined): boolean {
    return this.resolver.typeImported(node, 'Plugin', '@deepseek-ai/cordis')
  }
  pluginObject(
    node: ts.ObjectLiteralExpression,
    apply: ts.FunctionLikeDeclaration | undefined,
  ): boolean {
    if (this.contextType(apply?.parameters[0]?.type) || this.registeredObjects.has(node))
      return true
    let parent: ts.Node = node.parent
    while (ts.isParenthesizedExpression(parent)) parent = parent.parent
    if (ts.isSatisfiesExpression(parent) || ts.isAsExpression(parent))
      return this.pluginType(parent.type)
    return ts.isVariableDeclaration(parent) && this.pluginType(parent.type)
  }
  unconfirmedPlugin(node: ts.Node, context: WalkContext): void {
    this.unknown.set(`${this.resolver.path(node)}|${node.pos}|candidate-plugin`, {
      ...this.resolver.site(node),
      member: context.member,
      scope: context.scope,
      kind: 'plugin',
      expression: node.getText(),
      reason:
        'name/apply candidate has no static Cordis Context, Plugin type or ctx.plugin registration provenance',
      serviceIdentifier: false,
    })
  }
  registrations(tree: ts.SourceFile): void {
    const member = this.resolver.member(this.resolver.path(tree))?.path
    if (member === undefined) return
    visitSyntax(tree, node => {
      if (
        !ts.isCallExpression(node) ||
        !ts.isPropertyAccessExpression(node.expression) ||
        node.expression.name.text !== 'plugin' ||
        !this.isContext(node.expression.expression, this.empty(member))
      )
        return
      const value = this.resolver.value(node.arguments[0])
      if (value !== undefined && ts.isObjectLiteralExpression(value))
        this.registeredObjects.add(value)
    })
  }
  discoverObject(node: ts.ObjectLiteralExpression, context: WalkContext): void {
    const member = context.member

    const name = expression(property(node, 'name')),
      apply = expression(property(node, 'apply'))
    const call = node.parent
    const wrapped =
      ts.isCallExpression(call) &&
      ['@omne-harness-lite/kernel-basis', '@omne-harness-lite/kernel-basis/cordis'].some(module =>
        this.resolver.imported(call.expression, 'definePlugin', module),
      )
    if (apply === undefined || (!wrapped && name === undefined)) return
    const body = this.resolver.callable(apply)
    if (!wrapped && !this.pluginObject(node, body)) {
      this.unconfirmedPlugin(node, context)
      return
    }
    const key = this.key('plugin', name, context)
    const inject = expression(property(node, 'inject'))
    if (key !== undefined || body !== undefined)
      this.plugins.push({
        name: key ?? `unresolved:${name?.getText() ?? '?'}`,
        member,
        node,
        ...(inject === undefined ? {} : { inject }),
        ...(body === undefined ? {} : { apply: body }),
      })
  }
  classPluginName(node: ts.ClassDeclaration, context: WalkContext): string {
    const serviceDefinition = {
      ...this.resolver.site(node),
      member: context.member,
      symbol: node.name?.text ?? 'default',
      offset: node.getStart(),
    }
    const metadata = node.members.find(
      item =>
        (ts.isPropertyDeclaration(item) || ts.isGetAccessorDeclaration(item)) &&
        item.modifiers?.some(mod => mod.kind === ts.SyntaxKind.StaticKeyword) &&
        nodeName(item.name) === 'name',
    )
    if (metadata !== undefined) {
      const value = ts.isPropertyDeclaration(metadata)
        ? (metadata.initializer ?? metadata.name)
        : metadata
      return (
        this.key('plugin', value, context, { serviceDefinition }) ??
        `unresolved:class:${node.name?.text ?? 'default'}`
      )
    }
    const name = node.name?.text ?? 'default'
    this.add('plugin', name, node, context, { serviceDefinition })
    return name
  }
  discoverService(node: ts.ClassDeclaration, context: WalkContext): void {
    const member = context.member

    const ownKey = node.members.find(
      item =>
        ts.isPropertyDeclaration(item) &&
        item.modifiers?.some(mod => mod.kind === ts.SyntaxKind.StaticKeyword) &&
        nodeName(item.name) === 'provide',
    )
    const key = this.classKey(node)
    // Inherited keys are providers; own static keys and legacy super keys are declarations.
    if (
      ownKey !== undefined ||
      this.resolver.imported(this.serviceBase(node) ?? node, 'Service', '@deepseek-ai/cordis')
    )
      this.key('defines', key, context, {
        ...this.tags(node),
        definitionForm: 'service-class',
        serviceDefinition: {
          ...this.resolver.site(node),
          member,
          symbol: node.name?.text ?? 'default',
          offset: node.getStart(),
        },
        symbol: node.name?.text ?? 'default',
      })
    if (!node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.AbstractKeyword)) {
      const pluginName = this.classPluginName(node, context)
      const inject = node.members.find(
        item =>
          ts.isPropertyDeclaration(item) &&
          item.modifiers?.some(mod => mod.kind === ts.SyntaxKind.StaticKeyword) &&
          nodeName(item.name) === 'inject',
      )
      this.plugins.push({
        name: pluginName,
        member,
        node,
        serviceClass: node,
        ...(inject !== undefined &&
        ts.isPropertyDeclaration(inject) &&
        inject.initializer !== undefined
          ? { inject: inject.initializer }
          : {}),
      })
    }
  }
  discoverClassPlugin(node: ts.ClassDeclaration, context: WalkContext): void {
    const member = context.member
    if (!(
      this.serviceBase(node) === undefined &&
      node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword) &&
      node.members.some(
        item => ts.isConstructorDeclaration(item) && this.contextType(item.parameters[0]?.type),
      )
    ))
      return

    const name = this.classPluginName(node, context)
    const inject = node.members.find(
      item =>
        ts.isPropertyDeclaration(item) &&
        item.modifiers?.some(mod => mod.kind === ts.SyntaxKind.StaticKeyword) &&
        nodeName(item.name) === 'inject',
    )
    this.plugins.push({
      name,
      member,
      node,
      serviceClass: node,
      ...(inject !== undefined &&
      ts.isPropertyDeclaration(inject) &&
      inject.initializer !== undefined
        ? { inject: inject.initializer }
        : {}),
    })
  }
  discoverAugmentation(node: ts.InterfaceDeclaration, context: WalkContext): void {
    if (node.name.text !== 'Context' && node.name.text !== 'Events') return

    let module: ts.Node | undefined = node.parent
    while (module !== undefined && !ts.isModuleDeclaration(module)) module = module.parent
    if (
      module === undefined ||
      !ts.isStringLiteral(module.name) ||
      module.name.text !== '@deepseek-ai/cordis'
    )
      return
    for (const item of this.interfaceMembers(node)) {
      const name = nodeName(item.name)
      const type = ts.isPropertySignature(item) ? item.type : undefined
      const declaration =
        type !== undefined && ts.isTypeReferenceNode(type)
          ? this.resolver.declaration(type.typeName)
          : undefined
      const serviceDefinition =
        node.name.text === 'Context' &&
        declaration !== undefined &&
        ts.isClassDeclaration(declaration) &&
        this.serviceBase(declaration) !== undefined
          ? {
              ...this.resolver.site(declaration),
              symbol: declaration.name?.text ?? 'default',
              offset: declaration.getStart(),
            }
          : undefined
      const definition = {
        ...(node.name.text === 'Context'
          ? { definitionForm: 'context-augmentation' as const }
          : {}),
        ...(serviceDefinition === undefined ? {} : { serviceDefinition }),
      }
      if (name === undefined && item.name !== undefined && ts.isComputedPropertyName(item.name)) {
        this.key(
          node.name.text === 'Context' ? 'defines' : 'event-declaration',
          item.name.expression,
          context,
          {
            ...this.tags(item),
            ...definition,
          },
        )
        continue
      }
      if (name === undefined) continue
      const kind = node.name.text === 'Context' ? 'defines' : 'event-declaration'
      if (kind === 'defines') this.attempts.add(`${this.resolver.path(item)}|${item.pos}|defines`)
      this.add(kind, name, item, context, {
        ...this.tags(item),
        ...definition,
      })
    }
  }
  discoverNative(tree: ts.SourceFile, context: WalkContext): void {
    const member = context.member
    const name = this.resolver.exported(tree, 'name', 'value'),
      apply = this.resolver.exported(tree, 'apply', 'value'),
      inject = this.resolver.exported(tree, 'inject', 'value')
    const nativeApply = this.resolver.callable(apply)
    if (nativeApply === undefined || name === undefined) return
    if (!this.contextType(nativeApply.parameters[0]?.type)) {
      this.unconfirmedPlugin(nativeApply, context)
      return
    }
    const key = this.key('plugin', name, context)
    if (key !== undefined)
      this.plugins.push({
        name: key,
        member,
        node: nativeApply,
        apply: nativeApply,
        ...(inject === undefined ? {} : { inject }),
      })
  }
  discover(tree: ts.SourceFile): void {
    const member = this.resolver.member(this.resolver.path(tree))?.path
    if (member === undefined) return
    const context = this.empty(member)
    visitSyntax(tree, node => {
      if (ts.isObjectLiteralExpression(node)) this.discoverObject(node, context)
      if (ts.isClassDeclaration(node)) {
        if (this.serviceBase(node) !== undefined) this.discoverService(node, context)
        else this.discoverClassPlugin(node, context)
      }
      if (ts.isInterfaceDeclaration(node)) this.discoverAugmentation(node, context)
    })
    this.discoverNative(tree, context)
  }
  dependencies(plugin: Plugin, context: WalkContext): WalkContext {
    const required = new Set<string>()
    if (plugin.inject !== undefined) {
      const array = this.resolver.value(plugin.inject)
      if (array !== undefined && ts.isArrayLiteralExpression(array)) {
        for (const item of array.elements) {
          const key = this.key('injects', item, context, {
            injectExpression: plugin.inject.getText(),
            injectShape: ts.SyntaxKind[plugin.inject.kind],
          })
          if (key !== undefined) required.add(key)
        }
      } else this.key('injects', plugin.inject, context)
    }
    return { ...context, required }
  }
  enter(
    fn: ts.FunctionLikeDeclaration,
    context: WalkContext,
    args: readonly ts.Expression[],
    active: ReadonlySet<ts.Node>,
    implicit = false,
  ): void {
    if (fn.body === undefined || active.has(fn)) return
    if (context.plugin !== undefined) this.ownedFunctions.add(fn)
    const contexts = new Set(context.contexts),
      keys = new Map(context.keys)
    fn.parameters.forEach((parameter, index) => {
      const symbol = this.resolver.symbol(parameter.name),
        arg = args[index]
      if (symbol === undefined) return
      if (
        (implicit &&
          index === 0 &&
          (parameter.type === undefined || this.contextType(parameter.type))) ||
        (arg !== undefined && this.isContext(arg, context))
      )
        contexts.add(symbol)
      const key =
        arg === undefined
          ? undefined
          : (this.resolver.string(arg)?.value ?? this.parameterKey(arg, context)?.value)
      if (key !== undefined) keys.set(symbol, key)
    })
    const identity = JSON.stringify([
      this.resolver.path(fn),
      fn.pos,
      context.member,
      context.plugin,
      context.scope,
      [...context.required].sort(),
      fn.parameters.map(parameter => {
        const symbol = this.resolver.symbol(parameter.name)
        return symbol === undefined ? null : [contexts.has(symbol), keys.get(symbol) ?? null]
      }),
    ])
    if (this.visited.has(identity)) return
    this.visited.add(identity)
    this.walk(fn.body, { ...context, contexts, keys }, new Set([...active, fn]))
  }
  serviceKey(node: ts.Node, context: WalkContext): ts.Node | undefined {
    node = this.resolver.unwrap(node)
    if (ts.isPropertyAccessExpression(node) && this.isContext(node.expression, context))
      return node.name
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'get' &&
      this.isContext(node.expression.expression, context)
    )
      return node.arguments[0]
    const decl = this.resolver.declaration(node)
    return decl !== undefined && ts.isVariableDeclaration(decl) && decl.initializer !== undefined
      ? this.serviceKey(decl.initializer, context)
      : undefined
  }
  contextCall(
    call: ts.CallExpression,
    context: WalkContext,
    active: ReadonlySet<ts.Node>,
  ): boolean {
    const callee = call.expression
    if (!ts.isPropertyAccessExpression(callee) || !this.isContext(callee.expression, context))
      return false
    const method = callee.name.text,
      arg = call.arguments[0]
    if (method === 'provide') this.key('provides', arg, context, { provideForm: 'ctx.provide' })
    else if (method === 'get') {
      const key =
        this.resolver.string(arg)?.value ??
        (arg === undefined ? undefined : this.parameterKey(arg, context)?.value)
      if (key === undefined || !context.required.has(key)) this.key('optional', arg, context)
      else {
        // Still count the successful service identifier attempt without creating an optional fact.
        if (arg !== undefined)
          this.attempts.add(`${this.resolver.path(arg)}|${arg.pos}|${context.plugin}|get`)
      }
    } else if (dispatch.has(method)) this.key('emits', arg, context, { mode: method })
    else if (method === 'on' || method === 'once') this.key('listens', arg, context)
    else if (method === 'inject') {
      const child = {
        ...context,
        scope: `inject:${arg?.getText() ?? '?'}:${call.arguments[1]?.getText().split('=>')[0] ?? ''}`,
      }
      const array = this.resolver.value(arg),
        required = new Set(context.required)
      if (array !== undefined && ts.isArrayLiteralExpression(array))
        for (const item of array.elements) {
          const key = this.key('injects', item, child, {
            injectExpression: arg?.getText() ?? '',
            injectShape: arg === undefined ? '' : ts.SyntaxKind[arg.kind],
          })
          if (key !== undefined) required.add(key)
        }
      else this.key('injects', arg, child)
      const fn = this.resolver.callable(call.arguments[1])
      if (fn !== undefined) this.enter(fn, { ...child, required }, [], active, true)
      return true
    }
    return false
  }
  walk(node: ts.Node, context: WalkContext, active: ReadonlySet<ts.Node>): void {
    if (ts.isCallExpression(node)) {
      if (this.contextCall(node, context, active)) return
      if (
        // The root spelling belongs to historical snapshots, not the current public API.
        ['@omne-harness-lite/kernel-basis', '@omne-harness-lite/kernel-basis/cordis'].some(module =>
          this.resolver.imported(node.expression, 'resolveOptional', module),
        ) &&
        node.arguments[0] !== undefined &&
        this.isContext(node.arguments[0], context)
      ) {
        const arg = node.arguments[1],
          key = this.resolver.string(arg)?.value
        if (key === undefined || !context.required.has(key)) this.key('optional', arg, context)
        else if (arg !== undefined)
          this.attempts.add(
            `${this.resolver.path(arg)}|${arg.pos}|${context.plugin}|resolveOptional`,
          )
      } else {
        if (
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'register'
        ) {
          const service = this.serviceKey(node.expression.expression, context)
          if (service !== undefined) {
            if (ts.isIdentifier(service) && ts.isPropertyAccessExpression(service.parent)) {
              this.attempts.add(
                `${this.resolver.path(service)}|${service.pos}|${context.plugin}|contributes`,
              )
              this.add('contributes', service.text, service, context)
            } else this.key('contributes', service, context)
          }
        }
        const fn = this.resolver.callable(node.expression)
        if (
          fn !== undefined &&
          this.resolver.member(this.resolver.path(fn)) !== undefined &&
          node.arguments.some(arg => this.contextBearing(arg, context))
        )
          this.enter(fn, context, node.arguments, active)
      }
    }
    if (ts.isNewExpression(node)) {
      const declaration = this.resolver.declaration(node.expression)
      if (
        declaration !== undefined &&
        ts.isClassDeclaration(declaration) &&
        !active.has(declaration) &&
        (this.serviceBase(declaration) !== undefined ||
          node.arguments?.some(arg => this.contextBearing(arg, context)))
      ) {
        const classActive = new Set([...active, declaration])
        if (this.serviceBase(declaration) !== undefined)
          this.key('provides', this.classKey(declaration), context, {
            provideForm: 'service-instance',
          })
        const constructor = declaration.members.find(ts.isConstructorDeclaration)
        if (constructor !== undefined)
          this.enter(constructor, context, node.arguments ?? [], classActive)
        for (const method of declaration.members)
          if (ts.isMethodDeclaration(method) && method.body !== undefined)
            this.enter(method, context, [], classActive)
      }
    }
    ts.forEachChild(node, child => this.walk(child, context, active))
  }
  importTarget(
    specifier: string,
    tree: ts.SourceFile,
  ): { resolved: string | undefined; target: string | undefined } {
    const resolved = this.resolver.modulePath(specifier, tree)
    let target = resolved === undefined ? undefined : this.resolver.member(resolved)?.path
    if (target === undefined && !specifier.startsWith('.'))
      for (const item of this.snapshot.members) {
        const text = this.snapshot.texts.get(`${item.path}/package.json`)
        const raw: unknown = text === undefined ? undefined : JSON.parse(text)
        if (
          typeof raw !== 'object' ||
          raw === null ||
          !('name' in raw) ||
          typeof raw.name !== 'string'
        )
          continue
        if (specifier === raw.name || specifier.startsWith(`${raw.name}/`)) {
          target = item.path
          break
        }
      }
    return { resolved, target }
  }
  recordImport(
    node: ts.Node,
    specifier: string,
    symbol: string,
    type: boolean,
    form: ImportFact['form'],
    local?: string,
  ): void {
    const tree = node.getSourceFile(),
      member = this.resolver.member(this.resolver.path(tree))?.path
    if (member === undefined) return
    const { resolved, target } = this.importTarget(specifier, tree)
    this.packageImports.push({
      ...this.resolver.site(node),
      member,
      specifier,
      symbol,
      type,
      form,
      id: JSON.stringify([member, target ?? specifier, symbol, type, form]),
      target:
        target === undefined
          ? { kind: specifier.startsWith('.') ? 'unresolved-local' : 'external' }
          : { kind: 'workspace', member: target },
      ...(local === undefined ? {} : { local }),
      ...(resolved === undefined ? {} : { resolvedPath: resolved }),
    })
    if (resolved === undefined && (target !== undefined || specifier.startsWith('.')))
      this.importUnknown.push({
        ...this.resolver.site(node),
        member,
        kind: 'import',
        expression: specifier,
        id: JSON.stringify([member, 'import-resolution', target ?? specifier, symbol, type, form]),
        reason:
          'Static module source cannot be resolved in this version; a workspace target identifies its manifest, not an observed export implementation',
      })
    if (target === undefined || target === member) return
    this.imports.push({
      ...this.resolver.site(node),
      id: [member, target, symbol, type, form].join('|'),
      member,
      target,
      specifier,
      symbol,
      type,
      form,
      ...(local === undefined ? {} : { local }),
    })
  }
  readImports(tree: ts.SourceFile): void {
    const member = this.resolver.member(this.resolver.path(tree))?.path
    if (member === undefined) return
    visitSyntax(tree, node => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text,
          clause = node.importClause
        if (clause === undefined)
          this.recordImport(node, specifier, '(side-effect)', false, 'import')
        if (clause?.name !== undefined)
          this.recordImport(
            node,
            specifier,
            'default',
            clause.isTypeOnly,
            'import',
            clause.name.text,
          )
        const bindings = clause?.namedBindings
        if (bindings !== undefined && ts.isNamedImports(bindings) && bindings.elements.length === 0)
          this.recordImport(node, specifier, '(module)', clause?.isTypeOnly ?? false, 'import')
        if (bindings !== undefined && ts.isNamespaceImport(bindings))
          this.recordImport(
            node,
            specifier,
            '*',
            clause?.isTypeOnly ?? false,
            'import',
            bindings.name.text,
          )
        if (bindings !== undefined && ts.isNamedImports(bindings))
          for (const item of bindings.elements)
            this.recordImport(
              item,
              specifier,
              (item.propertyName ?? item.name).text,
              item.isTypeOnly || (clause?.isTypeOnly ?? false),
              'import',
              item.name.text,
            )
      } else if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier !== undefined &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        if (
          node.exportClause !== undefined &&
          ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.length === 0
        )
          this.recordImport(node, node.moduleSpecifier.text, '(module)', node.isTypeOnly, 'export')
        if (node.exportClause !== undefined && ts.isNamedExports(node.exportClause))
          for (const item of node.exportClause.elements)
            this.recordImport(
              item,
              node.moduleSpecifier.text,
              (item.propertyName ?? item.name).text,
              item.isTypeOnly || node.isTypeOnly,
              'export',
              item.name.text,
            )
        else this.recordImport(node, node.moduleSpecifier.text, '*', node.isTypeOnly, 'export')
      } else if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      ) {
        this.recordImport(
          node,
          node.argument.literal.text,
          node.qualifier?.getText() ?? '*',
          true,
          'import',
        )
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const argument = node.arguments[0]
        const value = argument === undefined ? undefined : this.resolver.string(argument)
        if (value !== undefined) this.recordImport(node, value.value, '*', false, 'dynamic')
        else {
          const expression = argument?.getText() ?? '(missing argument)'
          this.importUnknown.push({
            ...this.resolver.site(node),
            member,
            kind: 'import',
            expression,
            id: JSON.stringify([member, 'import', expression]),
            reason: 'Dynamic import specifier has no static string value in this revision',
          })
        }
      }
    })
  }
  pluginDefinition(
    reference: ts.Node,
    seen = new Set<ts.Node>(),
    allowMetadata = true,
  ): ts.Node | undefined {
    const value = this.resolver.value(reference)
    if (value === undefined || seen.has(value)) return undefined
    seen.add(value)
    if (ts.isObjectLiteralExpression(value)) return value
    const declaration = this.resolver.declaration(reference)
    if (declaration !== undefined && ts.isClassDeclaration(declaration)) return declaration
    if (!ts.isCallExpression(value)) return undefined
    if (
      value.arguments.length === 1 &&
      ['@omne-harness-lite/kernel-basis', '@omne-harness-lite/kernel-basis/cordis'].some(module =>
        this.resolver.imported(value.expression, 'definePlugin', module),
      )
    ) {
      const object = this.resolver.value(value.arguments[0])
      return object !== undefined && ts.isObjectLiteralExpression(object) ? object : undefined
    }
    // Only append the adopted metadata. Overrides, spread, getters and arbitrary calls stay unknown.
    const callee = value.expression
    if (
      !allowMetadata ||
      value.arguments.length !== 2 ||
      !ts.isPropertyAccessExpression(callee) ||
      callee.name.text !== 'assign' ||
      !ts.isIdentifier(callee.expression) ||
      callee.expression.text !== 'Object' ||
      this.resolver.declaration(callee.expression) !== undefined
    )
      return undefined
    const metadata = this.resolver.value(value.arguments[1])
    if (metadata === undefined || !ts.isObjectLiteralExpression(metadata)) return undefined
    const keys = new Set<string>()
    for (const item of metadata.properties) {
      if (!ts.isPropertyAssignment(item) && !ts.isShorthandPropertyAssignment(item))
        return undefined
      const key = nodeName(item.name)
      if (
        key === undefined ||
        !['assemblyLifecycle', 'describeAssembly'].includes(key) ||
        keys.has(key)
      )
        return undefined
      keys.add(key)
    }
    const target = value.arguments[0]
    if (target === undefined) return undefined
    const definition = this.pluginDefinition(target, seen, false)
    if (definition === undefined || !ts.isObjectLiteralExpression(definition)) return undefined
    if (definition.properties.some(item => 'name' in item && keys.has(nodeName(item.name) ?? '')))
      return undefined
    return definition
  }
  treeReference(reference: ts.Node, tree: ts.SourceFile): ts.Node | undefined {
    const value = this.resolver.value(reference)
    if (value === undefined || !ts.isObjectLiteralExpression(value)) return reference
    const packageName = this.resolver.string(expression(property(value, 'package')))?.value
    const exportedName = this.resolver.string(expression(property(value, 'export')))?.value
    if (packageName === undefined || exportedName === undefined) return reference
    // A tree reference selects a public /cordis export, never a private source path.
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u.test(packageName)) return undefined
    const path = this.resolver.modulePath(`${packageName}/cordis`, tree)
    const module =
      path === undefined
        ? undefined
        : this.resolver.trees().find(item => this.resolver.path(item) === path)
    return module === undefined ? undefined : this.resolver.exported(module, exportedName, 'value')
  }
  manifest(tree: ts.SourceFile): void {
    const member = this.resolver.member(this.resolver.path(tree))?.path
    if (member === undefined || !member.startsWith('apps/')) return
    visitSyntax(tree, node => {
      if (!ts.isObjectLiteralExpression(node)) return
      const reference = expression(property(node, 'plugin'))
      const name = expression(property(node, 'name')) ?? expression(property(node, 'id'))
      if (reference === undefined || name === undefined) return
      const key = this.resolver.string(name)?.value
      const selected = this.treeReference(reference, tree)
      const definition = selected === undefined ? undefined : this.pluginDefinition(selected)
      const plugin = this.plugins.find(
        item =>
          definition !== undefined &&
          (item.node === definition || item.serviceClass === definition),
      )
      const targetNode = this.resolver.declaration(reference)
      const target =
        targetNode === undefined
          ? undefined
          : this.resolver.member(this.resolver.path(targetNode))?.path
      if (key !== undefined && plugin !== undefined)
        this.add(
          'composition',
          key,
          node,
          { member, scope: 'top', plugin: plugin.name },
          { target: plugin.member, symbol: reference.getText(), layer: 'distribution' },
        )
      else {
        const unresolved = key === undefined ? name : reference
        this.unknown.set(`${this.resolver.path(node)}|${node.pos}|composition`, {
          ...this.resolver.site(unresolved),
          member,
          scope: 'top',
          kind: 'composition',
          expression: unresolved.getText(),
          reason:
            key === undefined
              ? 'Manifest entry identity is not statically resolved'
              : `Manifest plugin reference is not statically resolved${target === undefined ? '' : ` (${target})`}`,
          serviceIdentifier: false,
        })
      }
    })
  }
  run(): ActualExtraction {
    for (const tree of this.resolver.trees()) this.registrations(tree)
    for (const tree of this.resolver.trees()) {
      this.discover(tree)
      this.readImports(tree)
    }
    for (const plugin of this.plugins) {
      const context = this.dependencies(plugin, {
        ...this.empty(plugin.member),
        plugin: plugin.name,
      })
      if (plugin.apply !== undefined) this.enter(plugin.apply, context, [], new Set(), true)
      if (plugin.serviceClass !== undefined) {
        if (this.serviceBase(plugin.serviceClass) !== undefined)
          this.key('provides', this.classKey(plugin.serviceClass), context, {
            provideForm: 'class-plugin',
            serviceDefinition: {
              ...this.resolver.site(plugin.serviceClass),
              member: plugin.member,
              symbol: plugin.serviceClass.name?.text ?? 'default',
              offset: plugin.serviceClass.getStart(),
            },
          })
        for (const item of plugin.serviceClass.members)
          if (ts.isConstructorDeclaration(item) || ts.isMethodDeclaration(item))
            this.enter(item, context, [], new Set(), ts.isConstructorDeclaration(item))
      }
    }
    for (const tree of this.resolver.trees()) this.manifest(tree)
    // Context-typed public helpers not reached from a plugin remain explicitly unowned.
    for (const tree of this.resolver.trees()) {
      const member = this.resolver.member(this.resolver.path(tree))?.path
      if (member === undefined) continue
      visitSyntax(tree, node => {
        if (
          ts.isFunctionDeclaration(node) &&
          !this.ownedFunctions.has(node) &&
          node.parameters.some(parameter => this.contextType(parameter.type))
        )
          this.enter(node, this.empty(member), [], new Set())
      })
    }
    return {
      facts: [...this.facts.values()].sort((a, b) => a.id.localeCompare(b.id)),
      factOccurrences: [...this.factOccurrences.values()].sort(
        (a, b) => a.id.localeCompare(b.id) || a.path.localeCompare(b.path) || a.line - b.line,
      ),
      packageImports: this.packageImports,
      importUnknown: this.importUnknown,
      configurationFiles: [...this.resolver.configurationFiles].sort(),
      unknown: [...this.unknown.values()],
      imports: this.imports,
      edges: memberEdges(this.resolver.files, this.snapshot.members),
      members: this.snapshot.analysisMembers ?? this.snapshot.members,
      serviceIdentifiers: {
        attempted: this.attempts.size,
        unresolved: this.failed.size,
        rate: this.attempts.size === 0 ? 0 : this.failed.size / this.attempts.size,
      },
    }
  }
}
export function extractArchitecture(snapshot: Snapshot): ActualExtraction {
  return new Extractor(snapshot).run()
}
