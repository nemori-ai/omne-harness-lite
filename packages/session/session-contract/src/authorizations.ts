import type { DurableEvidence } from './identity.ts'

/** The work position an action is taken at; a once authorization names exactly one. */
export type AuthorizationConsumer = Readonly<{ owner: string; work: string; position: string }>

export type AuthorizationScope =
  | Readonly<{
      kind: 'once'
      consumer: AuthorizationConsumer
      target: string
      argumentsDigest: string
    }>
  /** The gate is named as a permission assignment names it: a capability and its enforcement key. */
  | Readonly<{ kind: 'session'; capabilityId: string; enforcementKey: string; basis: string }>

/** What a person said about authorizing: Session keeps and reduces it, Authorization interprets it. */
export type AuthorizationExpression = Readonly<{
  scope: AuthorizationScope
  direction: 'grant' | 'revoke'
  source: DurableEvidence
}>

type Scoped<K extends AuthorizationScope['kind']> = Omit<
  Extract<AuthorizationScope, { kind: K }>,
  'kind'
> &
  Readonly<{ source: DurableEvidence }>
export type OnceAuthorization = Scoped<'once'>
export type SessionAuthorization = Scoped<'session'>

/** The authorizations in force now; the log keeps every expression. */
export type AuthorizationContext = Readonly<{
  revision: string
  once: readonly OnceAuthorization[]
  session: readonly SessionAuthorization[]
}>

export const EMPTY_AUTHORIZATIONS: AuthorizationContext = Object.freeze({
  revision: '0',
  once: Object.freeze([]),
  session: Object.freeze([]),
})

const filled = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const evidenceIn = (value: DurableEvidence): boolean =>
  [value.owner, value.record, value.revision, value.digest].every(filled)

/** The first field an expression lacks, or null when it is complete. */
export function incompleteAuthorization(expression: AuthorizationExpression): string | null {
  const { scope } = expression
  if (expression.direction !== 'grant' && expression.direction !== 'revoke') return 'direction'
  if (!evidenceIn(expression.source)) return 'source'
  if (scope.kind === 'session')
    return [scope.capabilityId, scope.enforcementKey, scope.basis].every(filled) ? null : 'scope'
  const { consumer } = scope
  return [
    consumer.owner,
    consumer.work,
    consumer.position,
    scope.target,
    scope.argumentsDigest,
  ].every(filled)
    ? null
    : 'scope'
}

const sameConsumer = (a: AuthorizationConsumer, b: AuthorizationConsumer): boolean =>
  a.owner === b.owner && a.work === b.work && a.position === b.position
const next = (context: AuthorizationContext): string => String(BigInt(context.revision) + 1n)

export function reduceAuthorizations(
  context: AuthorizationContext,
  expression: AuthorizationExpression,
): AuthorizationContext {
  const { scope, direction, source } = expression
  if (scope.kind === 'once') {
    const { kind: _kind, ...row } = scope
    const others = context.once.filter(item => !sameConsumer(item.consumer, scope.consumer))
    const once = direction === 'grant' ? [...others, { ...row, source }] : others
    return { ...context, revision: next(context), once }
  }
  const { kind: _kind, ...row } = scope
  const others = context.session.filter(
    item =>
      item.capabilityId !== scope.capabilityId || item.enforcementKey !== scope.enforcementKey,
  )
  const session = direction === 'grant' ? [...others, { ...row, source }] : others
  return { ...context, revision: next(context), session }
}

/** A Run that ended holds no once authorization: its actions start no more. The log keeps them. */
export function retireOnce(context: AuthorizationContext): AuthorizationContext {
  return context.once.length === 0 ? context : { ...context, revision: next(context), once: [] }
}

export function onceAuthorizationOf(
  context: AuthorizationContext,
  consumer: AuthorizationConsumer,
): OnceAuthorization | undefined {
  return context.once.find(item => sameConsumer(item.consumer, consumer))
}
