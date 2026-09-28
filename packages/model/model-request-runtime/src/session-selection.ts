import { evaluate } from '@omne-harness-lite/asset-evaluation'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { isNonNegativeJsonInteger } from '@omne-harness-lite/content-blocks'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { judgeModelProfileDocument, type RouteName } from '@omne-harness-lite/model-profile'
import { winningRow, type ProfileRow } from '@omne-harness-lite/model-profile-directory'
import {
  captureModelLogValue,
  decodeModelLogKey,
  inspectModelLogEntry,
  prepareModelLogEntry,
} from './log-codec-v2.ts'
import { effectiveModel, legalTargets } from './selection.ts'
import { captureSelectionJson } from './selection-capture.ts'
import { readSettlementPrefix, settlementGenerationCurrent } from './settlement-prefix.ts'
import { settlementAppendReceipt } from './settlement-receipt.ts'
import type { SelectionProjection } from './selection-types.ts'
import type { SettlementRegistration, SettlementTask } from './settlement-types.ts'
import type {
  SessionEffectiveModelResult,
  SessionModelSelection,
  SessionModelSelectionInput,
  SessionSelectModelResult,
  SessionSelectionDiagnostic,
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

/** RT5 S9/S10/S11/S26/S27. No initial selection, history substitution, or provider ownership. */
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
  const readInputs = input.currentEvaluationInputs.read.bind(input.currentEvaluationInputs)
  const projection = input.projection,
    compatible = input.compatible,
    now = input.now
  const diagnostic = input.diagnostic,
    onDiagnosticFailure = input.onDiagnosticFailure
  let closed = false
  let closing: ReturnType<SessionModelSelection['close']> | undefined
  const live = new Set<Operation>()
  const unknown = new Set<Operation>()
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
      emit(
        stage,
        'unavailable' in result
          ? 'unavailable'
          : 'ok' in result || 'selected' in result
            ? 'success'
            : 'rejected',
      )
      return result
    } catch {
      emit(stage, 'unavailable')
      return unavailable()
    } finally {
      const stopped = await Promise.all(operation.tasks.values())
      const cleanupFailed = stopped.some(fulfilled => !fulfilled)
      live.delete(operation)
      if (operation.unknownWrite || cleanupFailed) unknown.add(operation)
      else {
        try {
          release()
        } catch {
          unknown.add(operation)
          emit('close', 'unavailable')
        }
      }
      if (cleanupFailed) emit('close', 'unavailable')
      operation.finish()
    }
  }

  async function prefix(operation: Operation) {
    const received = await readSettlementPrefix({ binding, registration: operation.registration })
    if ('unavailable' in received || !current(operation)) return unavailable()
    let selected: RouteName | null = null
    for (const entry of received.prefix.entries) {
      const declared = entry.readKeys.some(key => 'ok' in decodeModelLogKey(key))
      if (!declared) continue
      if (
        !object(entry.payload) ||
        (entry.payload.format !== 'mrr/1' && entry.payload.format !== 'mrr/2') ||
        !['record', 'message', 'response'].includes(String(entry.payload.category))
      )
        return unavailable()
      if (entry.payload.category !== 'record') continue
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
  async function legal(operation: Operation) {
    const catalog = await rows(operation)
    if ('unavailable' in catalog) return catalog
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
    return { catalog, history, result }
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
        if (!facts.catalog.rows.some(row => row.ref.routeName === name))
          return { profileNotFound: true }
        if (!facts.result.ok.includes(name)) {
          const landing = winningRow(facts.catalog.rows, name, facts.catalog.allowed)
          const reason = landing === undefined ? 'withdrawn' : 'modality_mismatch'
          return { notLegalTarget: { because: [reason] } }
        }
        if (facts.history.selected === name) return { selected: name }
        const captured = captureModelLogValue({
          category: 'record',
          input: {
            kind: 'value',
            value: { kind: 'model_selection_changed', routeName: name, at: now() },
          },
        })
        if ('invalidValue' in captured || !current(operation)) return unavailable()
        const entry = prepareModelLogEntry({
          session: binding.session,
          shell: { tenant: binding.tenant },
          captured: captured.ok,
          purpose: { kind: 'record' },
          messagePrefix: null,
        })
        if ('invalidValue' in entry) return unavailable()
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
        const receipt = settlementAppendReceipt(raw, 1)
        if (receipt === null || ('failure' in receipt && receipt.failure === 'unavailable')) {
          operation.unknownWrite = true
          return unavailable()
        }
        if ('failure' in receipt) return unavailable()
        return { selected: name }
      })
    },
    async effectiveModel(): Promise<SessionEffectiveModelResult> {
      return await run('effectiveModel', async operation => {
        const catalog = await rows(operation)
        if ('unavailable' in catalog) return catalog
        const history = await prefix(operation)
        if ('unavailable' in history || history.selected === null) return unavailable()
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
        const root = capabilityCanonicalString(currentInputs.input.root.definition)
        const evaluated = evaluate(currentInputs.input)
        if (!('ok' in evaluated)) return unavailable()
        const values = evaluated.ok.values.filter(
          value => value.item === 'model' && capabilityCanonicalString(value.capability) === root,
        )
        if (values.length > 1) return unavailable()
        const model = values[0]
        if (model !== undefined && !route(model.value)) return unavailable()
        const lock =
          model !== undefined && model.lockedAt !== undefined && model.lockedAt !== 'session'
            ? model.value
            : null
        if (lock !== null && !route(lock)) return unavailable()
        const result = effectiveModel(
          { known: history.selected },
          { known: lock },
          { known: catalog.rows },
          { known: catalog.allowed },
        )
        return 'ok' in result ? { ok: result.ok, evaluation: evaluated.ok } : result
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
        const result = unknown.size === 0 ? ({ released: true } as const) : unavailable()
        emit('close', 'released' in result ? 'success' : 'unavailable')
        return result
      })()
      return closing
    },
  })
}
