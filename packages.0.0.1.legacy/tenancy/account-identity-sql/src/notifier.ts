import type { Context } from '@deepseek-ai/cordis'
import '@omne-harness-lite/account-identity/cordis'
import { describeError, type Diagnostics, type Notifier } from './diagnostics.ts'

/**
 * 提交之后发：`ctx.emit` 同步派发、不等待处理者、丢弃返回值（basis `async-control-not-bail`）。
 * 处理者抛出不得把一次已提交的操作变成异常——事件不是提交的一部分（契约 S-14／S-16／S-38 的「事件」格）；
 * 抛出记一条诊断，不重发。
 */
export function contextNotifier(ctx: Context, diagnostics: Diagnostics): Notifier {
  const guarded = (event: string, send: () => void) => {
    try {
      send()
    } catch (error) {
      diagnostics.warn('event-listener-failed', { event, cause: describeError(error) })
    }
  }
  return {
    accountActivated: payload =>
      guarded('account-identity/account-activated', () =>
        ctx.emit('account-identity/account-activated', payload),
      ),
    loginRevoked: payload =>
      guarded('account-identity/login-revoked', () =>
        ctx.emit('account-identity/login-revoked', payload),
      ),
    accountExpired: payload =>
      guarded('account-identity/account-expired', () =>
        ctx.emit('account-identity/account-expired', payload),
      ),
  }
}
