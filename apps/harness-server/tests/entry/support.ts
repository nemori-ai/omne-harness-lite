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

export function principalOf(value: unknown): Principal {
  if (isSystemPrincipal(value) || isActingPrincipal(value)) return value
  throw new Error('fixture: the value is not a principal')
}

export function okOf<T, F>(outcome: { ok: T } | { failure: F }, what: string): T {
  if ('failure' in outcome)
    throw new Error(`fixture: ${what} failed: ${JSON.stringify(outcome.failure)}`)
  return outcome.ok
}

export function fixtureTenant(label: 'a' | 'b' | 'c' | 'd'): TenantId {
  const suffix = {
    a: 'abcdefghjkmnpqrstvwxyz2345',
    b: 'bcdefghjkmnpqrstvwxyz23456',
    c: 'cdefghjkmnpqrstvwxyz234567',
    d: 'defghjkmnpqrstvwxyz2345678',
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
  scopeOf(name: ServiceName): Context
  install(module: EntryObjectModule): Promise<void>
}>

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

export function heldValues(start: unknown): Set<unknown> {
  const seen = new Set<unknown>()
  const queue: unknown[] = [start]
  const visited = new Set<object>()
  while (queue.length > 0) {
    const current = queue.pop()
    if (typeof current !== 'object' && typeof current !== 'function') continue
    if (current === null || visited.has(current)) continue
    visited.add(current)
    if (current instanceof Context) continue
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
