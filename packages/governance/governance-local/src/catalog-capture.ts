import { persistStageSchema } from './sql-stage-schema.ts'
import type { GovernanceCatalogRequest, GovernanceQueries } from '@omne-harness/governance-contract'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { DomainRef, FactCommandV2 } from '@omne-harness/sql-contract'
import { randomUUID } from 'node:crypto'
import { CATALOG_SNAPSHOT, catalogPageSchema, type CatalogBinding } from './catalog-schema.ts'
import {
  requestRef,
  type OperationBinding,
  type Execution,
  type OperationRecord,
} from './operation-schema.ts'
import { digest, equal, json, operationIdentity } from './encoding.ts'
import { GOVERNANCE_OWNER } from './migration.ts'
import type { SqlOperationCoordinator } from './sql-coordinator.ts'
import type { GovernanceStandingCoordinator } from './standing-coordinator.ts'
import type { Admitted, MutationCombination } from './registrar-execution.ts'
import { governanceFailureSchema } from './registrar-results.ts'

type CatalogResult = Awaited<ReturnType<GovernanceQueries<ActingForTenantPrincipal>['readCatalog']>>
export type CatalogCaptureOptions = Readonly<{
  domain: DomainRef
  epoch: string
  combination: MutationCombination
  destination: string
  sql: SqlOperationCoordinator
  standing: GovernanceStandingCoordinator
  current: (binding: CatalogBinding) => readonly FactCommandV2[]
  accepting: () => boolean
}>
const unavailable = (): CatalogResult => ({ kind: 'unavailable', owner: 'governance-catalog' })

async function settledResult(
  options: CatalogCaptureOptions,
  binding: OperationBinding,
  record: OperationRecord,
): Promise<CatalogResult> {
  if (record.state !== 'committed' && record.state !== 'aborted') return unavailable()
  const settled = await options.standing.settle(binding)
  if (settled.kind !== 'settled' || settled.outcome !== record.state) return unavailable()
  return capturedResult(binding, record)
}
function capturedResult(binding: OperationBinding, record: OperationRecord): CatalogResult {
  const parsed = catalogPageSchema.or(governanceFailureSchema).safeParse(record.result)
  if (!parsed.success || !equal(parsed.data, record.result)) return unavailable()
  if (
    parsed.data.kind === 'page' &&
    (record.state !== 'committed' ||
      !equal(parsed.data.snapshot.scope, binding.ref.scope) ||
      parsed.data.snapshot.epoch !== record.epoch)
  )
    return unavailable()
  return parsed.data
}

async function submitCapture(
  options: CatalogCaptureOptions,
  binding: OperationBinding,
  capture: CatalogBinding,
  execution: Execution,
) {
  if (!options.accepting()) return
  await options.sql.executeControl(binding, { kind: 'submit', binding, execution })
  const submitted = await options.sql.observe(binding)
  if (
    submitted.kind !== 'found' ||
    submitted.record.state !== 'submitted' ||
    !equal(submitted.record.execution, execution)
  )
    return
  const request = { binding, execution }
  const envelope = {
    identity: operationIdentity(options.domain.transactionDomain, binding.ref),
    combinationVersion: execution.combinationVersion,
    manifestDigest: execution.manifestDigest,
    commands: [
      ...options.current(structuredClone(capture)),
      { participant: CATALOG_SNAPSHOT.participant, facts: { request: json(request) } },
      { participant: GOVERNANCE_OWNER, facts: { requestDigest: digest(request) } },
    ],
  }
  if (!options.accepting()) return
  const saved = await options.sql.save(
    persistStageSchema.parse({ binding, stage: 'apply', envelope }),
  )
  if (saved.kind === 'stored' && options.accepting()) await options.sql.send(binding, 'apply')
}

async function terminateCapture(options: CatalogCaptureOptions, binding: OperationBinding) {
  let current = await options.sql.observe(binding)
  if (
    current.kind !== 'found' ||
    (current.record.state !== 'committed' && current.record.state !== 'aborted')
  ) {
    await options.sql.executeControl(binding, { kind: 'seal', binding })
    current = await options.sql.observe(binding)
  }
  return current.kind === 'found' ? settledResult(options, binding, current.record) : unavailable()
}

export async function captureCatalog(
  options: CatalogCaptureOptions,
  admitted: Admitted,
  request: GovernanceCatalogRequest,
): Promise<CatalogResult> {
  const operation = {
    owner: 'internal.capture' as const,
    command: { scope: request.scope, operationId: randomUUID(), request },
  }
  const binding = {
    ref: requestRef(admitted.principalRef, operation),
    requestDigest: digest(operation),
  }
  const capture: CatalogBinding = {
    scope: request.scope,
    principalRef: admitted.principalRef,
    captureId: operation.command.operationId,
    epoch: options.epoch,
    transactionDomain: options.domain.transactionDomain,
    request,
  }
  const execution: Execution = {
    ...options.combination,
    authority: {
      protocol: 'governance-catalog-admission/1',
      principalRef: admitted.principalRef,
      scope: request.scope,
      required: [...admitted.required],
      requestDigest: binding.requestDigest,
    },
  }
  try {
    const accepted = await options.sql.accept({
      principalRef: admitted.principalRef,
      epoch: options.epoch,
      transactionDomain: options.domain.transactionDomain,
      request: operation,
    })
    if (accepted.kind !== 'found') return unavailable()
    const held = await options.standing.reserve(
      { operation: binding, destination: options.destination, required: [...admitted.required] },
      admitted.principal,
    )
    if (held.kind === 'held') await submitCapture(options, binding, capture, execution)
    return await terminateCapture(options, binding)
  } catch {
    try {
      await terminateCapture(options, binding)
    } catch {
      /* The persisted operation retains recovery responsibility. */
    }
    return unavailable()
  }
}
