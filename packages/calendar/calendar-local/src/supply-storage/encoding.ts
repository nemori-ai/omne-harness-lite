import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import { z } from 'zod'
import type { JsonValue, SqlIdentity } from '@omne-harness/sql-contract'
import { DOMAIN, type Write } from './schema.ts'

function scalar(value: JsonValue): void {
  if (typeof value === 'string' && !value.isWellFormed()) throw new Error('Invalid Unicode')
  if (Array.isArray(value)) {
    for (const item of value) scalar(item)
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      scalar(key)
      scalar(item)
    }
  }
}
export function canonical(value: unknown): string {
  const parsed = z.json().parse(value)
  scalar(parsed)
  const encoded = canonicalize(parsed)
  if (encoded === undefined) throw new Error('Expected JSON')
  return encoded
}
export function hash(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
export function digest(value: unknown): string {
  return hash(canonical(value))
}
export function operationRef(address: unknown): string {
  return `calendar-operation:${digest(address)}`
}
export function identity(
  action: Write['action'],
  systemScopeRef: string,
  address: unknown,
): SqlIdentity {
  return {
    scope: { kind: 'system' },
    transactionDomain: DOMAIN,
    protocolVersion: '2',
    operation: `calendar.supply.${action}`,
    operationKey:
      action === 'run.prepare' || action === 'run.complete'
        ? digest(address)
        : digest({ systemScopeRef, address }),
  }
}
export function writeIdentity(input: Write): SqlIdentity {
  switch (input.action) {
    case 'run.prepare':
      return identity(input.action, input.systemScopeRef, input.payload.command.address)
    case 'run.complete':
      return identity(input.action, input.systemScopeRef, input.payload.address)
    case 'probe.record':
      return identity(input.action, input.systemScopeRef, {
        calendarId: input.payload.calendarId,
        operationKey: input.payload.operationKey,
      })
    case 'ack.prepare':
      return identity(input.action, input.systemScopeRef, {
        id: input.payload.id,
        acknowledgementKey: input.payload.acknowledgementKey,
      })
    case 'material.preserve':
      return identity(input.action, input.systemScopeRef, input.payload.reference)
  }
}
export function binding(input: Write) {
  return {
    systemScopeRef: input.systemScopeRef,
    action: input.action,
    payloadDigest: digest(input.payload),
  }
}
export function intent(input: Write) {
  let payload: unknown = input.payload
  if (input.action === 'run.prepare')
    payload = {
      address: input.payload.command.address,
      fingerprint: input.payload.command.expectedFingerprint,
    }
  if (input.action === 'probe.record')
    payload = {
      calendarId: input.payload.calendarId,
      operationKey: input.payload.operationKey,
      fingerprint: input.payload.fingerprint,
    }
  if (input.action === 'run.complete') {
    const { completedAt: _time, ...result } = input.payload
    payload = result
  }
  return {
    action: input.action,
    systemScopeRef: input.systemScopeRef,
    intentDigest: digest(payload),
  }
}
