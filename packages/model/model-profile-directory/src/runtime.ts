import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  parseMembershipStandingResult,
  parseScopeLayerIdentity,
  parseTenantId,
  type ScopeLayerIdentity,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import {
  judgeModelProfileDocument,
  type ModelProfile,
  type ModelProfileRef,
} from '@omne-harness-lite/model-profile'
import { instantToRfc3339, type Clock } from '@omne-harness-lite/offer-expiry'
import {
  ReferenceViolation,
  StorageDefect,
  StorageUnavailable,
  UniqueViolation,
  type AtomicStorage,
  type WriteTx,
} from '@omne-harness-lite/storage'
import { contentEqual, jsonEqual, upstreamEqual } from './equality.ts'
import {
  invalid,
  isRef,
  jsonObject,
  object,
  parseContent,
  parseManifest,
  parsePatch,
  parseRef,
} from './input.ts'
import {
  configEligibility,
  credentialSlot,
  manifestDisposition,
  sameWriter,
  scopeChain,
  scopeMatches,
} from './judgments.ts'
import {
  bindingKey,
  db,
  decodeProfile,
  isCredentialRef,
  isProfile,
  putRow,
  readBinding,
  readRow,
  rowKey,
} from './records.ts'
import type {
  DiagnosticSink,
  DirectoryDiagnostic,
  InvalidInput,
  ManifestEntryDisposition,
  ManifestResult,
  MembershipsRead,
  ModelCatalog,
  ModelCatalogRead,
  OfficialManifest,
  ProfileRow,
  Result,
} from './types.ts'

/** Rollback a multi-row content write on a named business refusal. */
class Rejected extends Error {
  constructor(readonly result: InvalidInput) {
    super('directory input rejected')
  }
}
const safeConstraints = new Set([
  'model_profile_pkey',
  'model_profile_configuration_pkey',
  'model_manifest_state_pkey',
  'model_credential_binding_pkey',
])
export function sanitized(error: unknown): Error {
  if (error instanceof StorageUnavailable)
    return new StorageUnavailable('directory storage unavailable')
  if (error instanceof UniqueViolation)
    return new UniqueViolation(
      safeConstraints.has(error.constraint) ? error.constraint : 'unrecognized',
    )
  if (error instanceof ReferenceViolation) return new ReferenceViolation(error.kind)
  if (error instanceof StorageDefect) return new StorageDefect('directory storage defect')
  return new Error('directory operation failed')
}

/** Lifecycle ownership only; no persistent facts live here. */
export class OperationOwner {
  #closed = false
  #active = 0
  #drain: (() => void) | undefined
  #closing: Promise<void> | undefined
  constructor(
    private readonly sink: DiagnosticSink,
    private readonly sinkFailure: () => void,
  ) {}
  record(event: DirectoryDiagnostic): void {
    try {
      this.sink.record(event)
    } catch {
      this.sinkFailure()
    }
  }
  async execute<T>(
    operation: string,
    fn: () => Promise<T>,
  ): Promise<T | InvalidInput | { readonly failure: 'unavailable' }> {
    if (this.#closed) return { failure: 'unavailable' }
    this.#active++
    this.record({ operation, phase: 'start' })
    try {
      const result = await fn()
      this.record({
        operation,
        phase: 'finish',
        outcome:
          object(result) && typeof result.failure === 'string' ? result.failure : 'completed',
      })
      return result
    } catch (error) {
      if (error instanceof Rejected) {
        this.record({ operation, phase: 'finish', outcome: 'invalidInput' })
        return error.result
      }
      this.record({
        operation,
        phase: 'error',
        outcome: error instanceof StorageUnavailable ? 'unavailable' : 'defect',
      })
      if (error instanceof StorageUnavailable) return { failure: 'unavailable' }
      throw sanitized(error)
    } finally {
      this.#active--
      if (this.#active === 0) this.#drain?.()
    }
  }
  close(): Promise<void> {
    if (this.#closing !== undefined) return this.#closing
    this.#closed = true
    this.record({ operation: 'provider', phase: 'close', outcome: 'admission_closed' })
    const drain =
      this.#active === 0
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            this.#drain = resolve
          })
    this.#closing = drain.then(() => {
      this.record({ operation: 'provider', phase: 'close', outcome: 'drained' })
    })
    return this.#closing
  }
}
export interface DirectoryDependencies {
  readonly storage: AtomicStorage
  readonly clock: Clock
  readonly memberships: MembershipsRead
  readonly owner: OperationOwner
  readonly factoryConfigured: boolean
  readonly notify: (ref: ModelProfileRef) => void
}

export class CatalogImplementation {
  readonly read: ModelCatalogRead
  readonly management: ModelCatalog
  constructor(private readonly deps: DirectoryDependencies) {
    this.read = {
      readProfile: (tenant, ref) =>
        deps.owner.execute('readProfile', () => this.readProfile(tenant, ref)),
      listProfiles: tenant => deps.owner.execute('listProfiles', () => this.listProfiles(tenant)),
      credentialPresent: (tenant, origin) =>
        deps.owner.execute('credentialPresent', () => this.present(tenant, origin)),
    }
    this.management = {
      ...this.read,
      registerProfile: (initiator, scope, content) =>
        deps.owner.execute('registerProfile', () => this.register(initiator, scope, content)),
      updateProfile: (initiator, ref, patch) =>
        deps.owner.execute('updateProfile', () => this.update(initiator, ref, patch)),
      withdrawProfile: (initiator, ref) =>
        deps.owner.execute('withdrawProfile', () => this.registration(initiator, ref, 'withdrawn')),
      relistProfile: (initiator, ref) =>
        deps.owner.execute('relistProfile', () => this.registration(initiator, ref, 'listed')),
      bindCredential: (initiator, tenant, credential) =>
        deps.owner.execute('bindCredential', () => this.bind(initiator, tenant, credential)),
      unbindCredential: (initiator, tenant) =>
        deps.owner.execute('unbindCredential', () => this.unbind(initiator, tenant)),
    }
  }
  async ready(): Promise<void> {
    await this.deps.storage.read(async tx => {
      await db(tx).selectFrom('model_profile').selectAll().limit(0).execute()
      await db(tx).selectFrom('model_profile_configuration').selectAll().limit(0).execute()
      await db(tx).selectFrom('model_credential_binding').selectAll().limit(0).execute()
      const state = await db(tx)
        .selectFrom('model_manifest_state')
        .selectAll()
        .where('id', '=', 1)
        .executeTakeFirst()
      if (state === undefined) throw new StorageDefect('directory manifest state missing')
    })
  }
  async authorize(
    initiator: TenantId,
    scope: ScopeLayerIdentity,
  ): Promise<'eligible' | 'notAuthorized' | 'unavailable'> {
    if (!sameWriter(initiator, scope)) return 'notAuthorized'
    const result = await this.deps.memberships.standing(initiator)
    const parsed = parseMembershipStandingResult(result)
    if (!('ok' in parsed)) throw new StorageDefect('memberships v1 standing result malformed')
    return configEligibility(initiator, scope, parsed.ok)
  }
  now(): string {
    const time = this.deps.clock.now()
    if (time === 'unavailable') throw new StorageUnavailable('clock unavailable')
    return instantToRfc3339(time)
  }
  async history(tx: WriteTx, row: ProfileRow, write: boolean): Promise<void> {
    const k = rowKey(row.ref),
      configuration = row.profile.adaptation.configuration
    const query = () =>
      db(tx)
        .selectFrom('model_profile_configuration')
        .select('values_json')
        .where('scope_layer', '=', k.scope_layer)
        .where('organization_id', '=', k.organization_id)
        .where('account_id', '=', k.account_id)
        .where('route_name', '=', k.route_name)
        .where('revision', '=', configuration.revision)
        .executeTakeFirst()
    const compare = (text: string) => {
      const value = readJsonStrict(text)
      if ('failed' in value || !jsonObject(value.ok))
        throw new StorageDefect('configuration history malformed')
      if (!jsonEqual(value.ok, configuration.values)) throw new Rejected(invalid())
    }
    const old = await query()
    if (old !== undefined) {
      compare(old.values_json)
      return
    }
    if (!write) return
    try {
      await db(tx)
        .insertInto('model_profile_configuration')
        .values({
          ...k,
          revision: configuration.revision,
          values_json: writeJsonLossless(configuration.values),
        })
        .execute()
    } catch (error) {
      if (
        !(error instanceof UniqueViolation) ||
        error.constraint !== 'model_profile_configuration_pkey'
      )
        throw error
      const raced = await query()
      if (raced === undefined) throw new StorageDefect('configuration conflict has no row')
      compare(raced.values_json)
    }
  }
  async register(
    initiatorInput: unknown,
    scopeInput: unknown,
    contentInput: unknown,
  ): Promise<Result<ProfileRow, 'notAuthorized' | 'routeNameTaken' | 'unavailable'>> {
    const initiator = parseTenantId(initiatorInput),
      scope = parseScopeLayerIdentity(scopeInput),
      content = parseContent(contentInput)
    if (!('ok' in initiator) || !('ok' in scope)) return invalid()
    if ('failure' in content) return content
    if (content.origin !== 'custom') return invalid('origin_not_custom')
    const access = await this.authorize(initiator.ok, scope.ok)
    if (access !== 'eligible') return { failure: access }
    const ref: ModelProfileRef = { origin: 'custom', scope: scope.ok, routeName: content.routeName }
    return this.deps.storage.write(async tx => {
      await tx.lockRow('model_profile', { ...rowKey(ref) })
      const candidate: ProfileRow = {
        ref,
        profile: { ...content, registration: 'listed', updatedAt: '2000-01-01T00:00:00.000Z' },
      }
      await this.history(tx, candidate, false)
      const old = await readRow(tx, ref)
      if (old !== undefined)
        return old.profile.registration === 'listed' && contentEqual(old.profile, content)
          ? old
          : { failure: 'routeNameTaken' }
      const row: ProfileRow = {
        ref,
        profile: { ...content, registration: 'listed', updatedAt: this.now() },
      }
      try {
        await db(tx)
          .insertInto('model_profile')
          .values({ ...rowKey(ref), profile_json: writeJsonLossless(row.profile) })
          .execute()
      } catch (error) {
        if (!(error instanceof UniqueViolation) || error.constraint !== 'model_profile_pkey')
          throw error
        const raced = await readRow(tx, ref)
        if (raced === undefined) throw new StorageDefect('profile conflict has no row')
        await this.history(tx, candidate, false)
        return raced.profile.registration === 'listed' && contentEqual(raced.profile, content)
          ? raced
          : { failure: 'routeNameTaken' }
      }
      await this.history(tx, row, true)
      return row
    })
  }
  async registration<R extends 'listed' | 'withdrawn'>(
    initiatorInput: unknown,
    refInput: unknown,
    registration: R,
  ): Promise<
    Result<
      { readonly ref: ModelProfileRef; readonly registration: R },
      'officialProfileReadOnly' | 'notAuthorized' | 'profileNotFound' | 'unavailable'
    >
  > {
    const initiator = parseTenantId(initiatorInput),
      ref = parseRef(refInput)
    if (!('ok' in initiator)) return invalid()
    if ('failure' in ref) return ref
    if (ref.origin === 'official') return { failure: 'officialProfileReadOnly' }
    const access = await this.authorize(initiator.ok, ref.scope)
    if (access !== 'eligible') return { failure: access }
    const result = await this.deps.storage.write(async tx => {
      await tx.lockRow('model_profile', { ...rowKey(ref) })
      const row = await readRow(tx, ref)
      if (row === undefined) return { failure: 'profileNotFound' } as const
      const changed = row.profile.registration !== registration
      if (changed) await putRow(tx, { ref, profile: { ...row.profile, registration } })
      return { changed }
    })
    if (result.failure === 'profileNotFound') return { failure: 'profileNotFound' }
    if (result.changed && registration === 'withdrawn') this.deps.notify(ref)
    return { ref, registration }
  }
  async update(
    initiatorInput: unknown,
    refInput: unknown,
    patchInput: unknown,
  ): Promise<
    Result<
      ProfileRow,
      'officialProfileReadOnly' | 'notAuthorized' | 'profileNotFound' | 'unavailable'
    >
  > {
    const initiator = parseTenantId(initiatorInput),
      ref = parseRef(refInput),
      patch = parsePatch(patchInput)
    if (!('ok' in initiator)) return invalid()
    if ('failure' in ref) return ref
    if ('failure' in patch) return patch
    if (ref.origin === 'official') return { failure: 'officialProfileReadOnly' }
    const access = await this.authorize(initiator.ok, ref.scope)
    if (access !== 'eligible') return { failure: access }
    return this.deps.storage.write(async tx => {
      await tx.lockRow('model_profile', { ...rowKey(ref) })
      const old = await readRow(tx, ref)
      if (old === undefined) return { failure: 'profileNotFound' }
      const changed = { ...old.profile, ...patch.replace }
      if (patch.remove !== undefined) delete changed.parameters
      const judgment = judgeModelProfileDocument('ModelProfile', changed)
      if ('rejected' in judgment) return invalid(judgment.rejected)
      if (!isProfile(changed)) throw new StorageDefect('updated profile validator disagrees')
      const profile: ModelProfile = upstreamEqual(old.profile, changed)
        ? changed
        : { ...changed, updatedAt: this.now() }
      const row = { ref, profile }
      await this.history(tx, row, false)
      if (contentEqual(old.profile, profile)) return old
      await putRow(tx, row)
      await this.history(tx, row, true)
      return row
    })
  }
  async readProfile(
    tenantInput: unknown,
    refInput: unknown,
  ): Promise<Result<ProfileRow, 'notAuthorized' | 'profileNotFound' | 'unavailable'>> {
    const tenant = parseTenantId(tenantInput),
      ref = parseRef(refInput)
    if (!('ok' in tenant)) return invalid()
    if ('failure' in ref) return ref
    if (
      ref.origin === 'custom' &&
      !scopeChain(tenant.ok).some(scope => scopeMatches(scope, ref.scope))
    )
      return { failure: 'notAuthorized' }
    return this.deps.storage.read(
      async tx => (await readRow(tx, ref)) ?? { failure: 'profileNotFound' },
    )
  }
  async listProfiles(tenantInput: unknown): Promise<Result<readonly ProfileRow[], 'unavailable'>> {
    const tenant = parseTenantId(tenantInput)
    if (!('ok' in tenant)) return invalid()
    return this.deps.storage.read(async tx => {
      const rows = await db(tx)
        .selectFrom('model_profile')
        .selectAll()
        .where(eb =>
          eb.or([
            eb('scope_layer', '=', 'factory'),
            eb.and([
              eb('scope_layer', '=', 'organization'),
              eb('organization_id', '=', tenant.ok.organization),
            ]),
            eb.and([
              eb('scope_layer', '=', 'tenant'),
              eb('organization_id', '=', tenant.ok.organization),
              eb('account_id', '=', tenant.ok.account),
            ]),
          ]),
        )
        .execute()
      return rows.map(decodeProfile)
    })
  }
  async present(
    tenantInput: unknown,
    originInput: unknown,
  ): ReturnType<ModelCatalogRead['credentialPresent']> {
    const tenant = parseTenantId(tenantInput)
    if (!('ok' in tenant) || (originInput !== 'official' && originInput !== 'custom'))
      return invalid()
    return this.deps.storage.read(async tx => {
      const binding = await readBinding(tx, tenant.ok)
      return credentialSlot(
        binding === undefined ? undefined : { ...binding, tenant: tenant.ok },
        originInput,
        this.deps.factoryConfigured,
      )
    })
  }
  async bind(
    initiatorInput: unknown,
    tenantInput: unknown,
    credential: unknown,
  ): ReturnType<ModelCatalog['bindCredential']> {
    const initiator = parseTenantId(initiatorInput),
      tenant = parseTenantId(tenantInput)
    if (!('ok' in initiator) || !('ok' in tenant) || !isCredentialRef(credential)) return invalid()
    const access = await this.authorize(initiator.ok, { layer: 'tenant', tenant: tenant.ok })
    if (access !== 'eligible') return { failure: access }
    return this.deps.storage.write(async tx => {
      await tx.lockRow('model_credential_binding', bindingKey(tenant.ok))
      const old = await readBinding(tx, tenant.ok)
      if (old?.credentialRef === credential) return { tenant: tenant.ok, boundAt: old.boundAt }
      const time = this.deps.clock.now()
      if (time === 'unavailable') throw new StorageUnavailable('clock unavailable')
      await db(tx)
        .insertInto('model_credential_binding')
        .values({
          ...bindingKey(tenant.ok),
          credential_ref: credential,
          bound_at: instantToRfc3339(time),
        })
        .onConflict(oc =>
          oc
            .columns(['organization_id', 'account_id'])
            .doUpdateSet({ credential_ref: credential, bound_at: instantToRfc3339(time) }),
        )
        .execute()
      return { tenant: tenant.ok, boundAt: time }
    })
  }
  async unbind(
    initiatorInput: unknown,
    tenantInput: unknown,
  ): ReturnType<ModelCatalog['unbindCredential']> {
    const initiator = parseTenantId(initiatorInput),
      tenant = parseTenantId(tenantInput)
    if (!('ok' in initiator) || !('ok' in tenant)) return invalid()
    const access = await this.authorize(initiator.ok, { layer: 'tenant', tenant: tenant.ok })
    if (access !== 'eligible') return { failure: access }
    await this.deps.storage.write(async tx => {
      await tx.lockRow('model_credential_binding', bindingKey(tenant.ok))
      await db(tx)
        .deleteFrom('model_credential_binding')
        .where('organization_id', '=', tenant.ok.organization)
        .where('account_id', '=', tenant.ok.account)
        .execute()
    })
    return { tenant: tenant.ok, present: false }
  }
  async loadManifest(
    input: unknown,
  ): Promise<Result<ManifestResult, 'manifestNotNewer' | 'unavailable'>> {
    const manifest = parseManifest(input)
    if ('failure' in manifest) return manifest
    const result = await this.deps.storage.write(async tx => {
      await tx.lockRow('model_manifest_state', { id: 1 })
      const state = await db(tx)
        .selectFrom('model_manifest_state')
        .selectAll()
        .where('id', '=', 1)
        .executeTakeFirst()
      if (state === undefined) throw new StorageDefect('manifest state missing')
      const ordinal = readJsonStrict(state.ordinal_json),
        dispositions = readJsonStrict(state.dispositions_json)
      if ('failed' in ordinal || 'failed' in dispositions || !Array.isArray(dispositions.ok))
        throw new StorageDefect('manifest state malformed')
      const storedDispositions: ManifestEntryDisposition[] = []
      for (const entry of dispositions.ok) {
        if (
          !object(entry) ||
          !isRef(entry.ref) ||
          (entry.disposition !== 'added' &&
            entry.disposition !== 'updated' &&
            entry.disposition !== 'unchanged' &&
            entry.disposition !== 'withdrawn' &&
            entry.disposition !== 'relisted')
        )
          throw new StorageDefect('manifest disposition malformed')
        storedDispositions.push({ ref: entry.ref, disposition: entry.disposition })
      }
      if (!importOrdinal(ordinal.ok)) throw new StorageDefect('manifest ordinal malformed')
      const rows = (
        await db(tx)
          .selectFrom('model_profile')
          .selectAll()
          .where('scope_layer', '=', 'factory')
          .execute()
      ).map(decodeProfile)
      const disposition = manifestDisposition(
        { ordinal: ordinal.ok, dispositions: storedDispositions, rows },
        manifest,
      )
      if ('failure' in disposition) return { result: disposition, notifications: [] }
      if (jsonEqual(ordinal.ok, manifest.ordinal)) return { result: disposition, notifications: [] }
      for (const content of manifest.entries) {
        const ref: ModelProfileRef = { origin: 'official', routeName: content.routeName }
        const old = rows.find(row => row.ref.routeName === content.routeName)
        const row: ProfileRow = {
          ref,
          profile: {
            ...content,
            registration: 'listed',
            updatedAt:
              old !== undefined && upstreamEqual(old.profile, content)
                ? old.profile.updatedAt
                : this.now(),
          },
        }
        await this.history(tx, row, false)
        if (old === undefined)
          await db(tx)
            .insertInto('model_profile')
            .values({ ...rowKey(ref), profile_json: writeJsonLossless(row.profile) })
            .execute()
        else if (!contentEqual(old.profile, row.profile) || old.profile.registration !== 'listed')
          await putRow(tx, row)
        await this.history(tx, row, true)
      }
      for (const entry of disposition.dispositions)
        if (entry.disposition === 'withdrawn') {
          const old = rows.find(row => row.ref.routeName === entry.ref.routeName)
          if (old === undefined) throw new StorageDefect('withdrawal row missing')
          await putRow(tx, { ref: old.ref, profile: { ...old.profile, registration: 'withdrawn' } })
        }
      await db(tx)
        .updateTable('model_manifest_state')
        .set({
          ordinal_json: writeJsonLossless(manifest.ordinal),
          dispositions_json: writeJsonLossless(disposition.dispositions),
        })
        .where('id', '=', 1)
        .execute()
      return {
        result: disposition,
        notifications: disposition.dispositions
          .filter(entry => entry.disposition === 'withdrawn')
          .map(entry => entry.ref),
      }
    })
    for (const ref of result.notifications) this.deps.notify(ref)
    return result.result
  }
}
import { isNonNegativeJsonInteger } from '@omne-harness-lite/content-blocks'
function importOrdinal(value: unknown): value is OfficialManifest['ordinal'] {
  return isNonNegativeJsonInteger(value)
}
