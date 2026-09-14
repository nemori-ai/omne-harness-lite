import { createHash } from 'node:crypto'
import type {
  Causality,
  CodecLimits,
  CommitEnvelope,
  Counter,
  OwnedRecord,
} from '@omne-harness-lite/records'
import { canonicalJson } from '@omne-harness-lite/work-data'
import type {
  Allocation,
  Budget,
  ChargeAttempt,
  CostSource,
  MeterFact,
  Period,
} from '../dist/index.js'

export const limits: CodecLimits = {
  maxBytes: 1_000_000,
  maxDepth: 64,
  maxNodes: 20_000,
  maxLineBytes: 1_000_000,
  maxPayloadBytes: 900_000,
}

export const tenantId = 'tenant-1'
export const period: Period = {
  periodId: 'period-1',
  startsAt: '2030-01-01T00:00:00Z',
  endsAt: null,
}

export function money(integer: string, scale = 0, currency = 'USD') {
  return { integer, scale, currency } as const
}

export function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    budgetId: 'budget-1',
    tenantId,
    scope: { kind: 'tenant', tenantId },
    currency: 'USD',
    scale: 0,
    limit: money('10'),
    mode: 'hard',
    thresholds: [money('5')],
    period,
    revision: '1',
    ...overrides,
  }
}

export function source(
  bound: CostSource['bound'] = { kind: 'unknown', knownReserve: money('7') },
): CostSource {
  return {
    sourceId: 'source-1',
    revision: '1',
    providerId: 'provider-1',
    currency: 'USD',
    priceEvidence: [evidence('price')],
    bound,
    kind: 'tool',
  }
}

export const owner = {
  run: { session: { tenantId, sessionId: 'session-1' }, runId: 'run-1' },
  stepId: 'step-1',
} as const
export const call = { owner, callId: 'call-1', attemptId: 'attempt-1' } as const
export const causality: Causality = { session: owner.run.session, work: owner, call }

export function allocation(reserved = money('7')): Allocation {
  return {
    budgetId: 'budget-1',
    budgetRevision: '1',
    periodId: 'period-1',
    reserved,
  }
}

export function attempt(overrides: Partial<ChargeAttempt> = {}): ChargeAttempt {
  return {
    chargeAttemptId: 'charge-1',
    tenantId,
    owner,
    session: owner.run.session,
    run: owner.run,
    subjectDefinition: {
      definition: { ownerTenantId: tenantId, definitionId: 'agent-definition' },
      version: 'agent-v1',
    },
    target: {
      kind: 'tool',
      call,
      toolDefinition: {
        definition: { ownerTenantId: tenantId, definitionId: 'tool-definition' },
        version: 'tool-v1',
      },
    },
    source: source(),
    causality,
    allocations: [allocation()],
    phase: 'reserved',
    uncertainty: 'unknown',
    ...overrides,
  }
}

export function evidence(id: string) {
  return { authority: 'test-source', kind: 'receipt', id, revision: '1' } as const
}

export function fact(overrides: Partial<MeterFact> = {}): MeterFact {
  return {
    sourceId: 'source-1',
    externalFactId: 'fact-1',
    revision: '1',
    previousRevision: null,
    chargeAttemptId: 'charge-1',
    providerRequestId: 'provider-request-1',
    quality: 'estimated',
    amount: money('3'),
    quantities: [],
    completeness: 'partial',
    corrects: null,
    evidence: [evidence('usage-1')],
    ...overrides,
  }
}

export function digest(value: unknown): string {
  return createHash('sha256')
    .update(canonicalJson(value as never))
    .digest('hex')
}

export function record(kind: string, data: unknown, version = '1'): OwnedRecord {
  return { kind, version, data: data as never }
}

export function indexedRecord(meterFact: MeterFact, chargeAttemptId = meterFact.chargeAttemptId) {
  return record('budget.source_fact_indexed', {
    sourceId: meterFact.sourceId,
    externalFactId: meterFact.externalFactId,
    revision: meterFact.revision,
    previousRevision: meterFact.previousRevision,
    chargeAttemptId,
    inputDigest: digest(meterFact),
  })
}

export function envelope(options: {
  seq: Counter
  expectedRevision?: Counter
  records: readonly OwnedRecord[]
  streamId?: string
  streamOwner?: string
  inputCausality?: Causality
  inputTenantId?: string | null
}): CommitEnvelope {
  const principal = { kind: 'system' as const, systemId: 'budget-tests' }
  const canonicalInput = canonicalJson({
    format: 'core-operation/1',
    operationKind: 'budget.test',
    tenantId: options.inputTenantId === undefined ? tenantId : options.inputTenantId,
    principal,
    target: {},
    arguments: {},
    preconditions: {},
    causality: options.inputCausality ?? {},
  })
  return {
    formatVersion: 'core-journal/1',
    position: {
      coordinationDomain: 'core',
      writerEpoch: '1',
      commitId: `commit-${options.seq}`,
      seq: options.seq,
    },
    operation: {
      namespace: 'core',
      principalId: canonicalJson(principal),
      operationId: `operation-${options.seq}`,
    },
    inputEncoding: 'core-json/1',
    canonicalInput,
    inputDigest: createHash('sha256').update(canonicalInput).digest('hex'),
    appends: [
      {
        stream: {
          namespace: 'core',
          owner: options.streamOwner ?? 'budget',
          scope: { kind: 'tenant', tenantId },
          streamId: options.streamId ?? `stream-${options.seq}`,
        },
        expectedRevision: options.expectedRevision ?? '0',
        records: options.records,
      },
    ],
    outcome: { status: 'committed', result: { ok: true } },
    requiredUses: [],
  }
}

export function baseEnvelopes(): CommitEnvelope[] {
  return [
    envelope({
      seq: '1',
      streamId: 'budget:budget-1',
      records: [
        record('budget.policy_changed', {
          budget: budget(),
          previousRevision: '0',
          affectedAttempts: [],
          effectiveBoundary: 'next_admission',
        }),
      ],
    }),
    envelope({
      seq: '2',
      streamId: 'budget-source:source-1',
      inputCausality: causality,
      records: [
        record('budget.source_posture_changed', {
          tenantId,
          source: source(),
          enabled: true,
          tenantPostureBudgetId: 'budget-1',
          unknownPermissions: [{ budgetId: 'budget-1', allowed: true }],
          previousRevision: '0',
        }),
      ],
    }),
    envelope({
      seq: '3',
      streamId: 'charge:charge-1',
      inputCausality: causality,
      records: [record('budget.attempt_reserved', { attempt: attempt() })],
    }),
  ]
}
