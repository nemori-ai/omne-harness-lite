import { fail, succeed } from '@omne-harness/operation-result'
import type { Adoption } from '@omne-harness/tool-contract'
import type {
  CallAccess,
  ToolMaterialRef,
  ToolMaterialStore,
} from '@omne-harness/tool-contract/provider'
import { checkChunkBound, type SqlToolOutputCustodyOptions } from './options.ts'
import {
  canonicalValue,
  decodeMaterialObservation,
  decodeMaterialPage,
  evidenceOf,
  materialSnapshot,
  snapshotWriteMetadata,
} from './material-values.ts'
import { materialIO, materialUnavailable, materialConflict } from './material-io.ts'
import { resolveTenant } from './tenant.ts'
import { preserveMaterial, eraseMaterial } from './material-mutations.ts'

export type SqlToolMaterialStoreOptions = SqlToolOutputCustodyOptions &
  Readonly<{ provider: Adoption }>

export function createSqlToolMaterialStore<P>(
  options: SqlToolMaterialStoreOptions,
): ToolMaterialStore<P> {
  const chunkBytes = checkChunkBound(options)
  const provider = canonicalValue(options.provider)
  if ('failure' in provider) throw new TypeError('invalid material provider adoption')
  const providerKey = provider.ok.text
  const io = materialIO({ ...options, combination: { ...options.combination } })
  const locate = async (input: CallAccess<P> & Readonly<{ material: ToolMaterialRef }>) => {
    const fixed = materialSnapshot(input.material)
    if ('failure' in fixed) return fixed
    const adoption = canonicalValue(fixed.ok.material.provider)
    if ('failure' in adoption) return adoption
    if (adoption.ok.text !== providerKey)
      return materialUnavailable('material belongs to another provider adoption')
    const call = input.call
    const resolved = await resolveTenant(options, input.tenant)
    return resolved.kind === 'ready'
      ? succeed({
          ...fixed.ok,
          at: resolved.at,
          address: { tenant: resolved.at.tenant, call, material: fixed.ok.key },
        })
      : materialUnavailable(resolved.diagnostic)
  }
  const write: ToolMaterialStore<P>['write'] = async input => {
    if (!(input.bytes instanceof Uint8Array))
      return fail({ kind: 'invalid', field: 'bytes', reason: 'type' })
    const bytes = Uint8Array.from(input.bytes)
    const metadata = snapshotWriteMetadata({ codec: input.codec, source: input.source })
    if ('failure' in metadata) return metadata
    const operation = input.operation
    const located = await locate(input)
    if ('failure' in located) return located
    return preserveMaterial({ ...located.ok, operation, bytes, ...metadata.ok, chunkBytes }, io)
  }

  const inspect: ToolMaterialStore<P>['inspect'] = async input => {
    const operation = input.operation
    const located = await locate(input)
    if ('failure' in located) return located
    const found = await io.read(located.ok.at, { ...located.ok.address, mode: 'inspect' })
    if ('failure' in found) return found
    const decoded = decodeMaterialObservation(found.ok)
    if ('failure' in decoded) return decoded
    const row = decoded.ok
    if (row.kind === 'unknown') return succeed({ kind: 'unknown' })
    if (row.kind === 'excluded') return succeed({ kind: 'excluded', evidence: row.receipt })
    if (row.operation !== operation) return materialConflict(operation)
    if (row.kind === 'pending') return succeed({ kind: 'pending' })
    const ref = materialSnapshot(row.seal.material)
    return 'ok' in ref && ref.ok.key === located.ok.key
      ? succeed({ kind: 'sealed', seal: row.seal })
      : materialUnavailable('invalid material inspection binding')
  }

  const read: ToolMaterialStore<P>['read'] = async input => {
    const offset = Number(input.offset),
      maxBytes = input.maxBytes
    if (!/^(0|[1-9][0-9]*)$/.test(input.offset) || !Number.isSafeInteger(offset))
      return fail({
        kind: 'invalid',
        field: 'offset',
        reason: 'canonical nonnegative integer required',
      })
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
      return fail({ kind: 'invalid', field: 'maxBytes', reason: 'positive safe integer required' })
    const located = await locate(input)
    if ('failure' in located) return located
    const answer = await io.read(located.ok.at, {
      ...located.ok.address,
      mode: 'bytes',
      offset,
      maxBytes,
    })
    if ('failure' in answer) return answer
    return decodeMaterialPage(answer.ok, offset, maxBytes)
  }

  const erase: ToolMaterialStore<P>['erase'] = async input => {
    const authorization = canonicalValue(input.authorization)
    if ('failure' in authorization) return authorization
    const evidence = evidenceOf(authorization.ok.data)
    if (evidence === null)
      return fail({ kind: 'invalid', field: 'authorization', reason: 'evidence required' })
    const operation = input.operation
    const located = await locate(input)
    return 'failure' in located
      ? located
      : eraseMaterial({ ...located.ok, operation, authorization: evidence }, io)
  }

  const inspectErase: ToolMaterialStore<P>['inspectErase'] = async input => {
    const operation = input.operation
    const located = await locate(input)
    if ('failure' in located) return located
    const found = await io.read(located.ok.at, { ...located.ok.address, mode: 'inspect' })
    if ('failure' in found) return found
    const decoded = decodeMaterialObservation(found.ok)
    if ('failure' in decoded) return decoded
    const row = decoded.ok
    if (row.kind !== 'excluded') return succeed({ kind: 'unknown' })
    if (row.operation !== operation) return materialConflict(operation)
    return row.deleted
      ? succeed({ kind: 'deleted', receipt: row.receipt })
      : succeed({ kind: 'pending' })
  }

  return { write, inspect, read, erase, inspectErase }
}
