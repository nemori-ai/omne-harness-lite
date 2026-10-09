import { randomBytes } from 'node:crypto'
import { isAbsolute } from 'node:path'
import {
  isOk,
  parseLoginStateId,
  parseOpaqueIdentifier,
  parseTenantId,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import { instantFromEpochMs } from '@omne-harness-lite/offer-expiry'
import {
  narrow,
  ReferenceViolation,
  StorageDefect,
  StorageUnavailable,
  UniqueViolation,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import { readKeyFile } from './key-file.ts'
import { readReplicaRowIn, type ReplicaTables } from './replica-table.ts'
import { openBody, sealBody } from './sealing.ts'
import type {
  CredentialBindingRead,
  ModelReplicaCustodian,
  ModelReplicaOptions,
  BoundReplicaRead,
  ReplicaObservation,
  StoreBoundReplicaInput,
  StoreBoundReplicaResult,
} from './types.ts'

export type * from './types.ts'

function safeError(error: unknown): Error {
  if (error instanceof StorageUnavailable)
    return new StorageUnavailable('model replica storage unavailable')
  if (error instanceof UniqueViolation)
    return new UniqueViolation(
      error.constraint === 'credential_custodian_replica_pkey' ? error.constraint : 'unregistered',
    )
  if (error instanceof ReferenceViolation) return new ReferenceViolation(error.kind)
  return new StorageDefect('model replica operation defect')
}

function checkedBinding(value: unknown): CredentialBindingRead {
  if (value !== null && typeof value === 'object') {
    if ('absent' in value && value.absent === true && Object.keys(value).length === 1)
      return { absent: true }
    if ('binding' in value && Object.keys(value).length === 1) {
      const binding = value.binding
      if (
        binding !== null &&
        typeof binding === 'object' &&
        Object.keys(binding).length === 2 &&
        'credentialRef' in binding &&
        'boundAt' in binding
      ) {
        const ref = parseOpaqueIdentifier(binding.credentialRef, 'CredentialRef')
        const time = instantFromEpochMs(binding.boundAt)
        if (isOk(ref) && isOk(time)) return { binding: { credentialRef: ref.ok, boundAt: time.ok } }
      }
    }
  }
  throw new StorageDefect('model replica binding reader invalid')
}

function assertUnit(unit: StorageUnit, options: ModelReplicaOptions): void {
  if (
    unit === null ||
    typeof unit !== 'object' ||
    typeof unit.run !== 'function' ||
    typeof unit.assertStorage !== 'function' ||
    typeof unit.query !== 'function' ||
    typeof unit.mutate !== 'function' ||
    typeof unit.afterCommit !== 'function'
  )
    throw new StorageDefect('model replica participation object invalid')
  unit.assertStorage(options.storage)
}

/** D075 restricted model-only component; the assembly owns this single lifetime. */
export async function createModelReplicaCustodian(
  options: ModelReplicaOptions,
): Promise<ModelReplicaCustodian> {
  if (options === null || typeof options !== 'object')
    throw new StorageDefect('model replica configuration invalid')
  if (typeof options.keyFile !== 'string' || !isAbsolute(options.keyFile))
    throw new StorageDefect('model replica configuration keyFile invalid')
  if (
    typeof options.storage?.atomic !== 'function' ||
    typeof options.clock?.now !== 'function' ||
    typeof options.readCredentialBindingIn !== 'function' ||
    typeof options.diagnostics?.record !== 'function' ||
    typeof options.diagnostics?.sinkFailure !== 'function'
  )
    throw new StorageDefect('model replica configuration invalid')
  options = Object.freeze({ ...options })

  const jobs = new Set<Promise<unknown>>()
  let serving = true
  let closing: Promise<void> | undefined
  const reportSinkFailure = () => {
    try {
      options.diagnostics.sinkFailure()
    } catch {
      /* Assembly owns the failed diagnostic channel. */
    }
  }
  const observe = (event: ReplicaObservation) => {
    try {
      const result: unknown = options.diagnostics.record(event)
      if (result !== undefined) {
        reportSinkFailure()
        // A non-void sink violates this synchronous port; still observe any rejection.
        const job = Promise.resolve(result)
          .catch(reportSinkFailure)
          .finally(() => jobs.delete(job))
        jobs.add(job)
      }
    } catch {
      reportSinkFailure()
    }
  }
  const track = <T>(work: () => Promise<T>): Promise<T> => {
    const job = work().finally(() => jobs.delete(job))
    jobs.add(job)
    return job
  }
  let startupPhase: 'key' | 'replica' = 'key'
  try {
    const key = await readKeyFile(options.keyFile)
    key.fill(0)
    startupPhase = 'replica'
    await options.storage.read(async tx => {
      await narrow<ReplicaTables>(tx)
        .selectFrom('credential_custodian_replica')
        .select(['login_state', 'stored_at', 'sealed_body', 'source_ref'])
        .limit(0)
        .execute()
    })
  } catch (error) {
    observe({
      operation: 'start',
      phase: startupPhase,
      outcome: error instanceof StorageUnavailable ? 'unavailable' : 'defect',
    })
    await Promise.allSettled([...jobs])
    if (startupPhase === 'key' && error instanceof StorageUnavailable)
      throw new StorageUnavailable('model replica keyFile unavailable')
    throw safeError(error)
  }
  observe({ operation: 'start', phase: 'admission', outcome: 'ready' })

  function storeBoundReplica(input: StoreBoundReplicaInput): Promise<StoreBoundReplicaResult> {
    const tenant = parseTenantId(input?.tenant)
    const login = parseLoginStateId(input?.loginState)
    const ref = parseOpaqueIdentifier(input?.sourceRef, 'CredentialRef')
    if (
      !isOk(tenant) ||
      !isOk(login) ||
      !isOk(ref) ||
      !(input?.body instanceof Uint8Array) ||
      input.body.byteLength === 0
    ) {
      observe({ operation: 'store', phase: 'admission', outcome: 'invalidInput' })
      return Promise.resolve({ failure: 'invalidInput' })
    }
    if (!serving) {
      observe({ operation: 'store', phase: 'admission', outcome: 'withdrawn', tenant: tenant.ok })
      return Promise.resolve({ failure: 'custodianWithdrawn' })
    }
    const body = Buffer.from(input.body)
    return track(async () => {
      let key: Buffer | undefined
      let sealed: Uint8Array | undefined
      let entered = false
      observe({ operation: 'store', phase: 'admission', outcome: 'accepted', tenant: tenant.ok })
      try {
        key = await readKeyFile(options.keyFile)
        const now = await options.clock.now()
        if (now === 'unavailable') {
          observe({
            operation: 'store',
            phase: 'key',
            outcome: serving ? 'unavailable' : 'withdrawn',
            tenant: tenant.ok,
          })
          return { failure: serving ? 'unavailable' : 'custodianWithdrawn' }
        }
        if (!isOk(instantFromEpochMs(now))) throw new StorageDefect('model replica clock invalid')
        sealed = sealBody(
          key,
          { kind: 'replica', tenant: tenant.ok, sourceRef: ref.ok },
          body,
          randomBytes(12),
        )
        body.fill(0)
        if (!serving) {
          observe({
            operation: 'store',
            phase: 'admission',
            outcome: 'withdrawn',
            tenant: tenant.ok,
          })
          return { failure: 'custodianWithdrawn' }
        }
        const ciphertext = sealed
        const result = await options.storage.atomic(async unit => {
          entered = true
          return unit.run(async (): Promise<StoreBoundReplicaResult> => {
            unit.assertStorage(options.storage)
            const binding = checkedBinding(await options.readCredentialBindingIn(unit, tenant.ok))
            const sourceMatch = 'binding' in binding && binding.binding.credentialRef === ref.ok
            observe({
              operation: 'store',
              phase: 'binding',
              outcome: sourceMatch ? 'accepted' : 'absent',
              tenant: tenant.ok,
              sourceMatch,
            })
            if (!sourceMatch) return { stored: false }
            await unit.mutate(async tx => {
              await narrow<ReplicaTables>(tx)
                .insertInto('credential_custodian_replica')
                .values({
                  tenant_organization: tenant.ok.organization,
                  tenant_account: tenant.ok.account,
                  login_state: login.ok,
                  stored_at: now,
                  sealed_body: ciphertext,
                  source_ref: ref.ok,
                })
                .onConflict(oc =>
                  oc.columns(['tenant_organization', 'tenant_account']).doUpdateSet({
                    login_state: login.ok,
                    stored_at: now,
                    sealed_body: ciphertext,
                    source_ref: ref.ok,
                  }),
                )
                .execute()
            })
            return { stored: true, tenant: tenant.ok }
          })
        })
        observe({
          operation: 'store',
          phase: 'unit',
          outcome: 'stored' in result && result.stored ? 'stored' : 'absent',
          tenant: tenant.ok,
        })
        return result
      } catch (error) {
        observe({
          operation: 'store',
          phase: entered ? 'unit' : 'key',
          outcome: error instanceof StorageUnavailable ? 'unavailable' : 'defect',
          tenant: tenant.ok,
        })
        if (error instanceof StorageUnavailable)
          return { failure: entered || serving ? 'unavailable' : 'custodianWithdrawn' }
        throw safeError(error)
      } finally {
        key?.fill(0)
        body.fill(0)
        sealed?.fill(0)
      }
    })
  }

  async function readBoundReplicaIn(
    unit: StorageUnit,
    tenant: TenantId,
    expectedRef: string,
  ): Promise<BoundReplicaRead> {
    assertUnit(unit, options)
    // Every internal rejection escapes run, so even a catching caller cannot commit its unit.
    return unit.run(async (): Promise<BoundReplicaRead> => {
      const parsedTenant = parseTenantId(tenant)
      const parsedRef = parseOpaqueIdentifier(expectedRef, 'CredentialRef')
      if (!isOk(parsedTenant) || !isOk(parsedRef))
        throw new StorageDefect('model replica read input invalid')
      if (!serving) throw new StorageUnavailable('model replica component withdrawn')
      return track(async (): Promise<BoundReplicaRead> => {
        let key: Buffer | undefined
        observe({
          operation: 'read',
          phase: 'admission',
          outcome: 'accepted',
          tenant: parsedTenant.ok,
        })
        try {
          key = await readKeyFile(options.keyFile)
          const binding = checkedBinding(
            await options.readCredentialBindingIn(unit, parsedTenant.ok),
          )
          const row = await readReplicaRowIn(unit, parsedTenant.ok)
          const sourceMatch =
            'binding' in binding &&
            binding.binding.credentialRef === parsedRef.ok &&
            row?.sourceRef === parsedRef.ok
          observe({
            operation: 'read',
            phase: 'binding',
            outcome: sourceMatch ? 'accepted' : 'absent',
            tenant: parsedTenant.ok,
            sourceMatch,
          })
          if (!sourceMatch || row === undefined) return { absent: true }
          const result = openBody(
            key,
            { kind: 'replica', tenant: parsedTenant.ok, sourceRef: parsedRef.ok },
            row.sealedBody,
          )
          if ('unopenable' in result) {
            observe({
              operation: 'read',
              phase: 'replica',
              outcome: 'unopenable',
              tenant: parsedTenant.ok,
            })
            return { absent: true }
          }
          observe({ operation: 'read', phase: 'replica', outcome: 'body', tenant: parsedTenant.ok })
          return result
        } catch (error) {
          observe({
            operation: 'read',
            phase: 'unit',
            outcome: error instanceof StorageUnavailable ? 'unavailable' : 'defect',
            tenant: parsedTenant.ok,
          })
          throw error
        } finally {
          key?.fill(0)
        }
      })
    })
  }

  function close(): Promise<void> {
    if (closing !== undefined) return closing
    serving = false
    observe({ operation: 'close', phase: 'admission', outcome: 'withdrawn' })
    closing = (async () => {
      await Promise.allSettled([...jobs])
      observe({ operation: 'close', phase: 'drain', outcome: 'closed' })
      await Promise.allSettled([...jobs])
    })()
    return closing
  }
  return { storeBoundReplica, readBoundReplicaIn, close }
}
