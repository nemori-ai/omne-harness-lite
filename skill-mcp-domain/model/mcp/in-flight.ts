// MCP 限界上下文：在途表（InFlightCalls）。
// 有状态的内存聚合：键是（租户、主体、关联键），查重与占位是一步。
// 主体用调用方给的相等函数比较（P 对 MCP 不透明）；第一波只在一次运行内保留。

import { fail, succeed, type Outcome, type TenantId } from '../shared.ts'
import type { CorrelationKey, Generation } from './values.ts'

type Entry =
  | Readonly<{ phase: 'reserved'; cancelled: boolean }> // 已占位，正在核对，尚未发出
  | Readonly<{ phase: 'sent'; requestId: string; generation: Generation; abort: AbortController }>
  | Readonly<{ phase: 'ended' }>

export type CancelAnswer = 'signalled' | 'no-call-in-flight' | 'unknown'

export class InFlightCalls<P> {
  readonly #entries = new Map<string, Entry>()
  readonly #principalKey: (principal: P) => string
  readonly #tenantKey: (tenant: TenantId) => string

  constructor(keys: Readonly<{ principal: (principal: P) => string; tenant: (tenant: TenantId) => string }>) {
    this.#principalKey = keys.principal
    this.#tenantKey = keys.tenant
  }

  #key(tenant: TenantId, principal: P, correlation: CorrelationKey): string {
    return JSON.stringify([this.#tenantKey(tenant), this.#principalKey(principal), correlation])
  }

  /** 查重与占位一步完成。已结束的关联键不算重复。 */
  reserve(tenant: TenantId, principal: P, correlation: CorrelationKey): Outcome<void, 'correlation-key-in-use'> {
    const key = this.#key(tenant, principal, correlation)
    const existing = this.#entries.get(key)
    if (existing !== undefined && existing.phase !== 'ended') return fail('correlation-key-in-use')
    this.#entries.set(key, { phase: 'reserved', cancelled: false })
    return succeed(undefined)
  }

  /** 任一核对答「未发出」时撤销占位。 */
  release(tenant: TenantId, principal: P, correlation: CorrelationKey): void {
    const key = this.#key(tenant, principal, correlation)
    if (this.#entries.get(key)?.phase === 'reserved') this.#entries.delete(key)
  }

  /** 发出前若已被取消，不发出（结局是「未发出」，原因 cancelled）。见 README F5。 */
  markSent(
    tenant: TenantId,
    principal: P,
    correlation: CorrelationKey,
    sent: Omit<Extract<Entry, { phase: 'sent' }>, 'phase'>,
  ): Outcome<void, 'cancelled-before-send'> {
    const key = this.#key(tenant, principal, correlation)
    const entry = this.#entries.get(key)
    if (entry?.phase === 'reserved' && entry.cancelled) {
      this.#entries.delete(key)
      return fail('cancelled-before-send')
    }
    this.#entries.set(key, { phase: 'sent', ...sent })
    return succeed(undefined)
  }

  markEnded(tenant: TenantId, principal: P, correlation: CorrelationKey): void {
    this.#entries.set(this.#key(tenant, principal, correlation), { phase: 'ended' })
  }

  /**
   * 只有同一租户、同一主体能取消；不核采用与当前资格（取消只减少效果）。
   * 表里没有这个键时答 unknown：无法区分「从未发出」与「重启前发出」。
   * 代际已换（currentGeneration 不同）也答 unknown。
   */
  cancel(
    tenant: TenantId,
    principal: P,
    correlation: CorrelationKey,
    currentGeneration: (requestGeneration: Generation) => boolean,
  ): Readonly<{ answer: CancelAnswer; requestId?: string }> {
    const entry = this.#entries.get(this.#key(tenant, principal, correlation))
    if (entry === undefined) return { answer: 'unknown' }
    if (entry.phase === 'ended') return { answer: 'no-call-in-flight' }
    if (entry.phase === 'reserved') {
      this.#entries.set(this.#key(tenant, principal, correlation), { phase: 'reserved', cancelled: true })
      return { answer: 'signalled' } // 阻止未发出的动作
    }
    if (!currentGeneration(entry.generation)) return { answer: 'unknown' }
    entry.abort.abort()
    return { answer: 'signalled', requestId: entry.requestId }
  }
}
