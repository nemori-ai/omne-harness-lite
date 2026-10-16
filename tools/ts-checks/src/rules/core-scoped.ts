import ts from '@typescript/typescript6'
import { productSourceIn } from '../layout.ts'
import type { Rule, SourceFile, Violation } from '../core/rule.ts'
import { lineAt } from '../core/source-text.ts'
import { nodeName, syntaxOf, visitSyntax } from '../core/syntax.ts'

export interface CoreFunctionTarget {
  readonly path: string
  readonly functionName: string
}

type BodyFunction = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression

function functionName(node: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(node)) return nodeName(node.name)
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    ts.isVariableDeclaration(node.parent)
  )
    return nodeName(node.parent.name)
  return undefined
}

function findFunction(file: SourceFile, name: string): BodyFunction | undefined {
  let found: BodyFunction | undefined
  visitSyntax(syntaxOf(file), node => {
    if (
      functionName(node) === name &&
      (ts.isFunctionDeclaration(node) ||
        ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node)) &&
      node.body !== undefined
    )
      found = node
  })
  return found
}

function problem(rule: string, file: SourceFile, node: ts.Node, message: string): Violation {
  return { rule, path: file.path, line: lineAt(file.text, node.getStart(syntaxOf(file))), message }
}

/** 注册的锚点消失必须失败；不会把空注册表作为消费者的符合性证据。 */
function targetFunction(rule: string, files: readonly SourceFile[], target: CoreFunctionTarget) {
  const file = files.find(value => value.path === target.path)
  const fn = file === undefined ? undefined : findFunction(file, target.functionName)
  const missing: Violation[] =
    file !== undefined && fn !== undefined
      ? []
      : [{ rule, path: target.path, line: 1, message: `缺少登记函数 ${target.functionName}` }]
  return { file, fn, missing }
}

/** 同文件具名 import 和 const 标识符别名；不声称解析跨文件闭包或动态成员。 */
function localNames(file: SourceFile): Map<string, string> {
  const names = new Map<string, string>()
  visitSyntax(syntaxOf(file), node => {
    if (ts.isImportSpecifier(node))
      names.set(node.name.text, node.propertyName?.text ?? node.name.text)
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      ts.isIdentifier(node.initializer)
    )
      names.set(node.name.text, names.get(node.initializer.text) ?? node.initializer.text)
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      (ts.isPropertyAccessExpression(node.initializer) ||
        ts.isElementAccessExpression(node.initializer))
    ) {
      const member = calledName(node.initializer, names)
      const object = node.initializer.expression
      if (member !== undefined && ts.isIdentifier(object))
        names.set(node.name.text, `${names.get(object.text) ?? object.text}.${member}`)
    }
  })
  return names
}

function calledName(
  expression: ts.Expression,
  names: ReadonlyMap<string, string>,
): string | undefined {
  if (ts.isIdentifier(expression)) return names.get(expression.text) ?? expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  if (
    ts.isElementAccessExpression(expression) &&
    ts.isStringLiteralLike(expression.argumentExpression)
  )
    return expression.argumentExpression.text
  return undefined
}

export interface BodyProjectionTarget extends CoreFunctionTarget {
  /** 按已经接受的正文签名逐参数登记；MCP 的第二参为显式动作副本。 */
  readonly parameterTypes: readonly string[]
}

/** 仅检查已经点名的推出模块：类型 import 与明确正文参数，不能扩成整个包禁值 import。 */
export function createBodyProjectionInputs(targets: readonly BodyProjectionTarget[]): Rule {
  if (targets.length === 0) throw new TypeError('body-projection-inputs 需要非空实际范围')
  return {
    id: 'body-projection-inputs',
    source:
      'data.asset-model/v1 S-12/S-25/SC-6 · data.tool-definition/v1 S-31 · data.loop-extension/v1 S-40 · data.skill-package/v1 SC-4 · data.mcp-endpoint/v1 S-14～S-17/SC-2 · data.slash-command/v1 S-11/SC-6',
    description: '登记的正文推出模块只导入类型、接明确正文及批准动作副本，不读宿主全局',
    check(files) {
      const out: Violation[] = []
      const inspectedModules = new Set<string>()
      for (const target of targets) {
        const { file, fn, missing } = targetFunction(this.id, files, target)
        out.push(...missing)
        if (file === undefined || fn === undefined) continue
        const names = localNames(file)
        if (fn.parameters.length !== target.parameterTypes.length)
          out.push(problem(this.id, file, fn, '推出函数参数数量与登记的正文／动作副本不符'))
        for (const [index, parameter] of fn.parameters.entries()) {
          const type = parameter.type
          const actual =
            type !== undefined && ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)
              ? (names.get(type.typeName.text) ?? type.typeName.text)
              : undefined
          if (parameter.dotDotDotToken !== undefined || actual !== target.parameterTypes[index])
            out.push(
              problem(this.id, file, parameter, '推出函数参数必须是登记的显式正文／动作类型'),
            )
        }
        if (inspectedModules.has(file.path)) continue
        inspectedModules.add(file.path)
        visitSyntax(syntaxOf(file), node => {
          if (ts.isImportDeclaration(node)) {
            const clause = node.importClause
            const bindings = clause?.namedBindings
            const typeOnly =
              clause?.isTypeOnly === true ||
              (clause?.name === undefined &&
                bindings !== undefined &&
                ts.isNamedImports(bindings) &&
                bindings.elements.length > 0 &&
                bindings.elements.every(value => value.isTypeOnly))
            if (!typeOnly) out.push(problem(this.id, file, node, '推出模块只能导入正文相关类型'))
          } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
            const exports = node.exportClause
            const typeOnly =
              node.isTypeOnly ||
              (exports !== undefined &&
                ts.isNamedExports(exports) &&
                exports.elements.length > 0 &&
                exports.elements.every(value => value.isTypeOnly))
            if (!typeOnly) out.push(problem(this.id, file, node, '推出模块不能重导出运行时依赖'))
          } else if (
            ts.isImportEqualsDeclaration(node) ||
            (ts.isCallExpression(node) &&
              (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                calledName(node.expression, names) === 'require'))
          )
            out.push(problem(this.id, file, node, '推出模块不能动态读取模块'))
          else if (node.kind === ts.SyntaxKind.ThisKeyword)
            out.push(problem(this.id, file, node, '推出模块不能从隐式 this 读取状态'))
          else if (
            ts.isIdentifier(node) &&
            [
              'process',
              'globalThis',
              'global',
              'Deno',
              'Bun',
              'fetch',
              'setTimeout',
              'setInterval',
            ].includes(node.text) &&
            !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) &&
            !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)
          )
            out.push(problem(this.id, file, node, `推出模块不能读取宿主全局 ${node.text}`))
        })
      }
      return out
    },
  }
}

export interface ParameterCacheTarget extends CoreFunctionTarget {
  /** 限定动态作者 Schema 模块中的实际构造器，不是全仓 Map/Set 禁令。 */
  readonly constructors: readonly string[]
  readonly factories: readonly string[]
}

/** 这里只查分配点归属；回收/独立性/编译次数仍需调用方对象的行为证据。 */
export function createParameterJudgeCacheOwner(target: ParameterCacheTarget): Rule {
  return {
    id: 'parameter-judge-cache-owner',
    source: 'tool-definition design「编译产物归判定对象」 · D-040 M50',
    description: '动态作者 Schema 模块的编译器／缓存必须在 createParameterJudge 的词法作用域分配',
    check(files) {
      const { file, fn, missing } = targetFunction(this.id, files, target)
      if (file === undefined || fn === undefined) return missing
      const out: Violation[] = []
      const names = localNames(file)
      visitSyntax(syntaxOf(file), node => {
        const allocation =
          (ts.isNewExpression(node) &&
            target.constructors.includes(calledName(node.expression, names) ?? '')) ||
          (ts.isCallExpression(node) &&
            target.factories.includes(calledName(node.expression, names) ?? ''))
        if (!allocation) return
        let current: ts.Node | undefined = node
        while (current !== undefined && current !== fn) current = current.parent
        if (current !== fn)
          out.push(problem(this.id, file, node, '作者 Schema 编译器／缓存分配在调用方判定对象之外'))
      })
      return out
    },
  }
}

export interface ToolArgumentParserInputs {
  /** 应登记实际需要禁止重解析的函数；通用 JSON 读写不属于这里。 */
  readonly rawTargets: readonly CoreFunctionTarget[]
  readonly closeTarget: CoreFunctionTarget
  readonly streamPrefix: string
}

function parserKind(
  expression: ts.Expression,
  names: ReadonlyMap<string, string>,
): string | undefined {
  const name = calledName(expression, names)
  if (name === 'readJsonStrict') return 'readJsonStrict'
  if (name?.endsWith('.readJsonStrict')) return 'readJsonStrict'
  if (name === 'JSON.parse') return name
  if (
    name === 'parse' &&
    (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) &&
    ts.isIdentifier(expression.expression) &&
    (names.get(expression.expression.text) ?? expression.expression.text) === 'JSON'
  )
    return 'JSON.parse'
  return undefined
}

export interface ModelToolNameOriginTarget extends CoreFunctionTarget {
  /** 真正消费 ToolName/ModelToolName 的参数绑定；不是按任意字符串变量名推断。 */
  readonly nameParameters: readonly string[]
}

/** 规范转换函数不应登记成来源判断消费者；这条规则只查具名名字参数的局部操作。 */
export function createModelToolNameOrigin(targets: readonly ModelToolNameOriginTarget[]): Rule {
  if (targets.length === 0) throw new TypeError('model-tool-name-origin 需要非空实际消费者')
  return {
    id: 'model-tool-name-origin',
    source: 'data.tool-definition/v1 S-18 · verification V-10',
    description: '登记的 ToolName/ModelToolName 消费者不以名字的前缀、分隔符或切片推来源',
    check(files) {
      const out: Violation[] = []
      for (const target of targets) {
        const { file, fn, missing } = targetFunction(this.id, files, target)
        out.push(...missing)
        if (file === undefined || fn === undefined) continue
        const protectedNames = new Set(target.nameParameters)
        for (const name of protectedNames)
          if (!fn.parameters.some(parameter => nodeName(parameter.name) === name))
            out.push(problem(this.id, file, fn, `缺少登记名字参数 ${name}`))
        visitSyntax(fn, node => {
          if (
            ts.isVariableDeclaration(node) &&
            ts.isIdentifier(node.name) &&
            node.initializer !== undefined &&
            ts.isIdentifier(node.initializer) &&
            protectedNames.has(node.initializer.text)
          )
            protectedNames.add(node.name.text)
          if (
            ts.isCallExpression(node) &&
            (ts.isPropertyAccessExpression(node.expression) ||
              ts.isElementAccessExpression(node.expression)) &&
            ts.isIdentifier(node.expression.expression) &&
            protectedNames.has(node.expression.expression.text) &&
            [
              'split',
              'indexOf',
              'lastIndexOf',
              'startsWith',
              'endsWith',
              'includes',
              'slice',
              'substring',
              'substr',
              'match',
              'search',
            ].includes(calledName(node.expression, localNames(file)) ?? '')
          )
            out.push(problem(this.id, file, node, '登记名字参数不能按前缀、分隔符或切片推来源'))
          if (
            ts.isElementAccessExpression(node) &&
            ts.isIdentifier(node.expression) &&
            protectedNames.has(node.expression.text) &&
            !(ts.isCallExpression(node.parent) && node.parent.expression === node)
          )
            out.push(problem(this.id, file, node, '登记名字参数不能按字符位置推来源'))
        })
      }
      return out
    },
  }
}

/** 只在具名消息次序消费者查 createdAt；表示层的 RFC3339 校验和原样记录不在此范围。 */
export function createMessageCreatedAtOrder(targets: readonly CoreFunctionTarget[]): Rule {
  if (targets.length === 0) throw new TypeError('message-createdAt-order 需要非空实际消费者')
  return {
    id: 'message-createdAt-order',
    source: 'data.messages/v1 S-4 · verification SC-3',
    description: '登记的消息次序函数不得对 createdAt 做先后比较或排序',
    check(files) {
      const out: Violation[] = []
      for (const target of targets) {
        const { file, fn, missing } = targetFunction(this.id, files, target)
        out.push(...missing)
        if (file === undefined || fn === undefined) continue
        const aliases = new Set<string>()
        const readsCreatedAt = (node: ts.Node): boolean => {
          let found = false
          visitSyntax(node, child => {
            if (
              (ts.isIdentifier(child) && aliases.has(child.text)) ||
              (ts.isPropertyAccessExpression(child) && child.name.text === 'createdAt') ||
              (ts.isElementAccessExpression(child) &&
                ts.isStringLiteralLike(child.argumentExpression) &&
                child.argumentExpression.text === 'createdAt')
            )
              found = true
          })
          return found
        }
        visitSyntax(fn, node => {
          if (
            ts.isVariableDeclaration(node) &&
            ts.isIdentifier(node.name) &&
            node.initializer !== undefined &&
            readsCreatedAt(node.initializer)
          )
            aliases.add(node.name.text)
          if (
            ts.isBinaryExpression(node) &&
            [
              ts.SyntaxKind.LessThanToken,
              ts.SyntaxKind.LessThanEqualsToken,
              ts.SyntaxKind.GreaterThanToken,
              ts.SyntaxKind.GreaterThanEqualsToken,
              ts.SyntaxKind.MinusToken,
            ].includes(node.operatorToken.kind) &&
            (readsCreatedAt(node.left) || readsCreatedAt(node.right))
          )
            out.push(problem(this.id, file, node, '消息次序不能由 createdAt 的比较或差值得出'))
          if (ts.isCallExpression(node)) {
            const name = calledName(node.expression, localNames(file))
            if (['sort', 'toSorted', 'localeCompare'].includes(name ?? '') && readsCreatedAt(node))
              out.push(problem(this.id, file, node, '消息次序不能按 createdAt 排序'))
          }
        })
      }
      return out
    },
  }
}

/** 解析点计数是结构证据；“只在接受 close”仍由状态与调用次数行为测试核实。 */
export function createSingleToolArgumentParser(inputs: ToolArgumentParserInputs): Rule {
  return {
    id: 'single-tool-argument-parser',
    source:
      'capability.stream-assembly/v2 S-10/SC-1 · data.arrival-events/v2 SC-1 · data.content-blocks/v2 SC-2',
    description: 'stream 的严格参数解析恰一处且在登记封口函数，登记 raw 消费者禁止重解析',
    check(files) {
      const out: Violation[] = []
      const {
        file: closeFile,
        fn: closeFn,
        missing,
      } = targetFunction(this.id, files, inputs.closeTarget)
      out.push(...missing)
      let strictCalls = 0
      for (const file of files) {
        if (!productSourceIn(file.path, inputs.streamPrefix)) continue
        const names = localNames(file)
        visitSyntax(syntaxOf(file), node => {
          if (!ts.isCallExpression(node)) return
          const kind = parserKind(node.expression, names)
          if (kind === undefined) return
          let current: ts.Node | undefined = node
          while (current !== undefined && current !== closeFn) current = current.parent
          if (kind !== 'readJsonStrict' || file !== closeFile || current !== closeFn)
            out.push(problem(this.id, file, node, '参数解析只允许登记封口函数中的严格 JSON 读入'))
          else strictCalls++
        })
      }
      if (closeFile !== undefined && closeFn !== undefined && strictCalls !== 1)
        out.push(
          problem(
            this.id,
            closeFile,
            closeFn,
            `登记封口函数严格解析调用点应恰一处，实际 ${strictCalls}`,
          ),
        )
      for (const target of inputs.rawTargets) {
        const { file, fn, missing } = targetFunction(this.id, files, target)
        out.push(...missing)
        if (file === undefined || fn === undefined) continue
        const names = localNames(file)
        visitSyntax(fn, node => {
          if (ts.isCallExpression(node) && parserKind(node.expression, names) !== undefined)
            out.push(
              problem(this.id, file, node, '登记 raw 消费函数只能传递原文，不能解析工具参数'),
            )
        })
      }
      return out
    },
  }
}

/** 已由主调度点名且源码存在的五类正文模块；没有源码的正文不登记占位锚点。 */
export const CORE_BODY_PROJECTION_TARGETS: readonly BodyProjectionTarget[] = Object.freeze([
  Object.freeze({
    path: 'core/tool-definition/src/declarations.ts',
    functionName: 'toolAttributeDeclarations',
    parameterTypes: Object.freeze(['ToolDefinition']),
  }),
  Object.freeze({
    path: 'core/tool-definition/src/declarations.ts',
    functionName: 'toolReferences',
    parameterTypes: Object.freeze(['ToolDefinition']),
  }),
  Object.freeze({
    path: 'core/loop-extension/src/declarations.ts',
    functionName: 'loopExtensionAttributeDeclarations',
    parameterTypes: Object.freeze(['LoopExtensionDefinition']),
  }),
  Object.freeze({
    path: 'core/loop-extension/src/declarations.ts',
    functionName: 'loopExtensionReferences',
    parameterTypes: Object.freeze(['LoopExtensionDefinition']),
  }),
  Object.freeze({
    path: 'core/skill-package/src/declarations.ts',
    functionName: 'skillAttributeDeclarations',
    parameterTypes: Object.freeze(['SkillPackage']),
  }),
  Object.freeze({
    path: 'core/skill-package/src/declarations.ts',
    functionName: 'skillReferences',
    parameterTypes: Object.freeze(['SkillPackage']),
  }),
  Object.freeze({
    path: 'core/mcp-endpoint/src/declarations.ts',
    functionName: 'deriveMcpDeclarations',
    parameterTypes: Object.freeze(['McpEndpoint', 'ActionSnapshot']),
  }),
  Object.freeze({
    path: 'core/slash-command/src/declarations.ts',
    functionName: 'slashCommandAttributeDeclarations',
    parameterTypes: Object.freeze(['SlashCommandDefinition']),
  }),
  Object.freeze({
    path: 'core/slash-command/src/declarations.ts',
    functionName: 'slashCommandReferences',
    parameterTypes: Object.freeze(['SlashCommandDefinition']),
  }),
])

export const CORE_PARAMETER_CACHE_TARGET: ParameterCacheTarget = Object.freeze({
  path: 'core/tool-definition/src/parameters.ts',
  functionName: 'createParameterJudge',
  constructors: Object.freeze(['Map', 'WeakMap', 'Ajv']),
  factories: Object.freeze(['createSchemaRuntime']),
})

/** 主调度点名的实现锚点；只有实际包出现时登记到默认扫描，缺席保留覆盖缺口。 */
export const CORE_TOOL_ARGUMENT_PARSER_INPUTS: ToolArgumentParserInputs = Object.freeze({
  streamPrefix: 'core/stream-assembly/src/',
  closeTarget: Object.freeze({
    path: 'core/stream-assembly/src/close.ts',
    functionName: 'parseCollectedToolCall',
  }),
  rawTargets: Object.freeze([
    Object.freeze({
      path: 'core/stream-assembly/src/close.ts',
      functionName: 'incompleteToolCall',
    }),
  ]),
})

/** 包尚不存在是覆盖缺口；包一旦存在，登记模块或函数丢失不能静默通过。 */
function whenPackageExists(prefix: string, rule: Rule): Rule {
  return {
    ...rule,
    check(files) {
      return files.some(file => productSourceIn(file.path, prefix)) ? rule.check(files) : []
    },
  }
}

const registeredBodyInputs = createBodyProjectionInputs(CORE_BODY_PROJECTION_TARGETS)

export const bodyProjectionInputs: Rule = {
  ...registeredBodyInputs,
  check(files) {
    const presentTargets = CORE_BODY_PROJECTION_TARGETS.filter(target => {
      const sourcePrefix = target.path.slice(0, target.path.indexOf('/src/') + '/src/'.length)
      return files.some(file => productSourceIn(file.path, sourcePrefix))
    })
    return presentTargets.length === 0
      ? []
      : createBodyProjectionInputs(presentTargets).check(files)
  },
}

export const parameterJudgeCacheOwner: Rule = whenPackageExists(
  'core/tool-definition/src/',
  createParameterJudgeCacheOwner(CORE_PARAMETER_CACHE_TARGET),
)

export const singleToolArgumentParser: Rule = whenPackageExists(
  CORE_TOOL_ARGUMENT_PARSER_INPUTS.streamPrefix,
  createSingleToolArgumentParser(CORE_TOOL_ARGUMENT_PARSER_INPUTS),
)
