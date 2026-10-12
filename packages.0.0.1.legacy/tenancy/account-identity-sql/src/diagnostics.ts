// 本包的诊断外观与通知出口。出示物不进任何诊断输出、事件与错误说明（S-45「永不以可读形式保存」、S-46 ②）：
// 这里的参数类型把 `LoginStatePresentation` 排除在外，传进来即编译失败（包内规则 `no-presentation-in-diagnostics`
// 的类型一形，tests/types.spec-d.ts 守）。模板字符串与间接拼接这层看不到——那一半归 W2-C 的 lint 与 S-46 ② 的动态翻查。
import type { LoginStatePresentation } from '@omne-harness-lite/account-identity'
import type { AccountIdentityEvents } from '@omne-harness-lite/account-identity'

/** 出示物品牌 ⇒ `never`；其余原样。与参数类型交叉后，出示物交进来就没有可赋值的类型。 */
export type NotPresentation<T> = T extends LoginStatePresentation ? never : T

export type DiagnosticValue = string | number | boolean | null

/** 结构化诊断：一个稳定的事件名 + 若干字段。字段值只收标量，错误先由调用方收成 `name: message`。 */
export interface Diagnostics {
  warn<const E extends string, const F extends Readonly<Record<string, DiagnosticValue>>>(
    event: E & NotPresentation<E>,
    fields?: F & { readonly [K in keyof F]: NotPresentation<F[K]> },
  ): void
  error<const E extends string, const F extends Readonly<Record<string, DiagnosticValue>>>(
    event: E & NotPresentation<E>,
    fields?: F & { readonly [K in keyof F]: NotPresentation<F[K]> },
  ): void
}

interface LoggerLike {
  warn(format: string, ...args: unknown[]): void
  error(format: string, ...args: unknown[]): void
}

export function loggerDiagnostics(logger: LoggerLike): Diagnostics {
  return {
    warn: (event, fields) => logger.warn('%s %o', event, fields ?? {}),
    error: (event, fields) => logger.error('%s %o', event, fields ?? {}),
  }
}

/** 错误收成诊断字段：只取类型名与说明（存储错误的说明里没有语句参数）。 */
export function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'non-error thrown'
}

/** 本包自己的缺陷：不是失败集合的成员，原样上抛。说明同样经外观收窄，出示物构造不进来。 */
export class AccountIdentityDefect extends Error {
  override readonly name = 'AccountIdentityDefect'
}

export function defect<const M extends string>(
  message: M & NotPresentation<M>,
): AccountIdentityDefect {
  return new AccountIdentityDefect(message)
}

/** 三个通知事件的出口。载荷的每个字段都是品牌标识（AccountId／LoginStateId／LoginIdentifier），出示物赋不进去。 */
export interface Notifier {
  accountActivated(
    payload: Parameters<AccountIdentityEvents['account-identity/account-activated']>[0],
  ): void
  loginRevoked(
    payload: Parameters<AccountIdentityEvents['account-identity/login-revoked']>[0],
  ): void
  accountExpired(
    payload: Parameters<AccountIdentityEvents['account-identity/account-expired']>[0],
  ): void
}
