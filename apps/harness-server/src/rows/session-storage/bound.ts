// 委派视图的裁定来源（session-contract `SessionDelegatedTransactions` 的契约文字）：绑定自己作答，不再问访问裁定。
// 租户或会话与绑定的目标不同、提交的命令（种类、操作与去掉 `expected` 的 OP-00 摘要）与绑定的命令不同，都答 `denied`。
import { tenantEquals } from '@omne-harness/legal-identity'
import {
  commandDigest,
  type SessionAccessCheck,
  type SessionAccessRequest,
  type SessionCheckedAccess,
  type SessionCommand,
} from '@omne-harness/session-contract'

/** 同一个命令，忽略 `expected`：面操作的 `changed` 重试仍在绑定内。 */
function sameCheckedCommand(left: SessionCommand, right: SessionCommand): boolean {
  const strip = (command: SessionCommand): SessionCommand => {
    const { expected: _expected, ...input } = command.input as Record<string, unknown>
    return { kind: command.kind, input } as SessionCommand
  }
  return (
    left.kind === right.kind &&
    left.input.operation === right.input.operation &&
    commandDigest(strip(left)) === commandDigest(strip(right))
  )
}

export function withinBinding<P>(
  bound: SessionAccessRequest<P>,
  request: SessionAccessRequest<P>,
): boolean {
  if (bound.target.kind !== 'session' || request.target.kind !== 'session') return false
  if (!('tenant' in bound.access) || !('tenant' in request.access)) return false
  if (!tenantEquals(bound.access.tenant, request.access.tenant)) return false
  if (bound.target.session !== request.target.session) return false
  if (!('command' in request.target)) return true
  return (
    'command' in bound.target && sameCheckedCommand(bound.target.command, request.target.command)
  )
}

export function boundAccessCheck<P>(checked: SessionCheckedAccess<P>): SessionAccessCheck<P> {
  return {
    check: request =>
      Promise.resolve(
        withinBinding(checked.request, request)
          ? { kind: 'allowed', evidence: checked.evidence }
          : { kind: 'denied' },
      ),
  }
}
