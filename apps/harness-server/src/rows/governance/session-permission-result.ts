import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { canonicalText } from '@omne-harness/authorization'
import {
  GovernanceExternalWriteBasisSchema,
  GovernanceExternalWriteExecutionSchema,
  governanceExternalWriteBasisFact,
  governanceExternalWriteResultFact,
  type GovernanceExternalWriteBasis,
  type GovernanceExternalWriteResult,
  type GovernanceExternalWriteExecution,
} from '@omne-harness/governance-local'
import type { DurableEvidence } from '@omne-harness/session-contract'
import {
  SessionCommitResultSchema,
  SESSION_COMMIT_RESULT,
  SESSION_PARTICIPANT,
  decodeSessionReply,
  sessionCommitDigest,
  type SessionCommitResult,
} from '@omne-harness/session-storage-sql/participants'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'

export const SESSION_PERMISSION_WRITE_PROTOCOL = 'session.permission-assignment/1'
export const SESSION_PERMISSION_RESULT = {
  participant: 'harness.session-permission-result',
  protocol: 'harness-session-permission-result/1',
}

export function sessionPermissionCoordination(
  basis: GovernanceExternalWriteBasis,
): DurableEvidence {
  return {
    owner: 'governance',
    record: basis.request.binding.ref.operationId,
    revision: basis.epoch,
    digest: `sha256:${basis.request.binding.requestDigest}`,
  }
}

function matchesOriginal(
  basis: GovernanceExternalWriteBasis,
  execution: GovernanceExternalWriteExecution,
  result: SessionCommitResult,
): boolean {
  const own = execution.commands.filter(command => command.participant === SESSION_PARTICIPANT)
  return (
    basis.command.write.owner === SESSION_PARTICIPANT &&
    basis.command.write.protocol === SESSION_PERMISSION_WRITE_PROTOCOL &&
    execution.writer === SESSION_PARTICIPANT &&
    own.length === 1 &&
    result.operation === basis.request.binding.ref.operationId &&
    result.commandsDigest === sessionCommitDigest(own) &&
    canonicalText(result.coordination) === canonicalText(sessionPermissionCoordination(basis))
  )
}

function originalReply(response: SessionCommitResult['response'], commandDigest: string): boolean {
  try {
    const reply = decodeSessionReply({ kind: 'participated', response })
    return reply.kind === 'participated' && reply.digest === commandDigest
  } catch {
    return false
  }
}

export function sessionPermissionWriteResult(
  rawBasis: unknown,
  rawResult: unknown,
): GovernanceExternalWriteResult | null {
  const parsed = GovernanceExternalWriteBasisSchema.safeParse(rawBasis)
  const response = SessionCommitResultSchema.safeParse(rawResult)
  if (!parsed.success || !response.success) return null
  const basis = parsed.data
  const result = response.data
  const execution = GovernanceExternalWriteExecutionSchema.safeParse(
    basis.request.execution.authority,
  )
  if (!execution.success || execution.data.writer !== SESSION_PARTICIPANT) return null
  if (
    !matchesOriginal(basis, execution.data, result) ||
    !originalReply(result.response, basis.command.write.commandDigest)
  )
    return null
  return {
    binding: basis.request.binding,
    executionDigest: createHash('sha256')
      .update(canonicalText(basis.request.execution))
      .digest('hex'),
    writer: SESSION_PARTICIPANT,
    outcome: 'committed',
    result: result.response,
  }
}

export function sessionPermissionResultParticipant(): SqlMaterialCatalog['participants'][number] {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const file = new URL(`./session-permission-result-participant.${extension}`, import.meta.url)
  return {
    ...SESSION_PERMISSION_RESULT,
    moduleUrl: file.href,
    codeDigest: createHash('sha256').update(readFileSync(file)).digest('hex'),
    ownedTables: [],
    readTables: [],
    allowedFunctions: [],
    grouping: 'groupable',
    requiresFacts: [governanceExternalWriteBasisFact, SESSION_COMMIT_RESULT],
    providesFacts: [governanceExternalWriteResultFact],
  }
}
