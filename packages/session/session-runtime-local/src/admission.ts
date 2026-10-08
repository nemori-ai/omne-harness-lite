import { randomUUID } from 'node:crypto'
import {
  narrow,
  StorageUnavailable,
  type AtomicStorage,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import {
  isOk,
  parseTenantId,
  tenantIdEquals,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import {
  AdmissionFailure,
  type AdmissionConsumption,
  type AdmissionGuard,
  type AdmissionPolicy,
  type AdmissionProbe,
  type AdmissionReading,
  type AdmissionSource,
  type AdmissionTarget,
  type AdmissionTicket,
  type LocalAdmission,
} from './admission-types.ts'
import {
  bounded,
  checkedPolicy,
  checkedSource,
  checkedTarget,
  checkedTicket,
  requestKey,
  sourceKey,
  memberKey,
  memberBinding,
} from './admission-values.ts'
import {
  count,
  login,
  meta,
  parseTarget,
  reading,
  recordedUse,
  saveUse,
  memberAllowed,
  queueReady,
  decisionState,
  settleMember,
  settleLogin,
  type AdmissionDb,
} from './admission-sql.ts'

interface GuardBinding {
  readonly unit: StorageUnit
  readonly source: AdmissionSource
  readonly tenant: TenantId
}
type Decision = Awaited<ReturnType<AdmissionProbe['verify']>>
/** Trusted bootstrap factory. The caller composes both migration sets and owns the borrowed ports. */
export async function createLocalAdmission(
  storage: AtomicStorage,
  probe: AdmissionProbe,
  policy: AdmissionPolicy,
): Promise<LocalAdmission> {
  const valid = checkedPolicy(policy)
  if (typeof probe?.verify !== 'function') throw new AdmissionFailure('invalid-input')
  await storage.read(meta)
  return new AdmissionOwner(storage, probe, valid)
}
class AdmissionOwner implements LocalAdmission {
  readonly #guards = new WeakMap<AdmissionGuard, GuardBinding>()
  readonly #jobs = new Set<Promise<unknown>>()
  readonly #results = new Map<string, { ticket: AdmissionTicket; decision: Decision }>()
  readonly #lost = new Set<string>()
  #stopped = false
  #closing: Promise<void> | undefined
  constructor(
    readonly storage: AtomicStorage,
    readonly probe: AdmissionProbe,
    readonly policy: AdmissionPolicy,
  ) {}
  #work<T>(run: () => Promise<T>): Promise<T> {
    if (this.#stopped) return Promise.reject(new AdmissionFailure('closed'))
    const job = run()
    this.#jobs.add(job)
    void job.then(
      () => this.#jobs.delete(job),
      () => this.#jobs.delete(job),
    )
    return job
  }
  reserve = (source: AdmissionSource, target: AdmissionTarget): Promise<AdmissionReading> =>
    this.#work(async () => {
      const originalSource = checkedSource(source)
      const originalTarget = checkedTarget(target, originalSource)
      bounded(JSON.stringify({ source: originalSource, target: originalTarget }), this.policy)
      return this.storage.atomic(unit =>
        unit.run(async () => {
          unit.assertStorage(this.storage)
          return unit.mutate(async tx => {
            const head = await meta(tx)
            const current = await login(tx, originalSource)
            if (current?.state === 'rejected') throw new AdmissionFailure('denied')
            const key = requestKey(originalSource, originalTarget)
            const db = narrow<AdmissionDb>(tx)
            const existing = await db
              .selectFrom('sr_admission_ticket')
              .selectAll()
              .where('request_key', '=', key)
              .executeTakeFirst()
            if (existing) {
              const ticket = {
                root: head.root,
                id: existing.id,
                sequence: existing.sequence,
                source: originalSource,
                target: originalTarget,
              }
              return reading(tx, ticket, this.policy)
            }
            await this.#capacity(tx, current !== undefined)
            if (!current)
              await db
                .insertInto('sr_admission_login')
                .values({
                  key: sourceKey(originalSource),
                  source: JSON.stringify(originalSource),
                  state: 'checking',
                })
                .execute()
            const member =
              originalTarget.purpose === 'createSession'
                ? memberKey(originalSource, originalTarget.tenant)
                : null
            if (member !== null) await this.#registerMember(tx, originalSource, originalTarget)
            const sequence = (BigInt(head.sequence) + 1n).toString()
            const ticket = checkedTicket(
              {
                root: head.root,
                id: randomUUID(),
                sequence,
                source: originalSource,
                target: originalTarget,
              },
              this.policy,
            )
            await db
              .updateTable('sr_admission_meta')
              .set({ sequence })
              .where('slot', '=', 1)
              .execute()
            await db
              .insertInto('sr_admission_ticket')
              .values({
                id: ticket.id,
                login_key: sourceKey(originalSource),
                member_key: member,
                request_key: key,
                sequence,
                sequence_length: sequence.length,
                target: JSON.stringify(originalTarget),
                state: 'waiting',
              })
              .execute()
            return { ticket, state: 'waiting' }
          })
        }),
      )
    })
  async #registerMember(
    tx: Parameters<typeof count>[0],
    source: AdmissionSource,
    target: AdmissionTarget,
  ): Promise<void> {
    const key = memberKey(source, target.tenant),
      db = narrow<AdmissionDb>(tx)
    const row = await db
      .selectFrom('sr_admission_member')
      .selectAll()
      .where('key', '=', key)
      .executeTakeFirst()
    if (!row)
      await db
        .insertInto('sr_admission_member')
        .values({ key, binding: memberBinding(source, target.tenant), state: 'checking' })
        .execute()
    else if (
      row.binding !== memberBinding(source, target.tenant) ||
      !['checking', 'allowed', 'rejected'].includes(row.state)
    )
      throw new AdmissionFailure('invalid-record')
  }
  async #capacity(tx: Parameters<typeof count>[0], hasLogin: boolean): Promise<void> {
    if ((await count(tx, 'sr_admission_ticket')) >= this.policy.maxTickets)
      throw new AdmissionFailure('capacity')
    if (!hasLogin && (await count(tx, 'sr_admission_login')) >= this.policy.maxLogins)
      throw new AdmissionFailure('capacity')
  }
  read = (ticket: AdmissionTicket): Promise<AdmissionReading> =>
    this.#work(() =>
      this.storage.read(tx => reading(tx, checkedTicket(ticket, this.policy), this.policy)),
    )
  query = (ticket: AdmissionTicket): Promise<AdmissionReading> =>
    this.#work(async () => {
      const original = checkedTicket(ticket, this.policy)
      const held = this.#results.get(original.id)
      if (held) {
        await this.#settle(held.ticket, held.decision)
        return this.storage.read(tx => reading(tx, original, this.policy))
      }
      const claimed = await this.#claim(original)
      if (!claimed.owned) return claimed.reading
      this.#lost.add(original.id)
      const decision = await this.probe.verify(original.source, original.target)
      this.#checkDecision(original, decision)
      const copy: Decision = Object.freeze({ kind: decision.kind })
      this.#results.set(original.id, { ticket: original, decision: copy })
      this.#lost.delete(original.id)
      await this.#settle(original, copy)
      return this.storage.read(tx => reading(tx, original, this.policy))
    })
  #checkDecision(ticket: AdmissionTicket, decision: Decision): void {
    const allowed =
      ticket.target.purpose === 'createSession'
        ? ['memberValid', 'memberRejected', 'rejected', 'unavailable']
        : ['valid', 'rejected', 'unavailable']
    if (!decision || !allowed.includes(decision.kind)) throw new AdmissionFailure('invalid-input')
  }
  async #claim(ticket: AdmissionTicket) {
    return this.storage.atomic(unit =>
      unit.run(() =>
        unit.mutate(async tx => {
          unit.assertStorage(this.storage)
          const current = await reading(tx, ticket, this.policy)
          if (current.state !== 'waiting') return { owned: false, reading: current }
          const owner = await login(tx, ticket.source)
          const db = narrow<AdmissionDb>(tx)
          if (owner?.state === 'rejected') {
            await db
              .updateTable('sr_admission_ticket')
              .set({ state: 'rejected' })
              .where('id', '=', ticket.id)
              .execute()
            return { owned: false, reading: { ticket, state: 'rejected' as const } }
          }
          if (!(await queueReady(tx, 'login_key', sourceKey(ticket.source), ticket)))
            return { owned: false, reading: current }
          if (
            ticket.target.purpose === 'createSession' &&
            !(await queueReady(
              tx,
              'member_key',
              memberKey(ticket.source, ticket.target.tenant),
              ticket,
            ))
          )
            return { owned: false, reading: current }
          await db
            .updateTable('sr_admission_ticket')
            .set({ state: 'querying' })
            .where('id', '=', ticket.id)
            .execute()
          await db
            .updateTable('sr_admission_login')
            .set({ state: 'checking' })
            .where('key', '=', sourceKey(ticket.source))
            .execute()
          return { owned: true, reading: { ticket, state: 'querying' as const } }
        }),
      ),
    )
  }
  async #settle(ticket: AdmissionTicket, decision: Decision): Promise<void> {
    await this.storage.atomic(unit =>
      unit.run(() =>
        unit.mutate(async tx => {
          unit.assertStorage(this.storage)
          const current = await reading(tx, ticket, this.policy)
          const expected = decisionState(decision)
          if (current.state === expected) return
          if (current.state !== 'querying') throw new AdmissionFailure('invalid-record')
          const owner = await login(tx, ticket.source)
          const db = narrow<AdmissionDb>(tx)
          const rejected = decision.kind === 'rejected' || owner?.state === 'rejected'
          await db
            .updateTable('sr_admission_ticket')
            .set({ state: rejected ? 'rejected' : expected })
            .where('id', '=', ticket.id)
            .execute()
          await settleLogin(tx, ticket, decision, rejected)
          await settleMember(tx, ticket, decision)
        }),
      ),
    )
    this.#results.delete(ticket.id)
  }
  consume = (
    ticket: AdmissionTicket,
    tenantStorage: AtomicStorage,
    stage: (unit: StorageUnit, guard: AdmissionGuard) => Promise<string>,
  ): Promise<AdmissionConsumption> =>
    this.#work(async () => {
      const original = checkedTicket(ticket, this.policy)
      this.#separate(tenantStorage)
      try {
        const result = await this.storage.atomic(rootUnit =>
          rootUnit.run(() =>
            rootUnit.query(async tx => {
              rootUnit.assertStorage(this.storage)
              const current = await reading(tx, original, this.policy)
              if (current.state !== 'ready' && current.state !== 'consumed')
                return { kind: 'blocked' as const, state: current.state }
              if (!(await memberAllowed(tx, original.source, original.target.tenant)))
                throw new AdmissionFailure('denied')
              const owner = await login(tx, original.source)
              if (current.state === 'ready' && owner?.state !== 'allowed')
                throw new AdmissionFailure('denied')
              const receipt = await this.#consumeTenant(
                original,
                tenantStorage,
                current.state,
                stage,
              )
              return { kind: 'consumed' as const, receipt }
            }),
          ),
        )
        if (result.kind === 'consumed') await this.#consumed(original)
        return result
      } catch (error) {
        if (error instanceof StorageUnavailable) return { kind: 'unknownCommit', ticket: original }
        throw error
      }
    })
  async #consumeTenant(
    ticket: AdmissionTicket,
    storage: AtomicStorage,
    state: 'ready' | 'consumed',
    stage: (unit: StorageUnit, guard: AdmissionGuard) => Promise<string>,
  ): Promise<string> {
    return storage.atomic(unit =>
      unit.run(async () => {
        unit.assertStorage(storage)
        const saved = await recordedUse(unit, ticket, this.policy)
        if (saved !== undefined) return saved
        if (state === 'consumed') throw new AdmissionFailure('invalid-record')
        return this.#guard(unit, ticket.source, ticket.target.tenant, async guard => {
          const value = await stage(unit, guard)
          await saveUse(unit, ticket, value, this.policy)
          return value
        })
      }),
    )
  }
  abandon: LocalAdmission['abandon'] = (ticket, tenantStorage) =>
    this.#work(async () => {
      const original = checkedTicket(ticket, this.policy)
      this.#separate(tenantStorage)
      try {
        const result = await this.storage.atomic(rootUnit =>
          rootUnit.run(async () => {
            rootUnit.assertStorage(this.storage)
            const current = await rootUnit.query(tx => reading(tx, original, this.policy))
            if (current.state === 'notUsed') return { kind: 'notUsed' as const }
            if (current.state !== 'ready' && current.state !== 'consumed')
              return { kind: 'blocked' as const, state: current.state }
            const receipt = await tenantStorage.atomic(unit =>
              unit.run(async () => {
                unit.assertStorage(tenantStorage)
                return recordedUse(unit, original, this.policy)
              }),
            )
            if (receipt !== undefined) return { kind: 'consumed' as const, receipt }
            if (current.state === 'consumed') throw new AdmissionFailure('invalid-record')
            // All trusted consumption holds this same root order until the actual tenant transaction ends.
            // No earlier owner can still stage; a later owner must observe this terminal state.
            await rootUnit.mutate(tx =>
              narrow<AdmissionDb>(tx)
                .updateTable('sr_admission_ticket')
                .set({ state: 'notUsed' })
                .where('id', '=', original.id)
                .execute(),
            )
            return { kind: 'notUsed' as const }
          }),
        )
        if (result.kind === 'consumed') await this.#consumed(original)
        return result
      } catch (error) {
        if (error instanceof StorageUnavailable) return { kind: 'unknownCommit', ticket: original }
        throw error
      }
    })
  async #consumed(ticket: AdmissionTicket): Promise<void> {
    await this.storage.atomic(unit =>
      unit.run(() =>
        unit.mutate(async tx => {
          unit.assertStorage(this.storage)
          const current = await reading(tx, ticket, this.policy)
          if (current.state === 'consumed') return
          if (current.state !== 'ready') throw new AdmissionFailure('invalid-record')
          await narrow<AdmissionDb>(tx)
            .updateTable('sr_admission_ticket')
            .set({ state: 'consumed' })
            .where('id', '=', ticket.id)
            .execute()
        }),
      ),
    )
  }
  #separate(storage: AtomicStorage): void {
    if (storage === this.storage) throw new AdmissionFailure('invalid-input')
  }
  async #guard<T>(
    unit: StorageUnit,
    source: AdmissionSource,
    tenant: TenantId,
    stage: (guard: AdmissionGuard) => Promise<T>,
  ): Promise<T> {
    const guard = Object.freeze({}) as AdmissionGuard
    this.#guards.set(guard, { unit, source, tenant })
    try {
      return await stage(guard)
    } finally {
      this.#guards.delete(guard)
    }
  }
  withCurrent: LocalAdmission['withCurrent'] = (source, tenant, tenantStorage, stage) =>
    this.#work(() => this.#withGuard(source, tenant, tenantStorage, stage, true))
  withMember: LocalAdmission['withMember'] = (source, tenant, tenantStorage, stage) =>
    this.#work(() => this.#withGuard(source, tenant, tenantStorage, stage, false))
  async #withGuard<T>(
    source: AdmissionSource,
    tenant: TenantId,
    tenantStorage: AtomicStorage,
    stage: (unit: StorageUnit, guard: AdmissionGuard) => Promise<T>,
    requireLogin: boolean,
  ): Promise<T> {
    const original = checkedSource(source)
    const scope = parseTenantId(tenant)
    if (!isOk(scope) || scope.ok.account !== original.accountId)
      throw new AdmissionFailure('invalid-input')
    this.#separate(tenantStorage)
    return this.storage.atomic(rootUnit =>
      rootUnit.run(() =>
        rootUnit.query(async tx => {
          rootUnit.assertStorage(this.storage)
          if (requireLogin && (await login(tx, original))?.state !== 'allowed')
            throw new AdmissionFailure('denied')
          if (!(await memberAllowed(tx, original, scope.ok))) throw new AdmissionFailure('denied')
          return tenantStorage.atomic(unit =>
            unit.run(() => {
              unit.assertStorage(tenantStorage)
              return this.#guard(unit, original, scope.ok, guard => stage(unit, guard))
            }),
          )
        }),
      ),
    )
  }
  authorizeIn = (
    unit: StorageUnit,
    guard: AdmissionGuard,
    source: AdmissionSource,
    tenant: TenantId,
  ): boolean => {
    const binding = this.#guards.get(guard)
    if (!binding || binding.unit !== unit) return false
    try {
      return (
        JSON.stringify(checkedSource(source)) === JSON.stringify(binding.source) &&
        tenantIdEquals(binding.tenant, tenant)
      )
    } catch {
      return false
    }
  }
  close = (): Promise<void> => {
    this.#stopped = true
    if (this.#closing) return this.#closing
    const closing = this.#drain()
    this.#closing = closing
    void closing.catch(() => {
      if (this.#closing === closing) this.#closing = undefined
    })
    return closing
  }
  async #drain(): Promise<void> {
    await Promise.allSettled([...this.#jobs])
    for (const value of [...this.#results.values()])
      await this.#settle(value.ticket, value.decision)
    if (this.#lost.size > 0) throw new AdmissionFailure('pending-result')
  }
}
