import { createHash } from 'node:crypto'
import {
  tenantCodec,
  workspaceCodec,
  type Access,
  type WorkspaceId,
} from '@omne-harness/legal-identity'
import type {
  Answer,
  Inspection,
  Json,
  ManagementType,
  Material,
  NotPermitted,
  OperationId,
  Recognised,
  TypeAnswer,
} from '@omne-harness/workspace-contract'
import type { WorkspaceAction, WorkspaceAuthority } from './ports.ts'
import type { ScriptResult } from './transactions/script.ts'
import type { StoreAnswer } from './store.ts'

export const NOT_PERMITTED: NotPermitted = Object.freeze({ kind: 'not-permitted' })

export type Unavailable = Readonly<{ kind: 'unavailable'; diagnostic: string }>
export const unavailable = (diagnostic: string): Unavailable => ({
  kind: 'unavailable',
  diagnostic,
})
export type Blocked = NotPermitted | Unavailable

/** The tenant as the stored facts name it. A tenant that was not parsed is not a tenant. */
export function tenantText<P>(access: Access<P>): string | null {
  const encoded = tenantCodec.encode(access.tenant)
  return encoded.ok ? encoded.value : null
}

export function workspaceText(workspace: WorkspaceId): string | null {
  const encoded = workspaceCodec.encode(workspace)
  return encoded.ok ? encoded.value : null
}

/**
 * The first step of every operation: is this tenant still a member, and is the action admitted.
 * A source that fails to answer is `unavailable`; it is never read as yes or as no.
 */
export async function admitted<P>(
  authority: WorkspaceAuthority<P>,
  access: Access<P>,
  action: WorkspaceAction,
  target: string,
): Promise<Blocked | null> {
  try {
    const standing = await authority.standing(access)
    if (standing === 'unavailable') return unavailable('standing')
    if (standing === 'not-member') return NOT_PERMITTED
    const admission = await authority.admit(access, action, target)
    if (admission === 'unavailable') return unavailable('admission')
    return admission === 'denied' ? NOT_PERMITTED : null
  } catch {
    return unavailable('authority')
  }
}

/** A type that throws could not look. */
export async function recognise(
  type: ManagementType,
  address: string,
): Promise<TypeAnswer<Recognised>> {
  try {
    return await type.recognise(address)
  } catch {
    return { unavailable: 'type' }
  }
}

export async function inspect(
  type: ManagementType,
  material: Material,
): Promise<TypeAnswer<Inspection>> {
  try {
    return await type.inspect(material)
  } catch {
    return { unavailable: 'type' }
  }
}

/** A digest of a value this group built itself, so its members are always written in one order. */
export function digestOf(value: Json): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/** A commit that did not answer: nothing was written, or it is not known whether anything was. */
export function uncommitted(
  answer: Exclude<StoreAnswer<unknown>, { kind: 'committed' }>,
  operation: OperationId,
): Answer<never> {
  return answer.kind === 'unknown' ? { kind: 'unknown', operation } : unavailable('store')
}

/**
 * What a script decided, in the words of the caller. `read` turns the stored value back into
 * the caller's value; `undefined` says the store answered something this group never wrote.
 */
export function decided<S extends Json, T>(
  result: ScriptResult<S>,
  read: (stored: S) => T | undefined,
): Answer<T> {
  if (result.kind !== 'done') return result
  const value = read(result.value)
  return value === undefined
    ? unavailable('stored-value')
    : { kind: 'done', value, changed: result.changed }
}

export function answerOf<S extends Json, T>(
  committed: StoreAnswer<ScriptResult<S>>,
  operation: OperationId,
  read: (stored: S) => T | undefined,
): Answer<T> {
  return committed.kind === 'committed'
    ? decided(committed.value, read)
    : uncommitted(committed, operation)
}
