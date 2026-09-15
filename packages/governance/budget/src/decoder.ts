import { createHash } from 'node:crypto'
import type { CodecLimits, CommitEnvelope, Causality, Principal } from '@omne-harness-lite/records'
import { decodeLine as decodeJournalLine, encodeEnvelope } from '@omne-harness-lite/records'
import type {
  DataTypes,
  JsonObject,
  JsonValue,
  Money,
  OperationRef,
} from '@omne-harness-lite/work-data'
import { canonicalJson, equalJson, parseData, parseJson } from '@omne-harness-lite/work-data'
import type { EvidenceRef } from '@omne-harness-lite/tenant'
import { validateMoney } from './money.ts'
import { accepted, issueOf, rejectedWith } from './result.ts'
import type { BudgetIssueCode } from './result.ts'
import type { Checked, ValidationIssue } from '@omne-harness-lite/work-data'
import type {
  Allocation,
  Budget,
  BudgetRecord,
  BudgetScope,
  ChargeAttempt,
  CostSource,
  DecodedBudgetEnvelope,
  MeterFact,
  MeterFactRef,
  Period,
  Quantity,
  SourcePosture,
} from './types.ts'

class ValidationFailure extends Error {
  constructor(readonly issue: ValidationIssue) {
    super(issue.message)
  }
}

function problem(code: BudgetIssueCode, message: string, path: string): never {
  throw new ValidationFailure(issueOf(code, message, path))
}

function pointer(path: string, segment: string | number): string {
  return `${path}/${String(segment).replaceAll('~', '~0').replaceAll('/', '~1')}`
}

function objectValue(
  value: JsonValue,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    problem('shape', 'must be an object', path)
  }
  const allowed = new Set([...required, ...optional])
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) problem('shape', 'unknown field', pointer(path, key))
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key))
      problem('shape', 'required field is missing', pointer(path, key))
  }
  return value as JsonObject
}

function arrayValue(value: JsonValue, path: string): readonly JsonValue[] {
  if (!Array.isArray(value)) problem('shape', 'must be an array', path)
  return value
}

function stringValue(value: JsonValue, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    problem('shape', 'must be a non-empty string', path)
  }
  return value
}

function nullableString(value: JsonValue, path: string): string | null {
  return value === null ? null : stringValue(value, path)
}

function booleanValue(value: JsonValue, path: string): boolean {
  if (typeof value !== 'boolean') problem('shape', 'must be a boolean', path)
  return value
}

function literal<T extends string>(value: JsonValue, expected: T, path: string): T {
  if (value !== expected) problem('shape', `must equal ${JSON.stringify(expected)}`, path)
  return expected
}

function oneOf<T extends string>(value: JsonValue, choices: readonly T[], path: string): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) {
    problem('shape', `must be one of ${choices.join(', ')}`, path)
  }
  return value as T
}

function counter(value: JsonValue, path: string, positive = false): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    problem('revision', 'must be a canonical non-negative decimal counter', path)
  }
  if (positive && value === '0') problem('revision', 'must be greater than zero', path)
  return value
}

function optionalCounter(value: JsonValue, path: string): string | null {
  return value === null ? null : counter(value, path, true)
}

function digestValue(value: JsonValue, path: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    problem('shape', 'must be a lowercase SHA-256 digest', path)
  }
  return value
}

function shared<K extends keyof DataTypes>(
  name: K,
  value: JsonValue,
  limits: CodecLimits,
  path: string,
): DataTypes[K] {
  const result = parseData(name, value, limits)
  if (!result.ok) {
    const issue = result.issues[0]
    problem('shape', issue?.message ?? `invalid ${name}`, `${path}${issue?.path ?? ''}`)
  }
  return result.value
}

function moneyValue(value: JsonValue, path: string, nonNegative = false, currency?: string): Money {
  const checked = validateMoney(value, { nonNegative })
  if (!checked.ok) {
    const issue = checked.issues[0]
    throw new ValidationFailure(
      issue === undefined
        ? issueOf('money', 'invalid Money', path)
        : Object.freeze({ ...issue, path: `${path}${issue.path}` }),
    )
  }
  if (currency !== undefined && checked.value.currency !== currency) {
    problem('currency', `must use ${currency}`, pointer(path, 'currency'))
  }
  return checked.value
}

function stringArray(value: JsonValue, path: string): readonly string[] {
  const values = arrayValue(value, path).map((item, index) =>
    stringValue(item, pointer(path, index)),
  )
  if (new Set(values).size !== values.length) problem('shape', 'values must be unique', path)
  return Object.freeze(values)
}

function instant(value: JsonValue, path: string): string {
  const text = stringValue(value, path)
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(text) ||
    !Number.isFinite(Date.parse(text))
  ) {
    problem('shape', 'must be a valid UTC instant', path)
  }
  return text
}

function evidence(value: JsonValue, path: string): EvidenceRef {
  const object = objectValue(value, path, ['authority', 'kind', 'id', 'revision'])
  return Object.freeze({
    authority: stringValue(object.authority as JsonValue, pointer(path, 'authority')),
    kind: stringValue(object.kind as JsonValue, pointer(path, 'kind')),
    id: stringValue(object.id as JsonValue, pointer(path, 'id')),
    revision: stringValue(object.revision as JsonValue, pointer(path, 'revision')),
  })
}

function evidences(value: JsonValue, path: string, required = false): readonly EvidenceRef[] {
  const items = arrayValue(value, path).map((item, index) => evidence(item, pointer(path, index)))
  if (required && items.length === 0) problem('shape', 'must contain evidence', path)
  return Object.freeze(items)
}

function period(value: JsonValue, path: string): Period {
  const object = objectValue(value, path, ['periodId', 'startsAt', 'endsAt'])
  const startsAt = instant(object.startsAt as JsonValue, pointer(path, 'startsAt'))
  const endsAt =
    object.endsAt === null ? null : instant(object.endsAt as JsonValue, pointer(path, 'endsAt'))
  if (endsAt !== null && Date.parse(endsAt) <= Date.parse(startsAt)) {
    problem('shape', 'endsAt must be later than startsAt', pointer(path, 'endsAt'))
  }
  return Object.freeze({
    periodId: stringValue(object.periodId as JsonValue, pointer(path, 'periodId')),
    startsAt,
    endsAt,
  })
}

function budgetScope(value: JsonValue, limits: CodecLimits, path: string): BudgetScope {
  const initial = objectValue(value, path, ['kind'], ['tenantId', 'definition', 'session', 'run'])
  if (initial.kind === 'tenant') {
    const object = objectValue(value, path, ['kind', 'tenantId'])
    return Object.freeze({
      kind: 'tenant',
      tenantId: stringValue(object.tenantId as JsonValue, pointer(path, 'tenantId')),
    })
  }
  if (initial.kind === 'definition') {
    const object = objectValue(value, path, ['kind', 'tenantId', 'definition'])
    return Object.freeze({
      kind: 'definition',
      tenantId: stringValue(object.tenantId as JsonValue, pointer(path, 'tenantId')),
      definition: shared(
        'DefinitionRef',
        object.definition as JsonValue,
        limits,
        pointer(path, 'definition'),
      ),
    })
  }
  if (initial.kind === 'session') {
    const object = objectValue(value, path, ['kind', 'session'])
    return Object.freeze({
      kind: 'session',
      session: shared('SessionRef', object.session as JsonValue, limits, pointer(path, 'session')),
    })
  }
  if (initial.kind === 'run') {
    const object = objectValue(value, path, ['kind', 'run'])
    return Object.freeze({
      kind: 'run',
      run: shared('RunRef', object.run as JsonValue, limits, pointer(path, 'run')),
    })
  }
  problem('shape', 'unknown budget scope kind', pointer(path, 'kind'))
}

function scopeTenant(scope: BudgetScope): string {
  if (scope.kind === 'tenant' || scope.kind === 'definition') return scope.tenantId
  return scope.kind === 'session' ? scope.session.tenantId : scope.run.session.tenantId
}

function budgetValue(value: JsonValue, limits: CodecLimits, path: string): Budget {
  const object = objectValue(value, path, [
    'budgetId',
    'tenantId',
    'scope',
    'currency',
    'scale',
    'limit',
    'mode',
    'thresholds',
    'period',
    'revision',
  ])
  const tenantId = stringValue(object.tenantId as JsonValue, pointer(path, 'tenantId'))
  const currency = stringValue(object.currency as JsonValue, pointer(path, 'currency'))
  const scope = budgetScope(object.scope as JsonValue, limits, pointer(path, 'scope'))
  if (scopeTenant(scope) !== tenantId)
    problem('ownership', 'budget scope tenant must match budget tenant', pointer(path, 'scope'))
  if (!Number.isSafeInteger(object.scale) || (object.scale as number) < 0) {
    problem('shape', 'scale must be a non-negative safe integer', pointer(path, 'scale'))
  }
  const limit =
    object.limit === null
      ? null
      : moneyValue(object.limit as JsonValue, pointer(path, 'limit'), true, currency)
  const mode = oneOf(
    object.mode as JsonValue,
    ['observe', 'soft', 'hard'] as const,
    pointer(path, 'mode'),
  )
  if (mode !== 'observe' && limit === null)
    problem('shape', `${mode} budget requires a limit`, pointer(path, 'limit'))
  const thresholds = arrayValue(object.thresholds as JsonValue, pointer(path, 'thresholds')).map(
    (item, index) => moneyValue(item, pointer(pointer(path, 'thresholds'), index), true, currency),
  )
  return Object.freeze({
    budgetId: stringValue(object.budgetId as JsonValue, pointer(path, 'budgetId')),
    tenantId,
    scope,
    currency,
    scale: object.scale as number,
    limit,
    mode,
    thresholds: Object.freeze(thresholds),
    period: period(object.period as JsonValue, pointer(path, 'period')),
    revision: counter(object.revision as JsonValue, pointer(path, 'revision'), true),
  })
}

function costSource(value: JsonValue, path: string): CostSource {
  const object = objectValue(value, path, [
    'sourceId',
    'revision',
    'providerId',
    'currency',
    'priceEvidence',
    'bound',
    'kind',
  ])
  const currency = stringValue(object.currency as JsonValue, pointer(path, 'currency'))
  const boundPath = pointer(path, 'bound')
  const initialBound = objectValue(
    object.bound as JsonValue,
    boundPath,
    ['kind'],
    ['maximum', 'guarantee', 'knownReserve'],
  )
  const bound =
    initialBound.kind === 'finite'
      ? (() => {
          const finite = objectValue(object.bound as JsonValue, boundPath, [
            'kind',
            'maximum',
            'guarantee',
          ])
          return Object.freeze({
            kind: 'finite' as const,
            maximum: moneyValue(
              finite.maximum as JsonValue,
              pointer(boundPath, 'maximum'),
              true,
              currency,
            ),
            guarantee: evidences(
              finite.guarantee as JsonValue,
              pointer(boundPath, 'guarantee'),
              true,
            ),
          })
        })()
      : initialBound.kind === 'unknown'
        ? (() => {
            const unknown = objectValue(object.bound as JsonValue, boundPath, [
              'kind',
              'knownReserve',
            ])
            return Object.freeze({
              kind: 'unknown' as const,
              knownReserve: moneyValue(
                unknown.knownReserve as JsonValue,
                pointer(boundPath, 'knownReserve'),
                true,
                currency,
              ),
            })
          })()
        : problem('shape', 'unknown source bound kind', pointer(boundPath, 'kind'))
  return Object.freeze({
    sourceId: stringValue(object.sourceId as JsonValue, pointer(path, 'sourceId')),
    revision: counter(object.revision as JsonValue, pointer(path, 'revision'), true),
    providerId: stringValue(object.providerId as JsonValue, pointer(path, 'providerId')),
    currency,
    priceEvidence: evidences(
      object.priceEvidence as JsonValue,
      pointer(path, 'priceEvidence'),
      true,
    ),
    bound,
    kind: oneOf(object.kind as JsonValue, ['tool', 'model'] as const, pointer(path, 'kind')),
  })
}

function allocation(value: JsonValue, path: string): Allocation {
  const object = objectValue(value, path, ['budgetId', 'budgetRevision', 'periodId', 'reserved'])
  return Object.freeze({
    budgetId: stringValue(object.budgetId as JsonValue, pointer(path, 'budgetId')),
    budgetRevision: counter(
      object.budgetRevision as JsonValue,
      pointer(path, 'budgetRevision'),
      true,
    ),
    periodId: stringValue(object.periodId as JsonValue, pointer(path, 'periodId')),
    reserved: moneyValue(object.reserved as JsonValue, pointer(path, 'reserved'), true),
  })
}

function allocations(value: JsonValue, path: string, required = true): readonly Allocation[] {
  const items = arrayValue(value, path).map((item, index) => allocation(item, pointer(path, index)))
  if (required && items.length === 0) problem('shape', 'must contain an allocation', path)
  const keys = items.map(item => item.budgetId)
  if (new Set(keys).size !== keys.length)
    problem('shape', 'budget allocations must be unique', path)
  return Object.freeze(items)
}

function principal(value: JsonValue, limits: CodecLimits, path: string): Principal {
  const initial = objectValue(value, path, ['kind'], ['user', 'systemId'])
  if (initial.kind === 'user') {
    const object = objectValue(value, path, ['kind', 'user'])
    return Object.freeze({
      kind: 'user',
      user: shared('UserRef', object.user as JsonValue, limits, pointer(path, 'user')),
    })
  }
  if (initial.kind === 'system') {
    const object = objectValue(value, path, ['kind', 'systemId'])
    return Object.freeze({
      kind: 'system',
      systemId: stringValue(object.systemId as JsonValue, pointer(path, 'systemId')),
    })
  }
  problem('shape', 'unknown principal kind', pointer(path, 'kind'))
}

function causalityValue(value: JsonValue, limits: CodecLimits, path: string): Causality {
  const keys = [
    'parentOperation',
    'initiator',
    'session',
    'work',
    'call',
    'request',
    'agent',
    'definition',
    'binding',
  ] as const
  const object = objectValue(value, path, [], keys)
  const result: {
    parentOperation?: OperationRef
    initiator?: Principal
    session?: DataTypes['SessionRef']
    work?: DataTypes['WorkOwner']
    call?: DataTypes['CallRef']
    request?: DataTypes['RequestRef']
    agent?: DataTypes['AgentRef']
    definition?: DataTypes['DefinitionVersion']
    binding?: DataTypes['Binding']
  } = {}
  if (object.parentOperation !== undefined)
    result.parentOperation = shared(
      'OperationRef',
      object.parentOperation,
      limits,
      pointer(path, 'parentOperation'),
    )
  if (object.initiator !== undefined)
    result.initiator = principal(object.initiator, limits, pointer(path, 'initiator'))
  if (object.session !== undefined)
    result.session = shared('SessionRef', object.session, limits, pointer(path, 'session'))
  if (object.work !== undefined)
    result.work = shared('WorkOwner', object.work, limits, pointer(path, 'work'))
  if (object.call !== undefined)
    result.call = shared('CallRef', object.call, limits, pointer(path, 'call'))
  if (object.request !== undefined)
    result.request = shared('RequestRef', object.request, limits, pointer(path, 'request'))
  if (object.agent !== undefined)
    result.agent = shared('AgentRef', object.agent, limits, pointer(path, 'agent'))
  if (object.definition !== undefined)
    result.definition = shared(
      'DefinitionVersion',
      object.definition,
      limits,
      pointer(path, 'definition'),
    )
  if (object.binding !== undefined)
    result.binding = shared('Binding', object.binding, limits, pointer(path, 'binding'))
  return Object.freeze(result)
}

function tenantOfWork(owner: DataTypes['WorkOwner']): string {
  return 'tenantId' in owner ? owner.tenantId : owner.run.session.tenantId
}

function validateCausalityTenant(causality: Causality, tenantId: string, path: string): void {
  const tenants = [
    causality.session?.tenantId,
    causality.work === undefined ? undefined : tenantOfWork(causality.work),
    causality.call === undefined ? undefined : tenantOfWork(causality.call.owner),
    causality.request?.tenantId,
    causality.agent?.tenantId,
    causality.binding?.environment.tenantId,
  ]
  if (tenants.some(item => item !== undefined && item !== tenantId)) {
    problem('causality', 'causality contains a different tenant', path)
  }
}

function chargeAttempt(value: JsonValue, limits: CodecLimits, path: string): ChargeAttempt {
  const object = objectValue(value, path, [
    'chargeAttemptId',
    'tenantId',
    'owner',
    'session',
    'run',
    'subjectDefinition',
    'target',
    'source',
    'causality',
    'allocations',
    'phase',
    'uncertainty',
  ])
  const tenantId = stringValue(object.tenantId as JsonValue, pointer(path, 'tenantId'))
  const owner = shared('WorkOwner', object.owner as JsonValue, limits, pointer(path, 'owner'))
  if (tenantOfWork(owner) !== tenantId)
    problem('ownership', 'work owner tenant must match attempt tenant', pointer(path, 'owner'))
  const session =
    object.session === null
      ? null
      : shared('SessionRef', object.session as JsonValue, limits, pointer(path, 'session'))
  const run =
    object.run === null
      ? null
      : shared('RunRef', object.run as JsonValue, limits, pointer(path, 'run'))
  if (session !== null && session.tenantId !== tenantId)
    problem('ownership', 'session tenant must match attempt tenant', pointer(path, 'session'))
  if (run !== null && run.session.tenantId !== tenantId)
    problem('ownership', 'run tenant must match attempt tenant', pointer(path, 'run'))
  if (
    run !== null &&
    (session === null || !equalJson(run.session as JsonValue, session as JsonValue))
  ) {
    problem('ownership', 'run session must equal attempt session', pointer(path, 'run'))
  }
  if (
    'run' in owner &&
    (session === null || run === null || !equalJson(owner.run as JsonValue, run as JsonValue))
  ) {
    problem('ownership', 'Step owner requires its original session and run', pointer(path, 'owner'))
  }
  const targetPath = pointer(path, 'target')
  const targetObject = objectValue(
    object.target as JsonValue,
    targetPath,
    ['kind'],
    ['call', 'toolDefinition', 'requestId', 'attemptId'],
  )
  const target =
    targetObject.kind === 'tool'
      ? (() => {
          const tool = objectValue(object.target as JsonValue, targetPath, [
            'kind',
            'call',
            'toolDefinition',
          ])
          const call = shared(
            'CallRef',
            tool.call as JsonValue,
            limits,
            pointer(targetPath, 'call'),
          )
          if (!equalJson(call.owner as JsonValue, owner as JsonValue))
            problem(
              'ownership',
              'tool call owner must equal attempt owner',
              pointer(targetPath, 'call'),
            )
          return Object.freeze({
            kind: 'tool' as const,
            call,
            toolDefinition: shared(
              'DefinitionVersion',
              tool.toolDefinition as JsonValue,
              limits,
              pointer(targetPath, 'toolDefinition'),
            ),
          })
        })()
      : targetObject.kind === 'model'
        ? (() => {
            const model = objectValue(object.target as JsonValue, targetPath, [
              'kind',
              'requestId',
              'attemptId',
            ])
            return Object.freeze({
              kind: 'model' as const,
              requestId: stringValue(
                model.requestId as JsonValue,
                pointer(targetPath, 'requestId'),
              ),
              attemptId: stringValue(
                model.attemptId as JsonValue,
                pointer(targetPath, 'attemptId'),
              ),
            })
          })()
        : problem('shape', 'unknown attempt target kind', pointer(targetPath, 'kind'))
  const source = costSource(object.source as JsonValue, pointer(path, 'source'))
  const attemptAllocations = allocations(
    object.allocations as JsonValue,
    pointer(path, 'allocations'),
  )
  if (attemptAllocations.some(item => item.reserved.currency !== source.currency)) {
    problem(
      'currency',
      'allocation currency must equal source currency',
      pointer(path, 'allocations'),
    )
  }
  const causality = causalityValue(
    object.causality as JsonValue,
    limits,
    pointer(path, 'causality'),
  )
  validateCausalityTenant(causality, tenantId, pointer(path, 'causality'))
  if (causality.work === undefined || !equalJson(causality.work as JsonValue, owner as JsonValue)) {
    problem(
      'causality',
      'attempt causality must identify its work owner',
      pointer(path, 'causality/work'),
    )
  }
  if (
    target.kind === 'tool' &&
    (causality.call === undefined ||
      !equalJson(causality.call as JsonValue, target.call as JsonValue))
  ) {
    problem(
      'causality',
      'tool attempt causality must identify its call',
      pointer(path, 'causality/call'),
    )
  }
  if (
    target.kind === 'model' &&
    (causality.request?.tenantId !== tenantId || causality.request.requestId !== target.requestId)
  ) {
    problem(
      'causality',
      'model attempt causality must identify its request',
      pointer(path, 'causality/request'),
    )
  }
  const uncertainty = oneOf(
    object.uncertainty as JsonValue,
    ['known', 'unknown'] as const,
    pointer(path, 'uncertainty'),
  )
  if ((source.bound.kind === 'unknown') !== (uncertainty === 'unknown')) {
    problem('shape', 'attempt uncertainty must match source bound', pointer(path, 'uncertainty'))
  }
  return Object.freeze({
    chargeAttemptId: stringValue(
      object.chargeAttemptId as JsonValue,
      pointer(path, 'chargeAttemptId'),
    ),
    tenantId,
    owner,
    session,
    run,
    subjectDefinition: shared(
      'DefinitionVersion',
      object.subjectDefinition as JsonValue,
      limits,
      pointer(path, 'subjectDefinition'),
    ),
    target,
    source,
    causality,
    allocations: attemptAllocations,
    phase: oneOf(
      object.phase as JsonValue,
      ['reserved', 'possibly_emitted', 'reconciled', 'released_before_start'] as const,
      pointer(path, 'phase'),
    ),
    uncertainty,
  })
}

function factRef(value: JsonValue, path: string): MeterFactRef {
  const object = objectValue(value, path, ['sourceId', 'externalFactId', 'revision'])
  return Object.freeze({
    sourceId: stringValue(object.sourceId as JsonValue, pointer(path, 'sourceId')),
    externalFactId: stringValue(
      object.externalFactId as JsonValue,
      pointer(path, 'externalFactId'),
    ),
    revision: counter(object.revision as JsonValue, pointer(path, 'revision'), true),
  })
}

function quantity(value: JsonValue, path: string): Quantity {
  const object = objectValue(value, path, ['integer', 'scale', 'unit'])
  if (typeof object.integer !== 'string' || !/^(?:0|-?[1-9][0-9]*)$/.test(object.integer)) {
    problem('shape', 'integer must be canonical', pointer(path, 'integer'))
  }
  if (!Number.isSafeInteger(object.scale) || (object.scale as number) < 0) {
    problem('shape', 'scale must be a non-negative safe integer', pointer(path, 'scale'))
  }
  return Object.freeze({
    integer: object.integer,
    scale: object.scale as number,
    unit: stringValue(object.unit as JsonValue, pointer(path, 'unit')),
  })
}

function meterFact(value: JsonValue, path: string): MeterFact {
  const object = objectValue(value, path, [
    'sourceId',
    'externalFactId',
    'revision',
    'previousRevision',
    'chargeAttemptId',
    'providerRequestId',
    'quality',
    'amount',
    'quantities',
    'completeness',
    'corrects',
    'evidence',
  ])
  const sourceId = stringValue(object.sourceId as JsonValue, pointer(path, 'sourceId'))
  const externalFactId = stringValue(
    object.externalFactId as JsonValue,
    pointer(path, 'externalFactId'),
  )
  const revision = counter(object.revision as JsonValue, pointer(path, 'revision'), true)
  const previousRevision = optionalCounter(
    object.previousRevision as JsonValue,
    pointer(path, 'previousRevision'),
  )
  if (
    (previousRevision === null && revision !== '1') ||
    (previousRevision !== null && BigInt(previousRevision) + 1n !== BigInt(revision))
  ) {
    problem(
      'revision',
      'fact revision must start at 1 and advance exactly from previousRevision',
      pointer(path, 'previousRevision'),
    )
  }
  const quality = oneOf(
    object.quality as JsonValue,
    ['actual', 'estimated', 'unknown'] as const,
    pointer(path, 'quality'),
  )
  const amount =
    object.amount === null ? null : moneyValue(object.amount as JsonValue, pointer(path, 'amount'))
  if ((quality === 'unknown') !== (amount === null)) {
    problem(
      'shape',
      'unknown facts require null amount; known qualities require Money',
      pointer(path, 'amount'),
    )
  }
  const corrects =
    object.corrects === null
      ? null
      : factRef(object.corrects as JsonValue, pointer(path, 'corrects'))
  if (corrects !== null && corrects.sourceId !== sourceId) {
    problem(
      'ownership',
      'a correction must stay within its source',
      pointer(path, 'corrects/sourceId'),
    )
  }
  if (
    corrects !== null &&
    corrects.externalFactId === externalFactId &&
    corrects.revision === revision
  ) {
    problem('transition', 'a fact cannot correct itself', pointer(path, 'corrects'))
  }
  return Object.freeze({
    sourceId,
    externalFactId,
    revision,
    previousRevision,
    chargeAttemptId:
      object.chargeAttemptId === null
        ? null
        : stringValue(object.chargeAttemptId as JsonValue, pointer(path, 'chargeAttemptId')),
    providerRequestId: nullableString(
      object.providerRequestId as JsonValue,
      pointer(path, 'providerRequestId'),
    ),
    quality,
    amount,
    quantities: Object.freeze(
      arrayValue(object.quantities as JsonValue, pointer(path, 'quantities')).map((item, index) =>
        quantity(item, pointer(pointer(path, 'quantities'), index)),
      ),
    ),
    completeness: oneOf(
      object.completeness as JsonValue,
      ['partial', 'final'] as const,
      pointer(path, 'completeness'),
    ),
    corrects,
    evidence: evidences(object.evidence as JsonValue, pointer(path, 'evidence'), true),
  })
}

function sourcePosture(
  value: JsonValue,
  path: string,
): SourcePosture & { previousRevision: string } {
  const object = objectValue(value, path, [
    'tenantId',
    'source',
    'enabled',
    'tenantPostureBudgetId',
    'unknownPermissions',
    'previousRevision',
  ])
  const permissionsPath = pointer(path, 'unknownPermissions')
  const unknownPermissions = arrayValue(
    object.unknownPermissions as JsonValue,
    permissionsPath,
  ).map((item, index) => {
    const itemPath = pointer(permissionsPath, index)
    const permission = objectValue(item, itemPath, ['budgetId', 'allowed'])
    return Object.freeze({
      budgetId: stringValue(permission.budgetId as JsonValue, pointer(itemPath, 'budgetId')),
      allowed: booleanValue(permission.allowed as JsonValue, pointer(itemPath, 'allowed')),
    })
  })
  if (new Set(unknownPermissions.map(item => item.budgetId)).size !== unknownPermissions.length) {
    problem('shape', 'unknown permission budgets must be unique', permissionsPath)
  }
  return Object.freeze({
    tenantId: stringValue(object.tenantId as JsonValue, pointer(path, 'tenantId')),
    source: costSource(object.source as JsonValue, pointer(path, 'source')),
    enabled: booleanValue(object.enabled as JsonValue, pointer(path, 'enabled')),
    tenantPostureBudgetId: stringValue(
      object.tenantPostureBudgetId as JsonValue,
      pointer(path, 'tenantPostureBudgetId'),
    ),
    unknownPermissions: Object.freeze(unknownPermissions),
    previousRevision: counter(
      object.previousRevision as JsonValue,
      pointer(path, 'previousRevision'),
    ),
  })
}

function watermark(
  value: JsonValue,
  path: string,
): { coordinationDomain: string; seq: string; commitId: string | null } {
  const object = objectValue(value, path, ['coordinationDomain', 'seq', 'commitId'])
  return Object.freeze({
    coordinationDomain: stringValue(
      object.coordinationDomain as JsonValue,
      pointer(path, 'coordinationDomain'),
    ),
    seq: counter(object.seq as JsonValue, pointer(path, 'seq')),
    commitId:
      object.commitId === null
        ? null
        : stringValue(object.commitId as JsonValue, pointer(path, 'commitId')),
  })
}

function operationRef(value: JsonValue, limits: CodecLimits, path: string): OperationRef {
  return shared('OperationRef', value, limits, path)
}

function decodeRecord(
  kind: string,
  data: JsonValue,
  limits: CodecLimits,
  path: string,
): BudgetRecord {
  if (kind === 'budget.policy_changed') {
    const object = objectValue(data, path, [
      'budget',
      'previousRevision',
      'affectedAttempts',
      'effectiveBoundary',
    ])
    return Object.freeze({
      kind,
      version: '1',
      data: Object.freeze({
        budget: budgetValue(object.budget as JsonValue, limits, pointer(path, 'budget')),
        previousRevision: counter(
          object.previousRevision as JsonValue,
          pointer(path, 'previousRevision'),
        ),
        affectedAttempts: stringArray(
          object.affectedAttempts as JsonValue,
          pointer(path, 'affectedAttempts'),
        ),
        effectiveBoundary: literal(
          object.effectiveBoundary as JsonValue,
          'next_admission',
          pointer(path, 'effectiveBoundary'),
        ),
      }),
    })
  }
  if (kind === 'budget.period_opened') {
    const object = objectValue(data, path, [
      'budgetId',
      'previousPeriodId',
      'period',
      'budgetRevision',
    ])
    return Object.freeze({
      kind,
      version: '1',
      data: Object.freeze({
        budgetId: stringValue(object.budgetId as JsonValue, pointer(path, 'budgetId')),
        previousPeriodId: stringValue(
          object.previousPeriodId as JsonValue,
          pointer(path, 'previousPeriodId'),
        ),
        period: period(object.period as JsonValue, pointer(path, 'period')),
        budgetRevision: counter(
          object.budgetRevision as JsonValue,
          pointer(path, 'budgetRevision'),
          true,
        ),
      }),
    })
  }
  if (kind === 'budget.source_posture_changed') {
    return Object.freeze({ kind, version: '1', data: sourcePosture(data, path) })
  }
  if (kind === 'budget.attempt_reserved') {
    const object = objectValue(data, path, ['attempt'])
    return Object.freeze({
      kind,
      version: '1',
      data: Object.freeze({
        attempt: chargeAttempt(object.attempt as JsonValue, limits, pointer(path, 'attempt')),
      }),
    })
  }
  if (kind === 'budget.reservation_changed') {
    const object = objectValue(data, path, [
      'chargeAttemptId',
      'budgetId',
      'periodId',
      'before',
      'after',
      'reason',
      'evidence',
    ])
    return Object.freeze({
      kind,
      version: '1',
      data: Object.freeze({
        chargeAttemptId: stringValue(
          object.chargeAttemptId as JsonValue,
          pointer(path, 'chargeAttemptId'),
        ),
        budgetId: stringValue(object.budgetId as JsonValue, pointer(path, 'budgetId')),
        periodId: stringValue(object.periodId as JsonValue, pointer(path, 'periodId')),
        before: moneyValue(object.before as JsonValue, pointer(path, 'before'), true),
        after: moneyValue(object.after as JsonValue, pointer(path, 'after'), true),
        reason: oneOf(
          object.reason as JsonValue,
          ['reserved', 'partial_meter', 'reconciled', 'never_started'] as const,
          pointer(path, 'reason'),
        ),
        evidence: evidences(object.evidence as JsonValue, pointer(path, 'evidence')),
      }),
    })
  }
  if (kind === 'budget.exposure_recorded') {
    const object = objectValue(data, path, [
      'chargeAttemptId',
      'phase',
      'uncertainty',
      'sourceFact',
    ])
    return Object.freeze({
      kind,
      version: '1',
      data: Object.freeze({
        chargeAttemptId: stringValue(
          object.chargeAttemptId as JsonValue,
          pointer(path, 'chargeAttemptId'),
        ),
        phase: literal(object.phase as JsonValue, 'possibly_emitted', pointer(path, 'phase')),
        uncertainty: oneOf(
          object.uncertainty as JsonValue,
          ['known', 'unknown'] as const,
          pointer(path, 'uncertainty'),
        ),
        sourceFact: evidence(object.sourceFact as JsonValue, pointer(path, 'sourceFact')),
      }),
    })
  }
  if (kind === 'budget.meter_recorded' || kind === 'budget.unallocated_recorded') {
    const required = kind === 'budget.meter_recorded' ? ['fact'] : ['fact', 'tenantId']
    const object = objectValue(data, path, required)
    const fact = meterFact(object.fact as JsonValue, pointer(path, 'fact'))
    if (kind === 'budget.meter_recorded')
      return Object.freeze({ kind, version: '1', data: Object.freeze({ fact }) })
    if (fact.chargeAttemptId !== null)
      problem(
        'ownership',
        'unallocated fact must have null chargeAttemptId',
        pointer(path, 'fact/chargeAttemptId'),
      )
    return Object.freeze({
      kind,
      version: '1',
      data: Object.freeze({
        fact,
        tenantId: stringValue(object.tenantId as JsonValue, pointer(path, 'tenantId')),
      }),
    })
  }
  if (kind === 'budget.source_fact_indexed') {
    const object = objectValue(data, path, [
      'sourceId',
      'externalFactId',
      'revision',
      'previousRevision',
      'chargeAttemptId',
      'inputDigest',
    ])
    return Object.freeze({
      kind,
      version: '1',
      data: Object.freeze({
        sourceId: stringValue(object.sourceId as JsonValue, pointer(path, 'sourceId')),
        externalFactId: stringValue(
          object.externalFactId as JsonValue,
          pointer(path, 'externalFactId'),
        ),
        revision: counter(object.revision as JsonValue, pointer(path, 'revision'), true),
        previousRevision: optionalCounter(
          object.previousRevision as JsonValue,
          pointer(path, 'previousRevision'),
        ),
        chargeAttemptId:
          object.chargeAttemptId === null
            ? null
            : stringValue(object.chargeAttemptId as JsonValue, pointer(path, 'chargeAttemptId')),
        inputDigest: digestValue(object.inputDigest as JsonValue, pointer(path, 'inputDigest')),
      }),
    })
  }
  if (kind === 'budget.attempt_reconciled') {
    const object = objectValue(data, path, [
      'chargeAttemptId',
      'finalFacts',
      'released',
      'remainingUnknown',
    ])
    return Object.freeze({
      kind,
      version: '1',
      data: Object.freeze({
        chargeAttemptId: stringValue(
          object.chargeAttemptId as JsonValue,
          pointer(path, 'chargeAttemptId'),
        ),
        finalFacts: evidences(object.finalFacts as JsonValue, pointer(path, 'finalFacts'), true),
        released: allocations(object.released as JsonValue, pointer(path, 'released'), false),
        remainingUnknown: booleanValue(
          object.remainingUnknown as JsonValue,
          pointer(path, 'remainingUnknown'),
        ),
      }),
    })
  }
  if (kind === 'budget.released_before_start') {
    const object = objectValue(data, path, ['chargeAttemptId', 'proof', 'released'])
    return Object.freeze({
      kind,
      version: '1',
      data: Object.freeze({
        chargeAttemptId: stringValue(
          object.chargeAttemptId as JsonValue,
          pointer(path, 'chargeAttemptId'),
        ),
        proof: evidences(object.proof as JsonValue, pointer(path, 'proof'), true),
        released: allocations(object.released as JsonValue, pointer(path, 'released'), false),
      }),
    })
  }
  if (kind === 'budget.cost_attributed') {
    const object = objectValue(data, path, [
      'sourceId',
      'externalFactId',
      'revision',
      'chargeAttemptId',
      'allocations',
      'evidence',
    ])
    return Object.freeze({
      kind,
      version: '1',
      data: Object.freeze({
        sourceId: stringValue(object.sourceId as JsonValue, pointer(path, 'sourceId')),
        externalFactId: stringValue(
          object.externalFactId as JsonValue,
          pointer(path, 'externalFactId'),
        ),
        revision: counter(object.revision as JsonValue, pointer(path, 'revision'), true),
        chargeAttemptId: stringValue(
          object.chargeAttemptId as JsonValue,
          pointer(path, 'chargeAttemptId'),
        ),
        allocations: allocations(object.allocations as JsonValue, pointer(path, 'allocations')),
        evidence: evidences(object.evidence as JsonValue, pointer(path, 'evidence'), true),
      }),
    })
  }
  if (kind === 'budget.threshold_crossed') {
    const object = objectValue(data, path, [
      'budgetId',
      'periodId',
      'threshold',
      'knownExposure',
      'unknownAttempts',
      'delivery',
    ])
    return Object.freeze({
      kind,
      version: '1',
      data: Object.freeze({
        budgetId: stringValue(object.budgetId as JsonValue, pointer(path, 'budgetId')),
        periodId: stringValue(object.periodId as JsonValue, pointer(path, 'periodId')),
        threshold: moneyValue(object.threshold as JsonValue, pointer(path, 'threshold'), true),
        knownExposure: moneyValue(
          object.knownExposure as JsonValue,
          pointer(path, 'knownExposure'),
          true,
        ),
        unknownAttempts: stringArray(
          object.unknownAttempts as JsonValue,
          pointer(path, 'unknownAttempts'),
        ),
        delivery: literal(object.delivery as JsonValue, 'pending', pointer(path, 'delivery')),
      }),
    })
  }
  if (kind === 'budget.threshold_delivery_changed') {
    const object = objectValue(data, path, [
      'crossingOperation',
      'budgetId',
      'periodId',
      'threshold',
      'delivery',
      'evidence',
    ])
    return Object.freeze({
      kind,
      version: '1',
      data: Object.freeze({
        crossingOperation: operationRef(
          object.crossingOperation as JsonValue,
          limits,
          pointer(path, 'crossingOperation'),
        ),
        budgetId: stringValue(object.budgetId as JsonValue, pointer(path, 'budgetId')),
        periodId: stringValue(object.periodId as JsonValue, pointer(path, 'periodId')),
        threshold: moneyValue(object.threshold as JsonValue, pointer(path, 'threshold'), true),
        delivery: oneOf(
          object.delivery as JsonValue,
          ['applied', 'failed', 'unknown'] as const,
          pointer(path, 'delivery'),
        ),
        evidence: evidences(object.evidence as JsonValue, pointer(path, 'evidence')),
      }),
    })
  }
  if (kind === 'budget.operation_denied') {
    const object = objectValue(data, path, [
      'operationKind',
      'target',
      'code',
      'evidence',
      'observed',
    ])
    return Object.freeze({
      kind,
      version: '1',
      data: Object.freeze({
        operationKind: stringValue(
          object.operationKind as JsonValue,
          pointer(path, 'operationKind'),
        ),
        target: object.target as JsonValue,
        code: stringValue(object.code as JsonValue, pointer(path, 'code')),
        evidence: evidences(object.evidence as JsonValue, pointer(path, 'evidence')),
        observed: watermark(object.observed as JsonValue, pointer(path, 'observed')),
      }),
    })
  }
  problem('kind', `unknown budget record kind ${JSON.stringify(kind)}`, path)
}

/** The records codec and the shared JSON parser already report `ValidationIssue`s; pass them through unchanged. */
function fromRecordFailure<T>(issues: readonly ValidationIssue[]): Checked<T> {
  return rejectedWith(issues.length === 0 ? [issueOf('record', 'invalid record envelope')] : issues)
}

function decodeValidatedEnvelope(
  envelope: CommitEnvelope,
  limits: CodecLimits,
): Checked<DecodedBudgetEnvelope> {
  try {
    const parsedInput = parseJson(envelope.canonicalInput, limits)
    if (!parsedInput.ok) return fromRecordFailure(parsedInput.issues)
    const input =
      parsedInput.value as unknown as import('@omne-harness-lite/records').OperationInput
    const records: BudgetRecord[] = []
    const seen = new Set<string>()
    const streamRevisions: DecodedBudgetEnvelope['streamRevisions'][number][] = []
    for (let appendIndex = 0; appendIndex < envelope.appends.length; appendIndex += 1) {
      const append = envelope.appends[appendIndex]!
      const appendPath = `/appends/${appendIndex}`
      const hasBudgetKind = append.records.some(record => record.kind.startsWith('budget.'))
      if (append.stream.owner !== 'budget') {
        if (hasBudgetKind)
          problem(
            'owner',
            'budget records must be owned by budget',
            pointer(appendPath, 'stream/owner'),
          )
        continue
      }
      if (append.stream.scope.kind !== 'tenant')
        problem(
          'owner',
          'budget records require tenant stream scope',
          pointer(appendPath, 'stream/scope'),
        )
      if (input.tenantId === null || input.tenantId !== append.stream.scope.tenantId) {
        problem(
          'ownership',
          'operation tenant must match budget stream tenant',
          pointer(appendPath, 'stream/scope'),
        )
      }
      streamRevisions.push(
        Object.freeze({ stream: append.stream, expectedRevision: append.expectedRevision }),
      )
      for (let recordIndex = 0; recordIndex < append.records.length; recordIndex += 1) {
        const record = append.records[recordIndex]!
        const recordPath = `${appendPath}/records/${recordIndex}`
        if (record.version !== '1')
          problem('version', 'budget record version must be 1', pointer(recordPath, 'version'))
        if (!record.kind.startsWith('budget.'))
          problem(
            'kind',
            'budget owner cannot carry an unrelated record kind',
            pointer(recordPath, 'kind'),
          )
        const decoded = decodeRecord(record.kind, record.data, limits, pointer(recordPath, 'data'))
        const key = canonicalJson(decoded as unknown as JsonValue)
        if (!seen.has(key)) {
          seen.add(key)
          records.push(decoded)
        }
      }
    }
    const causality = input.causality
    if (input.tenantId !== null)
      validateCausalityTenant(causality, input.tenantId, '/canonicalInput/causality')
    for (const record of records) {
      if (record.kind === 'budget.attempt_reserved') {
        if (!equalJson(record.data.attempt.causality as JsonValue, causality as JsonValue)) {
          problem(
            'causality',
            'reserved attempt causality must equal envelope causality',
            '/canonicalInput/causality',
          )
        }
        if (record.data.attempt.tenantId !== input.tenantId) {
          problem(
            'ownership',
            'reserved attempt tenant must equal envelope tenant',
            '/canonicalInput/tenantId',
          )
        }
      }
      if (
        record.kind === 'budget.source_posture_changed' &&
        record.data.tenantId !== input.tenantId
      ) {
        problem(
          'ownership',
          'source posture tenant must equal envelope tenant',
          '/canonicalInput/tenantId',
        )
      }
      if (
        record.kind === 'budget.policy_changed' &&
        record.data.budget.tenantId !== input.tenantId
      ) {
        problem('ownership', 'budget tenant must equal envelope tenant', '/canonicalInput/tenantId')
      }
      if (
        record.kind === 'budget.unallocated_recorded' &&
        record.data.tenantId !== input.tenantId
      ) {
        problem(
          'ownership',
          'unallocated tenant must equal envelope tenant',
          '/canonicalInput/tenantId',
        )
      }
    }
    return accepted(
      Object.freeze({
        position: envelope.position,
        operation: envelope.operation,
        input,
        streamRevisions: Object.freeze(streamRevisions),
        records: Object.freeze(records),
      }),
    )
  } catch (error) {
    if (error instanceof ValidationFailure) return rejectedWith([error.issue])
    throw error
  }
}

export function decodeBudgetEnvelope(
  envelope: CommitEnvelope,
  limits: CodecLimits,
): Checked<DecodedBudgetEnvelope> {
  const encoded = encodeEnvelope(envelope, limits)
  if (!encoded.ok) return fromRecordFailure(encoded.issues)
  const decoded = decodeJournalLine(encoded.value, limits)
  if (!decoded.ok) return fromRecordFailure(decoded.issues)
  return decodeValidatedEnvelope(decoded.value.envelope, limits)
}

export function decodeBudgetLine(
  line: Uint8Array,
  limits: CodecLimits,
): Checked<DecodedBudgetEnvelope> {
  const decoded = decodeJournalLine(line, limits)
  if (!decoded.ok) return fromRecordFailure(decoded.issues)
  return decodeValidatedEnvelope(decoded.value.envelope, limits)
}

export function factDigest(fact: MeterFact): string {
  return createHash('sha256')
    .update(canonicalJson(fact as unknown as JsonValue))
    .digest('hex')
}
