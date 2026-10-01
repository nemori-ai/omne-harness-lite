import {
  evaluate,
  selectEvaluationRootSource,
  type EffectiveAssembly,
  type NonConnectorEvaluationInput,
} from '@omne-harness-lite/asset-evaluation'
import type { AssetDefinition, CapabilityId, AssetVersion } from '@omne-harness-lite/asset-model'
import type {
  ManifestRecord,
  ManifestAppendInput,
  EvaluationRef,
  ManifestSessionRef,
} from '@omne-harness-lite/assembly-manifest-store'
import { judgeAccountValue, type AttemptId } from '@omne-harness-lite/call-accounts'
import type { JsonObject, JsonValue } from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import { instantFromEpochMs, type Instant } from '@omne-harness-lite/offer-expiry'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import type { SlashCommandDefinition } from '@omne-harness-lite/slash-command'
import { own, object, closed, equal, requiredOwn } from './json.ts'
import {
  assetJudge,
  capability,
  compositionFor,
  effective,
  entryName,
  extractRootSourceFromFullFillRecord,
  order,
  permutation,
  readRegistryRecord,
  registered,
  session,
} from './records.ts'
import {
  buildSnapshots,
  buildTableContents,
  computeTableAvailability,
  findInSnapshot,
} from './tables.ts'
import { buildReport, refreshRun, within, readReport } from './report.ts'
import {
  REGISTERED_CATEGORIES,
  type AssetRegistry,
  type RegistryDependencies,
  type RegistryFailure,
  type RegisteredCategory,
  type RegistrySnapshot,
  type TablePlan,
  type FilledBy,
  type Within,
  type CheckedRegistryRecord,
  type RegistryEntry,
} from './types.ts'

class Unavailable extends Error {
  constructor(readonly stage: string) {
    super('registry dependency unavailable')
  }
}
type Head = {
  readonly head: number
  readonly records: Readonly<Record<RegisteredCategory, CheckedRegistryRecord>>
}
type Loaded = {
  readonly observed: Head
  readonly plans: readonly TablePlan[]
  readonly snapshots: readonly RegistrySnapshot[]
  readonly tenant: TenantId
}
function ownDependencies(input: RegistryDependencies): RegistryDependencies {
  if (
    !input ||
    typeof input !== 'object' ||
    !input.manifest ||
    ![
      'readHead',
      'append',
      'readHistory',
      'readGiven',
      'readEvaluation',
      'dependencyPresence',
    ].every(key => typeof input.manifest[key as keyof typeof input.manifest] === 'function') ||
    typeof input.clock?.now !== 'function' ||
    typeof input.diagnostic !== 'function' ||
    typeof input.diagnosticFailure !== 'function' ||
    typeof input.monotonicNow !== 'function' ||
    !Number.isSafeInteger(input.conflictPolicy?.maxRetries) ||
    input.conflictPolicy.maxRetries < 0 ||
    !Number.isSafeInteger(input.maxInFlight) ||
    input.maxInFlight < 1 ||
    !Array.isArray(input.deployedMeta) ||
    !input.deployedMeta.every(id => capability(id) && id.category === 'tool') ||
    new Set(input.deployedMeta.map(id => id.name)).size !== input.deployedMeta.length
  )
    throw new TypeError(
      'registry requires valid explicit dependencies, bounded policies and trusted metadata',
    )
  const borrow = <T extends { read: (...args: never[]) => unknown }>(
    source: T | undefined,
  ): T | undefined =>
    source === undefined ? undefined : (Object.freeze({ read: source.read.bind(source) }) as T)
  const manifest = Object.freeze(
    Object.fromEntries(
      [
        'readHead',
        'append',
        'readHistory',
        'readGiven',
        'readEvaluation',
        'dependencyPresence',
      ].map(key => [key, input.manifest[key as keyof typeof input.manifest].bind(input.manifest)]),
    ),
  ) as unknown as RegistryDependencies['manifest']
  return Object.freeze({
    ...input,
    manifest,
    clock: Object.freeze({ now: input.clock.now.bind(input.clock) }),
    conflictPolicy: Object.freeze({ ...input.conflictPolicy }),
    deployedMeta: requiredOwn(input.deployedMeta),
    ...(input.sessionTenancy === undefined
      ? {}
      : {
          sessionTenancy: Object.freeze({
            holdingTenant: input.sessionTenancy.holdingTenant.bind(input.sessionTenancy),
          }),
        }),
    ...(input.currentInputs === undefined ? {} : { currentInputs: borrow(input.currentInputs) }),
    ...(input.fixedRootInput === undefined ? {} : { fixedRootInput: borrow(input.fixedRootInput) }),
    ...(input.historicalBody === undefined ? {} : { historicalBody: borrow(input.historicalBody) }),
  }) as RegistryDependencies
}
function notification(value: unknown): boolean {
  const copy = own(value)
  if (
    !object(copy) ||
    !capability(copy.capability) ||
    !('ok' in assetJudge.judgeAssetValue('HoldingScope', copy.holder))
  )
    return false
  if (copy.kind === 'HoldingChanged')
    return (
      closed(copy, ['kind', 'holder', 'capability', 'change']) &&
      [
        'added',
        'removed',
        'disabled',
        'enabled',
        'replacement_locked',
        'replacement_unlocked',
        'version_pinned',
        'version_unpinned',
      ].includes(String(copy.change))
    )
  return (
    copy.kind === 'AssignmentChanged' &&
    closed(copy, ['kind', 'holder', 'capability', 'item', 'change']) &&
    typeof copy.item === 'string' &&
    copy.item !== '' &&
    ['assigned', 'cleared', 'locked', 'unlocked'].includes(String(copy.change))
  )
}
/** Seven contract operations; explicit borrowed services and actual drain, without storage or hidden authority. */
export function createAssetRegistry(dependencies: RegistryDependencies): AssetRegistry {
  const deps = ownDependencies(dependencies)
  let stopped = false,
    active = 0
  let closing: Promise<void> | undefined, drained: (() => void) | undefined
  const cache = new Map<string, { head: number; snapshots: readonly RegistrySnapshot[] }>()
  function emit(event: JsonObject): void {
    try {
      deps.diagnostic(requiredOwn(event))
    } catch {
      try {
        deps.diagnosticFailure({ kind: 'registry_diagnostic_unavailable' })
      } catch {
        /* App records independent degradation before fallible output. */
      }
    }
  }
  async function run<T>(
    operation: string,
    s: string,
    task: (facts: Record<string, JsonValue>) => Promise<T>,
  ): Promise<T | RegistryFailure> {
    if (stopped || active >= deps.maxInFlight) return { failure: 'unavailable' }
    const started = deps.monotonicNow()
    active++
    const facts: Record<string, JsonValue> = {
      kind: 'asset_registry',
      operation,
      providerRevision: 'AR4',
      session: s,
    }
    try {
      const result = await task(facts)
      emit({
        ...facts,
        result: object(result) && typeof result.failure === 'string' ? result.failure : 'ok',
        resourceEnded: true,
        totalNanos: (deps.monotonicNow() - started).toString(),
      })
      return requiredOwn(result)
    } catch (error) {
      if (error instanceof SessionNotFound) return { failure: 'sessionNotFound' }
      if (error instanceof Unavailable || error instanceof StorageUnavailable) {
        emit({
          ...facts,
          result: 'unavailable',
          stage: error instanceof Unavailable ? error.stage : 'storage',
          resourceEnded: true,
          totalNanos: (deps.monotonicNow() - started).toString(),
        })
        return { failure: 'unavailable' }
      }
      emit({
        ...facts,
        result: 'defect',
        resourceEnded: true,
        totalNanos: (deps.monotonicNow() - started).toString(),
      })
      throw error
    } finally {
      active--
      if (stopped && active === 0) drained?.()
    }
  }
  async function tenant(s: string): Promise<TenantId> {
    if (deps.sessionTenancy === undefined) throw new Unavailable('session_tenancy')
    const result = await deps.sessionTenancy.holdingTenant(s)
    if (!('tenant' in result)) throw new Unavailable('session_tenancy')
    const checked = parseTenantId(result.tenant)
    if (!('ok' in checked)) throw new TypeError('STT returned malformed tenant')
    return checked.ok
  }
  async function head(s: string): Promise<Head | { failure: 'sessionNotFound' }> {
    const observed = await deps.manifest.readHead(s)
    if (!('head' in observed)) throw new Unavailable('manifest_head')
    if (!Number.isSafeInteger(observed.head) || observed.head < 0 || !object(observed.latest))
      throw new TypeError('manifest returned malformed head')
    if (observed.head === 0) {
      if (Object.keys(observed.latest).length !== 0) throw new Unavailable('manifest_head_binding')
      return { failure: 'sessionNotFound' }
    }
    if (
      Object.keys(observed.latest).length !== 6 ||
      !REGISTERED_CATEGORIES.every(cat => Object.hasOwn(observed.latest, cat))
    )
      throw new Unavailable('manifest_tables_incomplete')
    const records: Partial<Record<RegisteredCategory, CheckedRegistryRecord>> = {}
    const sameSeq = new Map<number, ManifestRecord>()
    for (const category of REGISTERED_CATEGORIES) {
      const checked = readRegistryRecord(observed.latest[category], s, observed.head)
      if (checked === undefined || checked.record.tables[category] === undefined)
        throw new Unavailable('manifest_table_binding')
      const other = sameSeq.get(checked.record.seq)
      if (other !== undefined && !equal(other, checked.record))
        throw new Unavailable('manifest_record_identity')
      sameSeq.set(checked.record.seq, checked.record)
      records[category] = checked
    }
    return {
      head: observed.head,
      records: records as Record<RegisteredCategory, CheckedRegistryRecord>,
    }
  }
  async function rebuild(
    s: string,
    t: TenantId,
    category: RegisteredCategory,
    checked: CheckedRegistryRecord,
  ): Promise<TablePlan> {
    const composition = checked.compositions[category],
      table = checked.record.tables[category]
    if (composition === undefined || table === undefined) throw new Unavailable('history_table')
    const entries: RegistryEntry[] = []
    for (const tuple of composition) {
      if (deps.historicalBody === undefined) throw new Unavailable('history_source')
      const result = await deps.historicalBody.read({
        session: s,
        tenant: t,
        category,
        filledAt: table.filledAt,
        capability: tuple.capability,
        asset: tuple.asset,
        version: tuple.version,
      })
      if ('failure' in result) {
        if (result.failure === 'invalidInput')
          throw new TypeError('validated table produced an invalid history source request')
        throw new Unavailable(`historical_body_${result.stage}`)
      }
      const copied = own(result.version)
      if (
        !('ok' in assetJudge.judgeAssetValue('AssetVersion', copied)) ||
        !object(copied) ||
        !equal(copied.number, tuple.version) ||
        !object(copied.content) ||
        copied.content.category !== category
      )
        throw new Unavailable('history_version_binding')
      const content = (copied as unknown as AssetVersion).content
      entries.push({
        capability: tuple.capability,
        asset: tuple.asset,
        from: tuple.from,
        content,
        availability: { kind: 'available' },
        ...(tuple.resident === undefined ? {} : { resident: tuple.resident }),
      })
    }
    return requiredOwn({ category, composition, entries })
  }
  async function load(
    s: string,
    facts: Record<string, JsonValue>,
  ): Promise<Loaded | { failure: 'sessionNotFound' }> {
    const observed = await head(s)
    if ('failure' in observed) return observed
    facts.head = observed.head
    const t = await tenant(s)
    facts.tenant = own(t) as JsonValue
    const raw: TablePlan[] = []
    for (const category of REGISTERED_CATEGORIES)
      raw.push(await rebuild(s, t, category, observed.records[category]))
    // Each table can retain a different E. Resolve tools first, then each category against its own recorded E.
    const toolPlan = raw.find(plan => plan.category === 'tool') as TablePlan
    const computedTools = computeTableAvailability(
      [toolPlan],
      observed.records.tool.content.evaluation,
    )[0] as TablePlan
    const plans = raw.map(plan =>
      plan.category === 'tool'
        ? computedTools
        : (computeTableAvailability(
            [computedTools, plan],
            observed.records[plan.category].content.evaluation,
          ).find(value => value.category === plan.category) as TablePlan),
    )
    const snapshots = plans.flatMap(plan =>
      buildSnapshots(observed.records[plan.category].record, [plan]),
    )
    const cached = cache.get(s)
    const effectiveSnapshots =
      cached?.head === observed.head
        ? snapshots.map(
            snapshot =>
              cached.snapshots.find(
                old => old.category === snapshot.category && old.filledAt === snapshot.filledAt,
              ) ?? snapshot,
          )
        : snapshots
    // A later completion from an older H never overwrites a higher cache generation.
    if (cached === undefined || cached.head <= observed.head)
      cache.set(s, { head: observed.head, snapshots: requiredOwn(effectiveSnapshots) })
    return { observed, tenant: t, plans, snapshots: requiredOwn(effectiveSnapshots) }
  }
  async function current(s: string, t: TenantId): Promise<NonConnectorEvaluationInput> {
    if (deps.currentInputs === undefined) throw new Unavailable('current_inputs')
    const result = await deps.currentInputs.read(s, t)
    if ('failure' in result) {
      if (result.failure === 'invalidInput')
        throw new TypeError('validated session/tenant produced an invalid current-input request')
      throw new Unavailable('current_inputs')
    }
    return requiredOwn(result.input)
  }
  async function fixed(
    s: string,
    loaded: Loaded,
    purpose: 'reload' | 'refresh_availability',
    facts: Record<string, JsonValue>,
  ): Promise<NonConnectorEvaluationInput> {
    const given = await deps.manifest.readGiven(s, loaded.observed.head)
    if (!('record' in given)) throw new Unavailable('original_given')
    const proof = extractRootSourceFromFullFillRecord(given.record, s, loaded.observed.head)
    if ('failure' in proof) throw new Unavailable('full_fill_proof')
    facts.givenSeq = proof.record.seq
    facts.givenRef = proof.record.evaluationRef
    facts.fixed = own(proof.rootSource) as JsonValue
    if (deps.fixedRootInput === undefined) throw new Unavailable('fixed_root_inputs')
    const result = await deps.fixedRootInput.read({
      session: s,
      tenant: loaded.tenant,
      purpose,
      rootSource: proof.rootSource,
    })
    if ('failure' in result) {
      if (result.failure === 'invalidInput')
        throw new TypeError('validated full-fill proof produced an invalid fixed-root request')
      if (result.failure === 'rootSourceMismatch') {
        const selected = selectEvaluationRootSource({
          tenant: loaded.tenant,
          standing: result.input.standing,
          holdings: result.input.holdings,
          definitions: result.input.definitions,
          ...(result.input.session === undefined ? {} : { session: result.input.session }),
          rootDefinition: result.input.root.definition,
        })
        const actual = evaluate(result.input)
        if (
          !equal(result.input.root.source, proof.rootSource) ||
          !('ok' in selected) ||
          !equal(selected.ok, result.selected) ||
          equal(selected.ok, proof.rootSource) ||
          !('invalidInput' in actual) ||
          !actual.invalidInput.diagnostics.some(item => item.condition === 'C16') ||
          !equal(actual, result.rejection)
        )
          throw new TypeError('fixed-root source rejected without the declared C16 causal evidence')
        facts.selected = own(result.selected) as JsonValue
        facts.sourceRevision = result.sourceRevision
        throw new Unavailable('root_source_mismatch')
      }
      throw new Unavailable(`fixed_root_${result.stage}`)
    }
    if (!equal(result.input.root.source, proof.rootSource))
      throw new TypeError('fixed-root reader silently changed original source')
    return requiredOwn(result.input)
  }
  function now(previous?: Instant): Instant {
    const value = deps.clock.now()
    if (value === 'unavailable') throw new Unavailable('clock')
    const next = previous !== undefined && value <= previous ? previous + 1 : value
    const checked = instantFromEpochMs(next)
    if (!('ok' in checked)) throw new Unavailable('clock_capacity')
    return checked.ok
  }
  function publishCache(s: string, h: number, snapshots: readonly RegistrySnapshot[]): void {
    const prior = cache.get(s)
    if (prior !== undefined && prior.head > h) return
    const merged = REGISTERED_CATEGORIES.flatMap(category => {
      const snapshot =
        snapshots.find(snapshot => snapshot.category === category) ??
        prior?.snapshots.find(snapshot => snapshot.category === category)
      return snapshot === undefined ? [] : [snapshot]
    })
    cache.set(s, { head: h, snapshots: requiredOwn(merged) })
  }
  async function append(
    s: string,
    h: number,
    plans: readonly TablePlan[],
    evaluation: EffectiveAssembly,
    sequence: readonly CapabilityId[],
    reason: FilledBy,
    identity: ManifestAppendInput['evaluation'],
    records: Readonly<Partial<Record<RegisteredCategory, CheckedRegistryRecord>>>,
    facts: Record<string, JsonValue>,
  ) {
    const tables = Object.fromEntries(
      plans.map(plan => [
        plan.category,
        {
          filledAt: now(records[plan.category]?.record.tables[plan.category]?.filledAt),
          composition: plan.composition,
        },
      ]),
    )
    const content = { evaluation, compositionOrder: sequence, filledBy: reason }
    const record = requiredOwn({
      evaluation: identity,
      tables,
      content,
    }) as unknown as ManifestAppendInput
    const result = await deps.manifest.append(s, h, record)
    facts.appendResult = 'failure' in result ? result.failure : 'committed'
    facts.expectedHead = h
    if ('failure' in result) return result
    const committed = requiredOwn({
      ...record,
      session: s as ManifestSessionRef,
      seq: result.seq,
      evaluationRef: result.evaluationRef,
    })
    const snapshots = buildSnapshots(committed, plans)
    publishCache(s, result.head, snapshots)
    return { snapshots }
  }
  async function shrink(
    s: string,
    loaded: Loaded,
    removed: readonly CapabilityId[],
    reason: FilledBy,
    facts: Record<string, JsonValue>,
  ) {
    const original = loaded.observed.records.slash_command
    const plan = loaded.plans.find(plan => plan.category === 'slash_command') as TablePlan
    const snapshot = loaded.snapshots.find(
      snapshot => snapshot.category === 'slash_command',
    ) as RegistrySnapshot
    const next = {
      ...plan,
      composition: plan.composition.filter(
        tuple => !removed.some(id => equal(id, tuple.capability)),
      ),
      entries: snapshot.entries.filter(entry => !removed.some(id => equal(id, entry.capability))),
    }
    if (next.entries.length === plan.entries.length) return { snapshot }
    const result = await append(
      s,
      loaded.observed.head,
      [next],
      original.content.evaluation,
      original.content.compositionOrder,
      reason,
      { kind: 'reuse', ref: original.record.evaluationRef },
      loaded.observed.records,
      facts,
    )
    if ('snapshots' in result) return { snapshot: result.snapshots[0] as RegistrySnapshot }
    return result
  }
  function externalAppendFailure(result: { failure: string }): RegistryFailure {
    if (result.failure === 'invalidInput' || result.failure === 'filledAtNotIncreasing')
      throw new TypeError('validated registry plan was rejected by manifest')
    return { failure: 'unavailable' }
  }
  return Object.freeze({
    async fill(s: unknown, value: unknown, ref: unknown, sequence: unknown) {
      const evaluation = effective(value),
        copied = own(sequence)
      if (
        !session(s) ||
        evaluation === undefined ||
        !order(copied) ||
        !permutation(evaluation, copied) ||
        !('ok' in parseOpaqueIdentifier(ref, 'EvaluationRef'))
      )
        return { failure: 'invalidInput' } as const
      return run('fill', s, async facts => {
        for (let retry = 0; ; retry++) {
          const observed = await deps.manifest.readHead(s)
          if (!('head' in observed)) throw new Unavailable('manifest_head')
          const t = await tenant(s)
          facts.tenant = own(t) as JsonValue
          facts.head = observed.head
          // A visible complete current given can be recognized without substituting retry E/O or reading current bodies.
          const originals = REGISTERED_CATEGORIES.map(category =>
            readRegistryRecord(observed.latest[category], s, observed.head),
          )
          if (
            originals.every(
              record =>
                record !== undefined &&
                record.record.evaluation.kind === 'given' &&
                record.record.evaluationRef === ref &&
                record.content.filledBy.kind === 'assembly',
            )
          ) {
            const restored = await load(s, facts)
            if ('failure' in restored) throw new Unavailable('fill_recognition')
            if (
              restored.snapshots.every(
                snapshot => snapshot.basedOn === ref && snapshot.filledBy.kind === 'assembly',
              )
            )
              return { snapshots: restored.snapshots }
            // Recognition raced with a replacement. Continue through append's authoritative alreadyRecorded result.
          }
          if (evaluation.unresolved.length !== 0)
            return requiredOwn({
              failure: 'dependencyUnresolved' as const,
              missing: evaluation.unresolved,
            })
          const input = await current(s, t)
          const built = buildTableContents(evaluation, copied, input.definitions)
          if (!('plans' in built)) return built
          const previous: Partial<Record<RegisteredCategory, CheckedRegistryRecord>> = {}
          for (const category of REGISTERED_CATEGORIES) {
            const old = readRegistryRecord(observed.latest[category], s, observed.head)
            if (old !== undefined) previous[category] = old
            else if (observed.head > 0) throw new Unavailable('fill_previous_table')
          }
          const appended = await append(
            s,
            observed.head,
            built.plans,
            evaluation,
            copied,
            { kind: 'assembly' },
            { kind: 'given', ref: ref as EvaluationRef },
            previous,
            facts,
          )
          if ('snapshots' in appended) return appended
          if (appended.failure === 'alreadyRecorded') {
            if (appended.record.session !== s || appended.record.evaluation.kind !== 'given')
              return { failure: 'invalidInput' as const }
            const restored = await load(s, facts)
            if ('failure' in restored) throw new Unavailable('fill_recognition')
            return restored.snapshots.every(
              snapshot => snapshot.basedOn === ref && snapshot.filledBy.kind === 'assembly',
            )
              ? { snapshots: restored.snapshots }
              : { failure: 'invalidInput' as const, reason: 'evaluationSuperseded' as const }
          }
          if (appended.failure === 'evaluationRefConflict')
            return { failure: 'invalidInput' as const }
          if (appended.failure === 'headMismatch' && retry < deps.conflictPolicy.maxRetries) {
            facts.conflictRetries = retry + 1
            continue
          }
          return externalAppendFailure(appended)
        }
      })
    },
    async reload(s: unknown, category: unknown, sequence: unknown) {
      const copied = own(sequence)
      if (
        !session(s) ||
        !order(copied) ||
        ![
          'tool',
          'skill',
          'slash_command',
          'loop_extension',
          'mcp',
          'plugin',
          'connector',
          'agent_definition',
        ].includes(String(category))
      )
        return { failure: 'invalidInput' } as const
      if (!registered(category)) return { failure: 'categoryNotRegistered' } as const
      return run('reload', s, async facts => {
        for (let retry = 0; ; retry++) {
          const loaded = await load(s, facts)
          if ('failure' in loaded) return loaded
          const input = await fixed(s, loaded, 'reload', facts)
          const evaluated = evaluate(input)
          facts.evaluationCount = 1
          if ('invalidInput' in evaluated) throw new Unavailable('evaluation_input')
          if (!('ok' in evaluated)) return evaluated
          if (!permutation(evaluated.ok, copied)) return { failure: 'invalidInput' as const }
          const built = buildTableContents(evaluated.ok, copied, input.definitions)
          if (!('plans' in built)) return built
          const targets = new Set<RegisteredCategory>([category])
          if (category === 'plugin') {
            for (const entry of [
              ...(loaded.plans.find(plan => plan.category === 'plugin')?.entries ?? []),
              ...(built.plans.find(plan => plan.category === 'plugin')?.entries ?? []),
            ])
              if (entry.content.category === 'plugin')
                for (const member of entry.content.members)
                  if (registered(member.category)) targets.add(member.category)
          }
          const union = loaded.plans.map(old =>
            targets.has(old.category)
              ? (built.plans.find(plan => plan.category === old.category) as TablePlan)
              : old,
          )
          const computed = computeTableAvailability(union, evaluated.ok).filter(plan =>
            targets.has(plan.category),
          )
          const appended = await append(
            s,
            loaded.observed.head,
            computed,
            evaluated.ok,
            copied,
            { kind: 'reload', command: `omne-official:reload-${category}` },
            { kind: 'mint' },
            loaded.observed.records,
            facts,
          )
          if ('snapshots' in appended) return appended
          if (appended.failure === 'headMismatch' && retry < deps.conflictPolicy.maxRetries) {
            facts.conflictRetries = retry + 1
            continue
          }
          return externalAppendFailure(appended)
        }
      })
    },
    async refreshAvailability(s: unknown, runValue: unknown, attempt: unknown) {
      const runIdentity = typeof s === 'string' ? refreshRun(runValue, s) : undefined
      if (
        !session(s) ||
        runIdentity === undefined ||
        !('ok' in judgeAccountValue('AttemptId', attempt))
      )
        return { failure: 'invalidInput' } as const
      return run('refreshAvailability', s, async facts => {
        const loaded = await load(s, facts)
        if ('failure' in loaded) return loaded
        const input = await fixed(s, loaded, 'refresh_availability', facts)
        const evaluated = evaluate(input)
        facts.evaluationCount = 1
        if ('invalidInput' in evaluated) throw new Unavailable('evaluation_input')
        if (!('ok' in evaluated)) return evaluated
        const skillGate =
          runIdentity.kind === 'continue'
            ? runIdentity.report.skillGate
            : (loaded.plans
                .find(plan => plan.category === 'skill')
                ?.entries.filter(entry =>
                  evaluated.ok.filteredOut.some(
                    item =>
                      item.reason === 'not_usable' && equal(item.capability, entry.capability),
                  ),
                )
                .map(entry => entry.capability) ?? [])
        const plans = computeTableAvailability(loaded.plans, evaluated.ok)
        const snapshots = plans.map(plan => ({
          ...(loaded.snapshots.find(
            snapshot => snapshot.category === plan.category,
          ) as RegistrySnapshot),
          entries: plan.entries,
        }))
        const report = buildReport(
          s,
          runIdentity.runId,
          attempt as AttemptId,
          now(),
          snapshots,
          evaluated.ok,
          deps.deployedMeta,
          skillGate,
        )
        const cached = cache.get(s)
        if (cached === undefined || cached.head <= loaded.observed.head)
          cache.set(s, { head: loaded.observed.head, snapshots: requiredOwn(snapshots) })
        return { report }
      })
    },
    async list(s: unknown, category: unknown, withinValue: unknown) {
      const selection = typeof s === 'string' ? within(withinValue, s) : undefined
      if (
        !session(s) ||
        selection === undefined ||
        ![
          'tool',
          'skill',
          'slash_command',
          'loop_extension',
          'mcp',
          'plugin',
          'connector',
          'agent_definition',
        ].includes(String(category))
      )
        return { failure: 'invalidInput' } as const
      if (!registered(category)) return { failure: 'categoryNotRegistered' } as const
      return run('list', s, async facts => ({
        entries: await entries(s, category, selection, facts),
      }))
    },
    async lookup(s: unknown, category: unknown, name: unknown, withinValue: unknown) {
      const selection = typeof s === 'string' ? within(withinValue, s) : undefined
      if (
        !session(s) ||
        selection === undefined ||
        typeof name !== 'string' ||
        name === '' ||
        ![
          'tool',
          'skill',
          'slash_command',
          'loop_extension',
          'mcp',
          'plugin',
          'connector',
          'agent_definition',
        ].includes(String(category))
      )
        return { failure: 'invalidInput' } as const
      if (!registered(category)) return { failure: 'categoryNotRegistered' } as const
      return run('lookup', s, async facts => {
        const list = await entries(s, category, selection, facts)
        const entry = list.find(entry => entryName(entry.capability) === name)
        return entry === undefined ? { none: true as const } : { entry }
      })
    },
    async markFailed(s: unknown, id: unknown) {
      const copied = own(id)
      if (
        !session(s) ||
        !capability(copied) ||
        copied.category !== 'slash_command' ||
        REGISTERED_CATEGORIES.some(category => copied.name === `omne-official:reload-${category}`)
      )
        return { failure: 'invalidInput' } as const
      return run('markFailed', s, async facts => {
        for (let retry = 0; ; retry++) {
          const loaded = await load(s, facts)
          if ('failure' in loaded) return loaded
          const entry = loaded.plans
            .find(plan => plan.category === 'slash_command')
            ?.entries.find(entry => equal(entry.capability, copied))
          if (
            entry !== undefined &&
            (entry.content.category !== 'slash_command' ||
              (entry.content.body as unknown as SlashCommandDefinition).binding.kind !== 'command')
          )
            return { failure: 'invalidInput' as const }
          const result = await shrink(
            s,
            loaded,
            [copied],
            { kind: 'auto_refresh_after_failure' },
            facts,
          )
          if ('snapshot' in result) return result
          if (result.failure === 'headMismatch' && retry < deps.conflictPolicy.maxRetries) {
            facts.conflictRetries = retry + 1
            continue
          }
          return externalAppendFailure(result)
        }
      })
    },
    async onAssetChange(s: unknown, value: unknown) {
      if (!session(s) || !notification(value)) return { failure: 'invalidInput' } as const
      return run('onAssetChange', s, async facts => {
        for (let retry = 0; ; retry++) {
          const loaded = await load(s, facts)
          if ('failure' in loaded) return loaded
          const input = await current(s, loaded.tenant),
            evaluated = evaluate(input)
          if (!('ok' in evaluated)) throw new Unavailable('gate_evaluation')
          const removed =
            loaded.plans
              .find(plan => plan.category === 'slash_command')
              ?.entries.filter(entry =>
                evaluated.ok.filteredOut.some(
                  item => item.reason === 'not_usable' && equal(item.capability, entry.capability),
                ),
              )
              .map(entry => entry.capability) ?? []
          const result = await shrink(s, loaded, removed, { kind: 'asset_change' }, facts)
          if ('snapshot' in result) return result
          if (result.failure === 'headMismatch' && retry < deps.conflictPolicy.maxRetries) {
            facts.conflictRetries = retry + 1
            continue
          }
          return externalAppendFailure(result)
        }
      })
    },
    close(): Promise<void> {
      if (closing !== undefined) return closing
      stopped = true
      closing =
        active === 0
          ? Promise.resolve()
          : new Promise<void>(resolve => {
              drained = resolve
            })
      return closing.then(() => {
        cache.clear()
      })
    },
  }) satisfies AssetRegistry
  async function entries(
    s: string,
    category: RegisteredCategory,
    selection: Within,
    facts: Record<string, JsonValue>,
  ): Promise<readonly RegistryEntry[]> {
    const observed = await head(s)
    if ('failure' in observed) throw new SessionNotFound()
    facts.head = observed.head
    const t = await tenant(s)
    facts.tenant = own(t) as JsonValue
    let snapshot: RegistrySnapshot
    if (selection.kind === 'session') {
      const loaded = await load(s, facts)
      if ('failure' in loaded) throw new SessionNotFound()
      snapshot = loaded.snapshots.find(
        snapshot => snapshot.category === category,
      ) as RegistrySnapshot
    } else {
      const locator = selection.report.snapshots.find(item => item.category === category)
      if (locator === undefined) throw new TypeError('validated report has no category locator')
      const historical = await deps.manifest.readHistory(s, category, locator.filledAt)
      if (!('record' in historical)) throw new Unavailable('report_history')
      const checked = readRegistryRecord(historical.record, s, observed.head)
      if (checked === undefined || checked.record.tables[category]?.filledAt !== locator.filledAt)
        throw new Unavailable('report_binding')
      const plan = await rebuild(s, t, category, checked)
      const reported = selection.report.availability.filter(
        item => item.capability.category === category,
      )
      if (
        plan.entries.length !== reported.length ||
        !plan.entries.every(
          entry => reported.filter(item => equal(item.capability, entry.capability)).length === 1,
        )
      )
        throw new Unavailable('report_entry_binding')
      const resolved = {
        ...plan,
        entries: plan.entries.map(entry => {
          const reading = reported.find(item => equal(item.capability, entry.capability))!
          return {
            ...entry,
            availability: reading.availability,
            ...(reading.commandAvailability === undefined
              ? {}
              : { commandAvailability: reading.commandAvailability }),
          }
        }),
      }
      snapshot = buildSnapshots(checked.record, [resolved])[0] as RegistrySnapshot
      if (
        category === 'tool' &&
        (Object.keys(selection.report.effectivePermissions).length !== resolved.entries.length ||
          !resolved.entries.every(entry =>
            Object.hasOwn(selection.report.effectivePermissions, entryName(entry.capability)),
          ))
      )
        throw new Unavailable('report_permission_binding')
    }
    if (category === 'skill' && selection.kind === 'run')
      return requiredOwn(
        snapshot.entries.filter(
          entry => !selection.report.skillGate.some(id => equal(id, entry.capability)),
        ),
      )
    if (category === 'skill' || category === 'slash_command') {
      const input = await current(s, t),
        evaluated = evaluate(input)
      if (!('ok' in evaluated)) throw new Unavailable('gate_evaluation')
      return requiredOwn(
        snapshot.entries.filter(
          entry =>
            !evaluated.ok.filteredOut.some(
              item => item.reason === 'not_usable' && equal(item.capability, entry.capability),
            ),
        ),
      )
    }
    return requiredOwn(snapshot.entries)
  }
}
class SessionNotFound extends Unavailable {
  constructor() {
    super('session_not_found')
  }
}
