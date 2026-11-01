// 入口对象用例的共用夹具：手工的 `EntryEnv`（受信名经 `createTrust` 的标签隔离）、两个铸好的租户，
// 以及在一个上下文上安装入口对象模块的捷径。用例经公开入口（服务键、模块的 `install`）调用，不读模块内部。
import { Context } from '@deepseek-ai/cordis'
import type { ActingForTenantPrincipal, Principal, SystemPrincipal } from '@omne-harness/identity'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import { createTrust, type Trust } from '../../src/trust.ts'
import type { EntryEnv, EntryObjectModule, ServiceName } from '../../src/types.ts'

function parsed<T>(result: { ok: true; value: T } | { ok: false }, what: string): T {
  if (!result.ok) throw new Error(`fixture ${what} did not parse`)
  return result.value
}

/** `ctx.get(键)` 的结果必须在场：不在场是夹具错误，不是被测行为。 */
export function got<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`fixture: ${what} is not provided on this context`)
  return value
}

function isSystemPrincipal(value: unknown): value is SystemPrincipal {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'system' &&
    'component' in value &&
    typeof value.component === 'string'
  )
}

function isActingPrincipal(value: unknown): value is ActingForTenantPrincipal {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'acting-for-tenant' &&
    'actor' in value &&
    isSystemPrincipal(value.actor) &&
    'tenant' in value &&
    'work' in value
  )
}

/** 服务键上读到的值按 identity 的主体形状核对后才当主体用；核对的是形状，来源仍由核验器判。 */
export function principalOf(value: unknown): Principal {
  if (isSystemPrincipal(value) || isActingPrincipal(value)) return value
  throw new Error('fixture: the value is not a principal')
}

/** `Outcome` 的成功值；失败是夹具错误。 */
export function okOf<T, F>(outcome: { ok: T } | { failure: F }, what: string): T {
  if ('failure' in outcome)
    throw new Error(`fixture: ${what} failed: ${JSON.stringify(outcome.failure)}`)
  return outcome.ok
}

export function fixtureTenant(label: 'a' | 'b' | 'c'): TenantId {
  const suffix = {
    a: 'abcdefghjkmnpqrstvwxyz2345',
    b: 'bcdefghjkmnpqrstvwxyz23456',
    c: 'cdefghjkmnpqrstvwxyz234567',
  }[label]
  return tenant(
    parsed(organizationCodec.parse(`org_${suffix}`), 'organization'),
    parsed(accountCodec.parse(`acc_${suffix}`), 'account'),
  )
}

export type FixtureEnv = Readonly<{
  root: Context
  trust: Trust
  env: EntryEnv
  /** 一个受信名的隔离上下文：入口自己读它，提供者也在它上面提供。 */
  scopeOf(name: ServiceName): Context
  install(module: EntryObjectModule): Promise<void>
}>

/** DP1-C17 的 `once`：同一符号第二次以不同的 `create` 调用时抛出。与 `src/run.ts` 的规则相同。 */
function onceTable(): EntryEnv['once'] {
  const made = new Map<symbol, { create: () => unknown; value: unknown }>()
  return <T>(key: symbol, create: () => T): T => {
    const hit = made.get(key)
    if (hit === undefined) {
      const value = create()
      made.set(key, { create, value })
      return value
    }
    if (hit.create !== create) throw new Error(`fixture once: ${String(key)} made twice`)
    return hit.value as T
  }
}

/** 一个运行的入口环境。`trusted` 是本用例要隔离的受信名；不在其中的名字 `readTrusted` 抛出，与真实 `Trust` 相同。 */
export function fixtureEnv(
  trusted: readonly ServiceName[],
  stateRoot = 'fixture-state-root',
): FixtureEnv {
  const root = new Context()
  const trust = createTrust(
    trusted.map(name => ({ id: name, names: [name] })),
    new Map(),
  )
  const env: EntryEnv = {
    stateRoot,
    readTrusted: name => trust.contextForName(root, name),
    once: onceTable(),
  }
  const scopeOf = (name: ServiceName): Context =>
    trust.isTrusted(name) ? trust.contextForName(root, name) : root
  return {
    root,
    trust,
    env,
    scopeOf,
    install: async module => {
      await module.install(scopeOf(module.name), env)
    },
  }
}

/** 一个对象图里出现过的全部自有属性值（含原型链），用来断言某个引用没有被持有（N-2 的写法）。 */
export function heldValues(start: unknown): Set<unknown> {
  const seen = new Set<unknown>()
  const queue: unknown[] = [start]
  const visited = new Set<object>()
  while (queue.length > 0) {
    const current = queue.pop()
    if (typeof current !== 'object' && typeof current !== 'function') continue
    if (current === null || visited.has(current)) continue
    visited.add(current)
    for (let o: object | null = current; o !== null; o = Object.getPrototypeOf(o)) {
      for (const key of Reflect.ownKeys(o)) {
        const descriptor = Object.getOwnPropertyDescriptor(o, key)
        if (descriptor === undefined) continue
        for (const value of [descriptor.value, descriptor.get, descriptor.set]) {
          if (value === undefined) continue
          seen.add(value)
          queue.push(value)
        }
      }
    }
  }
  return seen
}
