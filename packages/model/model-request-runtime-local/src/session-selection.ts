import { readModelLogEnvelope } from '@omne-harness-lite/model-request-runtime'
import type { SessionSelectModelResult } from '@omne-harness-lite/model-request-runtime'
import { evaluate, type EffectiveAssembly } from '@omne-harness-lite/asset-evaluation'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { isNonNegativeJsonInteger } from '@omne-harness-lite/content-blocks'
import { tenantIdEquals, type TenantId } from '@omne-harness-lite/identity-values'
import { judgeModelProfileDocument, type RouteName } from '@omne-harness-lite/model-profile'
import { winningRow, type ProfileRow } from '@omne-harness-lite/model-profile-directory'
import {
  captureModelLogValue,
  decodeModelLogKey,
  inspectModelLogEntry,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import { displayList, effectiveModel, legalTargets } from '@omne-harness-lite/model-request-runtime'
import { captureSelectionJson } from '@omne-harness-lite/model-request-runtime'
import {
  readSettlementPrefix,
  settlementGenerationCurrent,
  type SettlementPrefix,
} from '@omne-harness-lite/model-request-runtime'
import { settlementAppendReceipt } from '@omne-harness-lite/model-request-runtime'
import type {
  RowCredentialFact,
  SelectionProjection,
} from '@omne-harness-lite/model-request-runtime'
import type {
  SettlementRegistration,
  SettlementTask,
} from '@omne-harness-lite/model-request-runtime'
import type {
  SessionModelSelectionInput,
  SessionSelectionDiagnostic,
} from '@omne-harness-lite/model-request-runtime'
import type {
  SessionEffectiveModelResult,
  SessionModelSelection,
} from './session-selection-types.ts'

const unavailable = () => Object.freeze({ unavailable: true } as const)
function route(value: unknown): value is RouteName {
  return (
    'ok' in judgeModelProfileDocument('ModelProfileRef', { origin: 'official', routeName: value })
  )
}
function object(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function profileRows(value: unknown): value is readonly ProfileRow[] {
  return (
    Array.isArray(value) &&
    value.every(
      row =>
        object(row) &&
        Object.keys(row).length === 2 &&
        'ok' in judgeModelProfileDocument('ModelProfileRef', row.ref) &&
        'ok' in judgeModelProfileDocument('ModelProfile', row.profile),
    )
  )
}

interface Operation {
  registration: SettlementRegistration
  readonly tasks: Map<SettlementTask<unknown>, Promise<boolean>>
  unknownWrite: boolean
  stopping: boolean
  readonly drained: Promise<void>
  readonly finish: () => void
}

function operationOutcome(result: object): SessionSelectionDiagnostic['outcome'] {
  return 'unavailable' in result
    ? 'unavailable'
    : 'ok' in result || 'selected' in result
      ? 'success'
      : 'rejected'
}

type PrefixEntry = SettlementPrefix['entries'][number]
function currentModelEnvelope(payload: PrefixEntry['payload']) {
  const decoded = readModelLogEnvelope(payload)
  if ('failure' in decoded || decoded.kind !== 'model') return undefined
  return decoded.envelope.format === 'mrr/3' ? decoded.envelope : undefined
}
function declaresModelLog(entry: PrefixEntry): boolean {
  const decoded = readModelLogEnvelope(entry.payload)
  return (
    entry.readKeys.some(key => 'ok' in decodeModelLogKey(key) || key.startsWith('mrr/')) ||
    entry.dedupeKey?.startsWith('mrr/') === true ||
    'failure' in decoded ||
    decoded.kind === 'model'
  )
}

function targetRejection(
  name: string,
  rows: readonly ProfileRow[],
  allowed: readonly string[],
  legal: readonly string[],
): SessionSelectModelResult | undefined {
  if (!rows.some(row => row.ref.routeName === name)) return { profileNotFound: true }
  if (!legal.includes(name)) {
    const landing = winningRow(rows, name, allowed)
    const reason = landing === undefined ? 'withdrawn' : 'modality_mismatch'
    return { notLegalTarget: { because: [reason] } }
  }
  return undefined
}

function selectionReceipt(
  raw: unknown,
  operation: Operation,
  name: string,
): SessionSelectModelResult {
  const receipt = settlementAppendReceipt(raw, 1)
  if (receipt === null || ('failure' in receipt && receipt.failure === 'unavailable')) {
    operation.unknownWrite = true
    return unavailable()
  }
  if ('failure' in receipt) return unavailable()
  return { selected: name }
}

type CredentialPresence = Exclude<
  Awaited<ReturnType<SessionModelSelectionInput['catalog']['credentialPresent']>>,
  { readonly failure: unknown }
>
function validCredentialPresence(
  presence: CredentialPresence,
  winner: ProfileRow,
  tenant: TenantId,
) {
  if (presence.present !== true && presence.present !== false) return false
  if (
    presence.present &&
    (presence.scope.layer === 'factory'
      ? winner.ref.origin !== 'official'
      : presence.scope.layer !== 'tenant' || !tenantIdEquals(presence.scope.tenant, tenant))
  )
    return false
  return true
}

function currentModelLock(evaluated: {
  root: string
  evaluation: EffectiveAssembly
}): RouteName | null | undefined {
  const values = evaluated.evaluation.values.filter(
    value =>
      value.item === 'model' && capabilityCanonicalString(value.capability) === evaluated.root,
  )
  if (values.length > 1) return undefined
  const model = values[0]
  if (model !== undefined && !route(model.value)) return undefined
  const lock =
    model !== undefined && model.lockedAt !== undefined && model.lockedAt !== 'session'
      ? model.value
      : null
  if (lock !== null && !route(lock)) return undefined
  return lock
}

/** RT5 S9–S14/S24–S27/S66. No initial selection, history substitution, or provider ownership. */
export function createSessionModelSelection(
  input: SessionModelSelectionInput,
): SessionModelSelection {
  const binding = Object.freeze({
    ...input.binding,
    tenant: Object.freeze({ ...input.binding.tenant }),
    currentGeneration: input.binding.currentGeneration.bind(input.binding),
    log: Object.freeze({
      append: input.binding.log.append.bind(input.binding.log),
      readSince: input.binding.log.readSince.bind(input.binding.log),
      readByKey: input.binding.log.readByKey.bind(input.binding.log),
    }),
  })
  const owner = Object.freeze({
    admission: input.owner.admission.bind(input.owner),
    acquire: input.owner.acquire.bind(input.owner),
  })
  const concurrent = captureSelectionJson(input.concurrent)
  if (
    !isNonNegativeJsonInteger(concurrent) ||
    ExactDecimal.from(concurrent).compare(ExactDecimal.from(0)) <= 0
  )
    throw new TypeError('Invalid session selection concurrency')
  const limit = concurrent
  const holdingTenant = input.sessionTenancy.holdingTenant.bind(input.sessionTenancy)
  const listProfiles = input.catalog.listProfiles.bind(input.catalog)
  const credentialPresent = input.catalog.credentialPresent.bind(input.catalog)
  const readInputs = input.currentEvaluationInputs.read.bind(input.currentEvaluationInputs)
  const projection = input.projection,
    compatible = input.compatible,
    now = input.now
  const diagnostic = input.diagnostic,
    onDiagnosticFailure = input.onDiagnosticFailure
  let closed = false
  let closing: ReturnType<SessionModelSelection['close']> | undefined
  const live = new Set<Operation>()
  // An unknown command result is distinct from a registration still owning physical work.
  const unknown = new Set<Operation>()
  const unreleased = new Set<Operation>()
  function emit(
    stage: SessionSelectionDiagnostic['stage'],
    outcome: SessionSelectionDiagnostic['outcome'],
  ) {
    try {
      diagnostic({
        kind: 'session_model_selection',
        session: binding.session,
        tenant: binding.tenant,
        stage,
        outcome,
      })
    } catch {
      try {
        onDiagnosticFailure()
      } catch {
        /* Optional diagnostics cannot change durable facts. */
      }
    }
  }
  function requestStop(task: SettlementTask<unknown>) {
    try {
      task.requestStop()
    } catch {
      emit('close', 'unavailable')
    }
  }
  function current(operation: Operation): boolean {
    return (
      !closed &&
      !operation.stopping &&
      owner.admission() === 'open' &&
      settlementGenerationCurrent(binding)
    )
  }
  function finishOperation(operation: Operation, stopped: readonly boolean[], release: () => void) {
    const cleanupFailed = stopped.some(fulfilled => !fulfilled)
    live.delete(operation)
    if (operation.unknownWrite || cleanupFailed) unknown.add(operation)
    if (cleanupFailed) unreleased.add(operation)
    else {
      try {
        release()
      } catch {
        unknown.add(operation)
        unreleased.add(operation)
        emit('close', 'unavailable')
      }
    }
    if (cleanupFailed) emit('close', 'unavailable')
    operation.finish()
  }
  async function run<T extends object>(
    stage: SessionSelectionDiagnostic['stage'],
    work: (operation: Operation) => Promise<T>,
  ): Promise<T | { readonly unavailable: true }> {
    if (closed || owner.admission() !== 'open' || !settlementGenerationCurrent(binding))
      return unavailable()
    const acquired = owner.acquire(limit)
    if ('unavailable' in acquired) return unavailable()
    let finish: (() => void) | undefined
    const drained = new Promise<void>(resolve => {
      finish = resolve
    })
    const operation: Operation = {
      registration: acquired.registration,
      tasks: new Map(),
      unknownWrite: false,
      stopping: false,
      drained,
      finish() {
        finish?.()
      },
    }
    const original = acquired.registration
    const release = original.release.bind(original)
    const tracked: SettlementRegistration = {
      start(kind, effect) {
        const task = original.start(kind, effect)
        operation.tasks.set(
          task,
          task.stopped.then(
            () => true,
            () => false,
          ),
        )
        if (operation.stopping) requestStop(task)
        return task
      },
      release,
    }
    // One mutable operation identity is retained by both close and the command.
    operation.registration = tracked
    live.add(operation)
    try {
      const result = await work(operation)
      emit(stage, operationOutcome(result))
      return result
    } catch {
      emit(stage, 'unavailable')
      return unavailable()
    } finally {
      // Completion and actual stop are independent: the finished command asks for the stop of
      // every task it started before waiting for the proof, or it may wait on itself forever.
      for (const task of operation.tasks.keys()) requestStop(task)
      const stopped = await Promise.all(operation.tasks.values())
      finishOperation(operation, stopped, release)
    }
  }

  async function prefix(operation: Operation) {
    const received = await readSettlementPrefix({ binding, registration: operation.registration })
    if ('unavailable' in received || !current(operation)) return unavailable()
    let selected: RouteName | null = null
    for (const entry of received.prefix.entries) {
      const declared = declaresModelLog(entry)
      if (!declared) continue
      const envelope = currentModelEnvelope(entry.payload)
      if (envelope === undefined) return unavailable()
      if (envelope.category !== 'record') continue
      const recognized = inspectModelLogEntry({
        session: binding.session,
        tenant: binding.tenant,
        entry,
        purpose: { kind: 'record' },
        messagePrefix: null,
      })
      if ('invalidValue' in recognized) return unavailable()
      const record = recognized.ok.captured.record
      if (record?.kind === 'model_selection_changed') {
        if (entry.run !== undefined || entry.attempt !== undefined) return unavailable()
        selected = record.routeName
      }
    }
    return { prefix: received.prefix, selected }
  }
  async function rows(
    operation: Operation,
  ): Promise<
    | { readonly rows: readonly ProfileRow[]; readonly allowed: readonly RouteName[] }
    | { readonly unavailable: true }
  > {
    const holding = await operation.registration.start(
      'read',
      async () => await holdingTenant(binding.session),
    ).completion
    if (
      !('tenant' in holding) ||
      !tenantIdEquals(holding.tenant, binding.tenant) ||
      !current(operation)
    )
      return unavailable()
    const result = await operation.registration.start(
      'read',
      async () => await listProfiles(holding.tenant),
    ).completion
    if (!Array.isArray(result) || !current(operation)) return unavailable()
    // Pure selection owns and validates the actual rows before any asynchronous projection.
    const captured = captureSelectionJson(result)
    if (!profileRows(captured)) return unavailable()
    const ownedRows = captured
    if (
      ownedRows.some(
        row =>
          row.ref.origin === 'custom' &&
          (row.ref.scope.layer === 'tenant'
            ? !tenantIdEquals(row.ref.scope.tenant, binding.tenant)
            : row.ref.scope.organization !== binding.tenant.organization),
      )
    )
      return unavailable()
    const validation = effectiveModel(
      { known: null },
      { known: null },
      { known: ownedRows },
      { known: [...new Set(ownedRows.map(row => row.ref.routeName))] },
    )
    if ('invalidInput' in validation) return unavailable()
    return {
      rows: ownedRows,
      allowed: Object.freeze([...new Set(ownedRows.map(row => row.ref.routeName))]),
    }
  }
  async function evaluation(operation: Operation) {
    const currentInputs = await operation.registration.start(
      'read',
      async () => await readInputs(binding.session, binding.tenant),
    ).completion
    if (
      !('input' in currentInputs) ||
      !current(operation) ||
      !tenantIdEquals(currentInputs.input.tenant, binding.tenant) ||
      currentInputs.input.standing.standing !== 'effective'
    )
      return unavailable()
    const evaluated = evaluate(currentInputs.input)
    if (!('ok' in evaluated)) return unavailable()
    return {
      root: capabilityCanonicalString(currentInputs.input.root.definition),
      evaluation: evaluated.ok,
    }
  }
  async function legal(operation: Operation) {
    const catalog = await rows(operation)
    if ('unavailable' in catalog) return catalog
    const evaluated = await evaluation(operation)
    if ('unavailable' in evaluated) return evaluated
    const history = await prefix(operation)
    if ('unavailable' in history) return history
    const projected: SelectionProjection = await operation.registration.start(
      'read',
      async () => await projection(history.prefix),
    ).completion
    if (!current(operation)) return unavailable()
    const result = legalTargets(
      { known: catalog.rows },
      { known: catalog.allowed },
      projected,
      compatible,
    )
    return { catalog, history, projected, result }
  }
  async function selectionEntry(name: string, operation: Operation) {
    const captured = captureModelLogValue({
      category: 'record',
      input: {
        kind: 'value',
        value: { kind: 'model_selection_changed', routeName: name, at: await now() },
      },
    })
    if ('invalidValue' in captured || !current(operation)) return undefined
    const entry = prepareModelLogEntry({
      session: binding.session,
      shell: { tenant: binding.tenant },
      captured: captured.ok,
      purpose: { kind: 'record' },
      messagePrefix: null,
    })
    return 'invalidValue' in entry ? undefined : entry
  }
  return Object.freeze({
    async legalTargets() {
      return await run('legalTargets', async operation => {
        const facts = await legal(operation)
        return 'unavailable' in facts ? facts : facts.result
      })
    },
    async selectModel(value: unknown): Promise<SessionSelectModelResult> {
      if (typeof value !== 'string') return { invalidInput: { reason: 'malformed' } }
      const judged = judgeModelProfileDocument('ModelProfileRef', {
        origin: 'official',
        routeName: value,
      })
      if ('rejected' in judged) return { invalidInput: { reason: judged.rejected } }
      const name = value
      return await run('selectModel', async operation => {
        if (unknown.size !== 0) return unavailable()
        const facts = await legal(operation)
        if ('unavailable' in facts) return facts
        if (!('ok' in facts.result)) return facts.result
        const rejection = targetRejection(
          name,
          facts.catalog.rows,
          facts.catalog.allowed,
          facts.result.ok,
        )
        if (rejection !== undefined) return rejection
        if (facts.history.selected === name) return { selected: name }
        const entry = await selectionEntry(name, operation)
        if (entry === undefined) return unavailable()
        let raw: unknown
        let started = false
        const task = operation.registration.start('append', async () => {
          if (!current(operation)) return undefined
          started = true
          return await binding.log.append(
            binding.session,
            [entry.ok],
            { kind: 'unfenced' },
            { kind: 'unconditional' },
          )
        })
        try {
          raw = await task.completion
        } catch {
          operation.unknownWrite = started
          return unavailable()
        }
        if (!started) return unavailable()
        return selectionReceipt(raw, operation, name)
      })
    },
    async displayList() {
      return await run('displayList', async operation => {
        const facts = await legal(operation)
        if ('unavailable' in facts) return facts
        if (!('ok' in facts.result)) return facts.result
        const selected = facts.history.selected
        if (selected === null) return unavailable()
        if (!facts.catalog.rows.some(row => row.ref.routeName === selected))
          return { profileNotFound: true } as const
        const credentials: RowCredentialFact[] = []
        for (const name of new Set([...facts.result.ok, selected])) {
          const winner = winningRow(facts.catalog.rows, name, facts.catalog.allowed)
          // With no winner S12 judges only withdrawal; credentials cannot help it.
          if (winner === undefined) continue
          const presence = await operation.registration.start(
            'read',
            async () => await credentialPresent(binding.tenant, winner.ref.origin),
          ).completion
          if ('failure' in presence || !current(operation)) return unavailable()
          if (!validCredentialPresence(presence, winner, binding.tenant)) return unavailable()
          credentials.push({ ref: winner.ref, present: { known: presence.present } })
        }
        return displayList(
          { known: facts.catalog.rows },
          { known: facts.catalog.allowed },
          facts.projected,
          compatible,
          { known: selected },
          { known: credentials },
        )
      })
    },
    async effectiveModel(): Promise<SessionEffectiveModelResult> {
      return await run('effectiveModel', async operation => {
        const catalog = await rows(operation)
        if ('unavailable' in catalog) return catalog
        const history = await prefix(operation)
        if ('unavailable' in history || history.selected === null) return unavailable()
        const evaluated = await evaluation(operation)
        if ('unavailable' in evaluated) return evaluated
        const lock = currentModelLock(evaluated)
        if (lock === undefined) return unavailable()
        const result = effectiveModel(
          { known: history.selected },
          { known: lock },
          { known: catalog.rows },
          { known: catalog.allowed },
        )
        return 'ok' in result ? { ok: result.ok, evaluation: evaluated.evaluation } : result
      })
    },
    close() {
      if (closing !== undefined) return closing
      closed = true
      const operations = [...live]
      for (const operation of operations) {
        operation.stopping = true
        for (const task of operation.tasks.keys()) requestStop(task)
      }
      closing = (async () => {
        await Promise.all(operations.map(operation => operation.drained))
        const result = unreleased.size === 0 ? ({ released: true } as const) : unavailable()
        emit('close', 'released' in result ? 'success' : 'unavailable')
        if ('unavailable' in result) closing = undefined
        return result
      })()
      return closing
    },
  })
}
