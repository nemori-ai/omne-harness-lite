import { chmod, readFile, rename, writeFile, stat, mkdir, rm } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { sql } from 'kysely'
import { afterEach, describe, expect, it } from 'vitest'
import { openStorage } from '@omne-harness-lite/storage-sql'
import {
  composeMigrations,
  StorageDefect,
  StorageUnavailable,
  UniqueViolation,
  ReferenceViolation,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import { createModelReplicaCustodian } from '../src/model-replica.ts'
import { replicaMigrations } from '../src/migrations.ts'
import { sealBody, openBody } from '../src/index.ts'
import {
  barrier,
  bodyA,
  bodyB,
  createFixture,
  fixtureReader,
  instant,
  login,
  otherTenant,
  putSentinel,
  refA,
  refB,
  sentinelCount,
  tenant,
} from './support.ts'

const fixtures: Awaited<ReturnType<typeof createFixture>>[] = []
const setup = async () => {
  const f = await createFixture()
  fixtures.push(f)
  return f
}
afterEach(async () => {
  for (const f of fixtures.splice(0)) await f.cleanup()
})

describe('model-only real SQLite/key component (binding reader fixture)', () => {
  it('stores complete row and reopens exact binary body, never plaintext on disk/logs (MCR-V2)', async () => {
    const f = await setup()
    await f.bind(refA)
    const original = Uint8Array.from(bodyA)
    const writing = f.store(refA, original)
    original.fill(0)
    expect(await writing).toEqual({ stored: true, tenant })
    expect(await f.read()).toEqual({ body: bodyA })
    const row = await f.storage.read(
      async tx =>
        (
          await sql<{
            login_state: string
            stored_at: number
            source_ref: string
            sealed_body: Uint8Array
          }>`SELECT tenant_organization,tenant_account,login_state,stored_at,sealed_body,source_ref FROM credential_custodian_replica`.execute(
            tx.db,
          )
        ).rows[0],
    )
    expect(row).toMatchObject({ login_state: login, stored_at: instant, source_ref: refA })
    await f.component.close()
    await f.storage.close()
    for (const path of [f.file, `${f.file}-wal`]) {
      try {
        expect((await readFile(path)).includes(Buffer.from(bodyA))).toBe(false)
      } catch (error) {
        if (
          error === null ||
          typeof error !== 'object' ||
          !('code' in error) ||
          error.code !== 'ENOENT'
        )
          throw error
      }
    }
    const reopened = await openStorage({ dialect: 'sqlite', file: f.file })
    const c = await createModelReplicaCustodian({
      storage: reopened,
      keyFile: f.keyFile,
      clock: f.clock,
      readCredentialBindingIn: fixtureReader(reopened),
      diagnostics: f.diagnostics,
    })
    try {
      expect(await reopened.atomic(u => c.readBoundReplicaIn(u, tenant, refA))).toEqual({
        body: bodyA,
      })
    } finally {
      await c.close()
      await reopened.close()
    }
    expect(JSON.stringify(f.events)).not.toContain(refA)
    expect(JSON.stringify(f.events)).not.toContain(new TextDecoder().decode(bodyA))
  })

  it('rejects late A after B rotation, requires all three refs, and does not alter prior complete row (MCR-V3 fixture)', async () => {
    const f = await setup()
    await f.bind(refA)
    await f.store()
    await f.bind(refB)
    expect(await f.read(refB)).toEqual({ absent: true })
    expect(await f.store()).toEqual({ stored: false })
    expect(await f.store(refB, bodyB)).toEqual({ stored: true, tenant })
    expect(await f.store()).toEqual({ stored: false })
    expect(await f.read(refB)).toEqual({ body: bodyB })
    expect(await f.read(refA)).toEqual({ absent: true })
    await f.storage.write(async tx => {
      await sql`DELETE FROM test_binding`.execute(tx.db)
    })
    expect(await f.read(refB)).toEqual({ absent: true })
    expect(await f.store(refB, bodyB)).toEqual({ stored: false })
    const row = await f.storage.read(
      async tx =>
        (
          await sql<{
            source_ref: string
          }>`SELECT source_ref FROM credential_custodian_replica`.execute(tx.db)
        ).rows[0],
    )
    expect(row?.source_ref).toBe(refB)
  })

  it('rejects source-only tamper, cross-tenant/other-key copies, and old ciphertext pasted with new ref (MCR-V2)', async () => {
    const f = await setup()
    await f.bind(refA)
    await f.bind(refA, otherTenant)
    await f.store()
    await f.storage.write(async tx => {
      await sql`INSERT INTO credential_custodian_replica SELECT ${otherTenant.organization},${otherTenant.account},login_state,stored_at,sealed_body,source_ref FROM credential_custodian_replica WHERE tenant_organization=${tenant.organization}`.execute(
        tx.db,
      )
    })
    expect(await f.read(refA, otherTenant)).toEqual({ absent: true })
    await f.bind(refB)
    await f.storage.write(async tx => {
      await sql`UPDATE credential_custodian_replica SET source_ref=${refB} WHERE tenant_organization=${tenant.organization}`.execute(
        tx.db,
      )
    })
    expect(await f.read(refB)).toEqual({ absent: true })
    const key = await readFile(f.keyFile)
    const legacy = sealBody(key, { kind: 'replica', tenant }, bodyA, randomBytes(12))
    await f.storage.write(async tx => {
      await sql`UPDATE credential_custodian_replica SET sealed_body=${legacy} WHERE tenant_organization=${tenant.organization}`.execute(
        tx.db,
      )
    })
    expect(await f.read(refB)).toEqual({ absent: true })
    await f.store(refB, bodyB)
    await writeFile(f.keyFile, randomBytes(32))
    expect(await f.read(refB)).toEqual({ absent: true })
    expect(f.events.some(e => e.outcome === 'unopenable')).toBe(true)
  })

  it('missing/relative/bad permissions/bad lengths/nonordinary key startup fails without generating (MCR-V5)', async () => {
    const f = await setup()
    const make = (keyFile: string) =>
      createModelReplicaCustodian({
        storage: f.storage,
        clock: f.clock,
        keyFile,
        readCredentialBindingIn: f.reader,
        diagnostics: f.diagnostics,
      })
    const missing = join(f.directory, 'missing')
    await expect(make(missing)).rejects.toBeInstanceOf(StorageUnavailable)
    await expect(stat(missing)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(make('relative')).rejects.toBeInstanceOf(StorageDefect)
    await chmod(f.keyFile, 0o640)
    await expect(make(f.keyFile)).rejects.toBeInstanceOf(StorageUnavailable)
    await chmod(f.keyFile, 0o400)
    await expect(make(f.keyFile)).rejects.toBeInstanceOf(StorageUnavailable)
    await chmod(f.keyFile, 0o600)
    await writeFile(f.keyFile, randomBytes(31))
    await expect(make(f.keyFile)).rejects.toBeInstanceOf(StorageUnavailable)
    const dirKey = join(f.directory, 'directory-key')
    await mkdir(dirKey, { mode: 0o700 })
    await expect(make(dirKey)).rejects.toBeInstanceOf(StorageUnavailable)
  })

  it('representation validation precedes close/key/clock; clock unavailable does not affect reads (MCR-V8)', async () => {
    const f = await setup()
    await f.bind(refA)
    await f.store()
    const calls = f.clockState.calls
    f.clockState.unavailable = true
    expect(await f.read()).toEqual({ body: bodyA })
    expect(f.clockState.calls).toBe(calls)
    expect(await f.store()).toEqual({ failure: 'unavailable' })
    f.clockState.throws = true
    await expect(f.store()).rejects.toMatchObject({
      name: 'StorageDefect',
      message: 'model replica operation defect',
    })
    await f.component.close()
    await rename(f.keyFile, join(f.directory, 'key-away'))
    for (const bad of ['', ' ', '\uFEFFref', 'ref\n']) {
      expect(await f.store(bad)).toEqual({ failure: 'invalidInput' })
    }
    expect(await f.store(refA, Uint8Array.of())).toEqual({ failure: 'invalidInput' })
    expect(await f.store()).toEqual({ failure: 'custodianWithdrawn' })
  })

  it('runtime key failures are unavailable and poison a caught participating read (MCR-V5/V8)', async () => {
    const f = await setup()
    await f.bind(refA)
    await f.store()
    for (const mode of [0o644, 0o400]) {
      await chmod(f.keyFile, mode)
      expect(await f.store()).toEqual({ failure: 'unavailable' })
      await expect(f.read()).rejects.toBeInstanceOf(StorageUnavailable)
    }
    await chmod(f.keyFile, 0o600)
    await writeFile(f.keyFile, randomBytes(5))
    expect(await f.store()).toEqual({ failure: 'unavailable' })
    await expect(
      f.storage.atomic(async unit => {
        await putSentinel(unit)
        try {
          await f.component.readBoundReplicaIn(unit, tenant, refA)
        } catch {
          /* caller deliberately catches */
        }
        return 'attempted-commit'
      }),
    ).rejects.toBeInstanceOf(StorageUnavailable)
    expect(await sentinelCount(f.storage)).toBe(0)
  })
  it('bad login, tenant and body shapes are rejected before key/clock/storage work (MCR-V8)', async () => {
    const f = await setup()
    await rename(f.keyFile, join(f.directory, 'removed-key'))
    const badLogin = { tenant, loginState: '', sourceRef: refA, body: bodyA }
    // @ts-expect-error Deliberately violate the typed identity at the runtime boundary.
    const loginResult = await f.component.storeBoundReplica(badLogin)
    expect(loginResult).toEqual({ failure: 'invalidInput' })
    const missingTenant = { loginState: login, sourceRef: refA, body: bodyA }
    // @ts-expect-error Tenant is required, and cannot be inferred from the component.
    const tenantResult = await f.component.storeBoundReplica(missingTenant)
    expect(tenantResult).toEqual({ failure: 'invalidInput' })
    const stringBody = { tenant, loginState: login, sourceRef: refA, body: 'some-key' }
    // @ts-expect-error A string body must not be interpreted as UTF-8 credentials.
    const bodyResult = await f.component.storeBoundReplica(stringBody)
    expect(bodyResult).toEqual({ failure: 'invalidInput' })
    expect(f.clockState.calls).toBe(0)
    await expect(
      f.storage.atomic(async unit => {
        await putSentinel(unit)
        try {
          // @ts-expect-error Internal tenant is invalid; rejection must occur inside run.
          await f.component.readBoundReplicaIn(unit, { organization: tenant.organization }, refA)
        } catch {}
      }),
    ).rejects.toBeInstanceOf(StorageDefect)
    expect(await sentinelCount(f.storage)).toBe(0)
  })
  it('real SQL unique/reference/defect failures escape run and cannot commit a caught caller (MCR-V8)', async () => {
    const f = await setup()
    await f.storage.write(async tx => {
      await sql`CREATE TABLE test_parent(id INTEGER PRIMARY KEY)`.execute(tx.db)
      await sql`CREATE TABLE test_child(parent INTEGER NOT NULL REFERENCES test_parent(id))`.execute(
        tx.db,
      )
    })
    for (const kind of ['unique', 'reference', 'defect']) {
      const reader = async (unit: StorageUnit) =>
        unit.run(async () => {
          await unit.mutate(async tx => {
            if (kind === 'unique') await sql`INSERT INTO test_sentinel(id) VALUES(1)`.execute(tx.db)
            else if (kind === 'reference')
              await sql`INSERT INTO test_child(parent) VALUES(99)`.execute(tx.db)
            else await sql`INSERT INTO test_missing_table(id) VALUES(1)`.execute(tx.db)
          })
          return { absent: true } as const
        })
      const c = await createModelReplicaCustodian({
        storage: f.storage,
        clock: f.clock,
        keyFile: f.keyFile,
        readCredentialBindingIn: reader,
        diagnostics: f.diagnostics,
      })
      try {
        await expect(
          f.storage.atomic(async unit => {
            await putSentinel(unit)
            try {
              await c.readBoundReplicaIn(unit, tenant, refA)
            } catch {}
          }),
        ).rejects.toBeInstanceOf(
          kind === 'unique'
            ? UniqueViolation
            : kind === 'reference'
              ? ReferenceViolation
              : StorageDefect,
        )
        expect(await sentinelCount(f.storage)).toBe(0)
      } finally {
        await c.close()
      }
    }
  })

  it.each([
    new StorageUnavailable('SECRET-body-ref', { cause: { key: 'SECRET-body-ref' } }),
    new UniqueViolation('unregistered-SECRET-body-ref', { cause: 'SECRET-body-ref' }),
    new ReferenceViolation('missing-target', { cause: 'SECRET-body-ref' }),
    new StorageDefect('SECRET-body-ref', { cause: 'SECRET-body-ref' }),
    new Error('SECRET-body-ref'),
  ])(
    'preserves failure class and rolls back caught participation; store strips values only outside atomic (MCR-V8)',
    async error => {
      const f = await setup()
      await f.bind(refA)
      f.readerState.error = error
      if (error instanceof StorageUnavailable)
        expect(await f.store()).toEqual({ failure: 'unavailable' })
      else {
        try {
          await f.store()
          throw new Error('expected reject')
        } catch (safe) {
          expect(safe).toBeInstanceOf(
            error instanceof Error &&
              !(
                error instanceof StorageDefect ||
                error instanceof UniqueViolation ||
                error instanceof ReferenceViolation
              )
              ? StorageDefect
              : error.constructor,
          )
          expect(String(safe)).not.toContain('SECRET')
          expect(safe).not.toHaveProperty('cause')
        }
      }
      await expect(
        f.storage.atomic(async unit => {
          await putSentinel(unit)
          try {
            await f.component.readBoundReplicaIn(unit, tenant, refA)
          } catch {
            /* not a recoverable statement error */
          }
        }),
      ).rejects.toBe(error)
      expect(await sentinelCount(f.storage)).toBe(0)
      expect(JSON.stringify(f.events)).not.toContain('SECRET')
    },
  )

  it('invalid reader output/persistent row are defects, not unavailable/absent (MCR-V8)', async () => {
    const f = await setup()
    await f.bind(refA)
    await f.store()
    f.readerState.malformed = true
    await expect(f.store()).rejects.toBeInstanceOf(StorageDefect)
    await expect(f.read()).rejects.toBeInstanceOf(StorageDefect)
    f.readerState.malformed = false
    await f.storage.write(async tx => {
      await sql`UPDATE credential_custodian_replica SET login_state=''`.execute(tx.db)
    })
    await expect(f.read()).rejects.toBeInstanceOf(StorageDefect)
  })

  it('wrong instance/closed/inactive/overlapping units are rejected, caught misuse cannot commit sentinel (MCR-V8)', async () => {
    const f = await setup()
    const other = await setup()
    await f.bind(refA)
    await f.store()
    await expect(
      other.storage.atomic(async unit => {
        await putSentinel(unit)
        try {
          await f.component.readBoundReplicaIn(unit, tenant, refA)
        } catch {}
      }),
    ).rejects.toBeInstanceOf(StorageDefect)
    expect(await sentinelCount(other.storage)).toBe(0)
    let ended: StorageUnit | undefined
    await f.storage.atomic(async unit => {
      ended = unit
    })
    if (ended === undefined) throw new Error('unit absent')
    await expect(f.component.readBoundReplicaIn(ended, tenant, refA)).rejects.toBeInstanceOf(
      StorageDefect,
    )
    const delayed = Promise.withResolvers<Promise<unknown>>()
    await expect(
      f.storage.atomic(async unit => {
        await putSentinel(unit)
        await unit.run(async () => {
          setImmediate(() => delayed.resolve(f.component.readBoundReplicaIn(unit, tenant, refA)))
        })
        await delayed.promise.catch(() => undefined)
      }),
    ).rejects.toBeInstanceOf(StorageDefect)
    expect(await sentinelCount(f.storage)).toBe(0)
    const gate = barrier()
    f.readerState.hold = gate.hold
    f.readerState.entered = gate.entered
    await expect(
      f.storage.atomic(async unit => {
        await putSentinel(unit)
        const first = f.component.readBoundReplicaIn(unit, tenant, refA)
        await gate.reached
        try {
          await f.component.readBoundReplicaIn(unit, tenant, refA)
        } catch {}
        gate.release()
        await first.catch(() => undefined)
      }),
    ).rejects.toBeInstanceOf(StorageDefect)
    expect(await sentinelCount(f.storage)).toBe(0)
  })

  it('invalid technical tenant/ref inside run poisons caller unit, including after close (MCR-V8)', async () => {
    const f = await setup()
    await f.component.close()
    await expect(
      f.storage.atomic(async unit => {
        await putSentinel(unit)
        try {
          await f.component.readBoundReplicaIn(unit, tenant, '')
        } catch {}
      }),
    ).rejects.toBeInstanceOf(StorageDefect)
    expect(await sentinelCount(f.storage)).toBe(0)
    await expect(f.read()).rejects.toBeInstanceOf(StorageUnavailable)
  })

  it('close repeats same drain, blocks new work, waits actual in-flight store/read and preserves borrowed storage/key (MCR-V6)', async () => {
    const f = await setup()
    await f.bind(refA)
    const gate = barrier()
    f.readerState.hold = gate.hold
    f.readerState.entered = gate.entered
    const writing = f.store()
    await gate.reached
    const closing = f.component.close()
    expect(f.component.close()).toBe(closing)
    let closed = false
    const watchedClose = closing.then(() => {
      closed = true
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(closed).toBe(false)
    expect(await f.store()).toEqual({ failure: 'custodianWithdrawn' })
    gate.release()
    expect(await writing).toEqual({ stored: true, tenant })
    await watchedClose
    expect(closed).toBe(true)
    expect((await stat(f.keyFile)).size).toBe(32)
    expect(
      await f.storage.read(
        async tx =>
          (
            await sql<{
              n: number
            }>`SELECT count(*) AS n FROM credential_custodian_replica`.execute(tx.db)
          ).rows[0]?.n,
      ),
    ).toBe(1)
    expect(f.events.findIndex(e => e.operation === 'store' && e.phase === 'unit')).toBeLessThan(
      f.events.findIndex(e => e.outcome === 'closed'),
    )
  })

  it('close owns the read participation, while an outer unit continues under its owner (MCR-V6)', async () => {
    const f = await setup()
    await f.bind(refA)
    await f.store()
    const gate = barrier()
    const outer = barrier()
    f.readerState.hold = gate.hold
    f.readerState.entered = gate.entered
    let finished = false
    const reading = f.storage.atomic(async unit => {
      const value = await f.component.readBoundReplicaIn(unit, tenant, refA)
      outer.entered()
      await outer.hold
      finished = true
      return value
    })
    await gate.reached
    const closing = f.component.close()
    let drained = false
    const watched = closing.then(() => {
      drained = true
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(drained).toBe(false)
    gate.release()
    await outer.reached
    await watched
    expect(finished).toBe(false)
    outer.release()
    expect(await reading).toEqual({ body: bodyA })
  })
  it('later close cannot overwrite an already failed atomic with custodianWithdrawn (rev2 failure table)', async () => {
    const f = await setup()
    await f.bind(refA)
    const escaped = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const atomic = f.storage.atomic.bind(f.storage)
    f.storage.atomic = async fn => {
      try {
        return await atomic(fn)
      } catch (error) {
        if (error instanceof StorageUnavailable) {
          escaped.resolve()
          await release.promise
        }
        throw error
      }
    }
    f.readerState.error = new StorageUnavailable('injected before close with secret-value cause', {
      cause: bodyA,
    })
    const writing = f.store()
    await escaped.promise // The real SQLite unit has already rolled back; only error delivery is gated.
    let drained = false
    const closing = f.component.close().then(() => {
      drained = true
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(drained).toBe(false)
    release.resolve()
    expect(await writing).toEqual({ failure: 'unavailable' })
    await closing
    expect(
      await f.storage.read(
        async tx =>
          (
            await sql<{
              n: number
            }>`SELECT count(*) AS n FROM credential_custodian_replica`.execute(tx.db)
          ).rows[0]?.n,
      ),
    ).toBe(0)
    expect(JSON.stringify(f.events)).not.toContain('secret-value')
  })

  it('diagnostic sink failure is reported without changing stored/absent outcomes (MCR-V5)', async () => {
    const f = await setup()
    let faults = 0
    const c = await createModelReplicaCustodian({
      storage: f.storage,
      keyFile: f.keyFile,
      clock: f.clock,
      readCredentialBindingIn: f.reader,
      diagnostics: {
        record() {
          throw new Error('secret-log-error')
        },
        sinkFailure() {
          faults++
        },
      },
    })
    try {
      expect(
        await c.storeBoundReplica({ tenant, loginState: login, sourceRef: refA, body: bodyA }),
      ).toEqual({ stored: false })
      await f.bind(refA)
      expect(
        await c.storeBoundReplica({ tenant, loginState: login, sourceRef: refA, body: bodyA }),
      ).toEqual({ stored: true, tenant })
      expect(faults).toBeGreaterThan(0)
    } finally {
      await c.close()
    }
  })
  it('two real connections to the same SQLite file order rotation after the actual locked binding read (MCR-V4 fixture)', async () => {
    const f = await setup()
    await f.bind(refA)
    const connection = await openStorage({ dialect: 'sqlite', file: f.file })
    const gate = barrier()
    const lockedReader = async (unit: StorageUnit, t: typeof tenant) => {
      const binding = await fixtureReader(f.storage)(unit, t)
      gate.entered()
      await gate.hold
      return binding
    }
    const c = await createModelReplicaCustodian({
      storage: f.storage,
      keyFile: f.keyFile,
      clock: f.clock,
      readCredentialBindingIn: lockedReader,
      diagnostics: f.diagnostics,
    })
    try {
      const writing = c.storeBoundReplica({
        tenant,
        loginState: login,
        sourceRef: refA,
        body: bodyA,
      })
      await gate.reached
      let rotationEntered = false
      const rotating = connection.write(async tx => {
        rotationEntered = true
        await tx.lockRow('test_binding', {
          organization: tenant.organization,
          account: tenant.account,
        })
        await sql`UPDATE test_binding SET ref=${refB}`.execute(tx.db)
      })
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(rotationEntered).toBe(false)
      gate.release()
      expect(await writing).toEqual({ stored: true, tenant })
      await rotating
      expect(await f.read(refB)).toEqual({ absent: true })
      expect(await f.store()).toEqual({ stored: false })
      expect(await f.store(refB, bodyB)).toEqual({ stored: true, tenant })
      expect(await f.read(refB)).toEqual({ body: bodyB })
    } finally {
      gate.release()
      await c.close()
      await connection.close()
    }
  })
})

describe('migration and source-format compatibility, not generic operation coverage (MCR-V1 scoped)', () => {
  it('upgrade adds NULL to old rows without rewriting body/login/time; format can be read with its stored source', async () => {
    const f = await setup()
    const oldFile = join(f.directory, 'old.sqlite')
    const base = replicaMigrations[0]
    if (base === undefined) throw new Error('base migration missing')
    const old = await openStorage({
      dialect: 'sqlite',
      file: oldFile,
      migrations: composeMigrations([base]),
      upgrade: false,
    })
    const key = await readFile(f.keyFile)
    const legacy = sealBody(key, { kind: 'replica', tenant }, bodyA, randomBytes(12))
    await old.write(async tx => {
      await sql`INSERT INTO credential_custodian_replica(tenant_organization,tenant_account,login_state,stored_at,sealed_body) VALUES(${tenant.organization},${tenant.account},${login},${instant},${legacy})`.execute(
        tx.db,
      )
    })
    await old.close()
    const migrated = await openStorage({
      dialect: 'sqlite',
      file: oldFile,
      migrations: composeMigrations(replicaMigrations),
      upgrade: false,
    })
    try {
      const row = await migrated.read(
        async tx =>
          (
            await sql<{
              login_state: string
              stored_at: number
              sealed_body: Uint8Array
              source_ref: string | null
            }>`SELECT tenant_organization,tenant_account,login_state,stored_at,sealed_body,source_ref FROM credential_custodian_replica`.execute(
              tx.db,
            )
          ).rows[0],
      )
      expect(row).toMatchObject({ login_state: login, stored_at: instant, source_ref: null })
      expect(row?.sealed_body).toEqual(legacy)
      if (row === undefined) throw new Error('old row missing')
      expect(openBody(key, { kind: 'replica', tenant }, row.sealed_body)).toEqual({ body: bodyA })
      expect(openBody(key, { kind: 'replica', tenant, sourceRef: refA }, row.sealed_body)).toEqual({
        unopenable: true,
      })
    } finally {
      await migrated.close()
    }
    const bound = sealBody(
      key,
      { kind: 'replica', tenant, sourceRef: refA },
      bodyA,
      randomBytes(12),
    )
    expect(openBody(key, { kind: 'replica', tenant, sourceRef: refA }, bound)).toEqual({
      body: bodyA,
    })
    await rm(oldFile)
  })
})
