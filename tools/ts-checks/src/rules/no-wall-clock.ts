import ts from 'typescript'
import { isTestPath, type Rule, type Violation } from '../rule.ts'
import { lineAt } from '../source-text.ts'
import { nodeName, syntaxOf, visitSyntax } from '../syntax.ts'

/**
 * SC-OE-3（offer-expiry 节点）：消费者不得另用墙钟；领域时间只从 clock 服务取。
 * 豁免：`infra/`（clock 的实现是唯一取锚点；storage-sql 用墙钟算锁等待的截止，那不是领域时间）与测试。
 * `new Date(x)` 是转换不是取时，只禁无参的 `new Date()`。
 */
export const noWallClock: Rule = {
  id: 'no-wall-clock',
  source: 'data.offer-expiry v1 S-16/S-17 · offer-expiry 节点 SC-OE-3',
  description:
    'core/ 与 tenancy/ 源码里不得出现 Date.now()、new Date()、performance.now()；时间只从 clock 服务取',
  check(files) {
    const out: Violation[] = []
    for (const file of files) {
      if (
        isTestPath(file.path) ||
        file.path.startsWith('infra/') ||
        file.path === 'frontend/governance-client-operations/src/observation-time.ts'
      )
        continue
      const syntax = syntaxOf(file)
      const aliases = new Map<string, string>()
      const resolve = (node: ts.Expression): string | undefined => {
        if (ts.isIdentifier(node)) return aliases.get(node.text) ?? node.text
        if (ts.isParenthesizedExpression(node)) return resolve(node.expression)
        if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
          const owner = resolve(node.expression)
          const member = ts.isPropertyAccessExpression(node)
            ? node.name.text
            : ts.isStringLiteralLike(node.argumentExpression)
              ? node.argumentExpression.text
              : undefined
          if (owner !== undefined && member !== undefined)
            return owner === 'globalThis' ? member : `${owner}.${member}`
        }
        return undefined
      }
      // 同文件 const 别名与解构；不做跨文件或运行期赋值数据流追踪。
      visitSyntax(syntax, node => {
        if (
          !ts.isVariableDeclaration(node) ||
          node.initializer === undefined ||
          !ts.isVariableDeclarationList(node.parent) ||
          !(node.parent.flags & ts.NodeFlags.Const)
        )
          return
        const value = resolve(node.initializer)
        if (value === undefined) return
        if (ts.isIdentifier(node.name)) aliases.set(node.name.text, value)
        if (ts.isObjectBindingPattern(node.name)) {
          for (const binding of node.name.elements) {
            const member = nodeName(binding.propertyName ?? binding.name)
            if (member !== undefined && ts.isIdentifier(binding.name))
              aliases.set(binding.name.text, `${value}.${member}`)
          }
        }
      })
      visitSyntax(syntax, node => {
        const wallClock =
          (ts.isCallExpression(node) &&
            ['Date.now', 'performance.now'].includes(resolve(node.expression) ?? '')) ||
          (ts.isNewExpression(node) &&
            resolve(node.expression) === 'Date' &&
            (node.arguments?.length ?? 0) === 0)
        if (wallClock)
          out.push({
            rule: this.id,
            path: file.path,
            line: lineAt(file.text, node.getStart(syntax)),
            message: '使用了墙钟；领域时间必须来自 clock 服务（Clock.now()）',
          })
      })
    }
    return out
  },
}
