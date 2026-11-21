import { createHash } from 'node:crypto'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef, StepCommit } from '@omne-harness/runtime-context-contract'
import {
  deriveSessionOperation,
  type SessionCommand,
  type SessionId,
  type SessionRevision,
} from '@omne-harness/session-contract'
import type { WorkingDirectory } from '../working-directory-schema.ts'
import { encodeContextStepCommit } from './context-input.ts'
import { workingDirectoryDescriptor } from './working-directory-block.ts'

const OWNER = '@omne-harness/session-adapters'

type StepInput = Readonly<{
  tenant: TenantId
  session: SessionId
  scope: ScopeRef
  /** The step of its execution: step numbers start again in each execution. */
  step: string
  /** The session revision the step begins at: what makes one boundary's commit its own. */
  at: SessionRevision
  value: WorkingDirectory
}>

const digestOf = (value: WorkingDirectory) =>
  `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`

/** The step commit of one boundary: the coordinator writes the whole value of the block. */
export function workingDirectoryStep(input: StepInput) {
  const { key } = workingDirectoryDescriptor
  const operation = deriveSessionOperation({
    kind: 'context-step',
    session: input.session,
    scope: input.scope.ref,
    at: String(input.at),
    value: digestOf(input.value),
  })
  const update = {
    origin: { origin: `${OWNER}/step/${input.step}` },
    key,
    update: input.value,
    writer: 'coordinator' as const,
  }
  const stepCommit: StepCommit = {
    scope: input.scope,
    step: { step: input.step },
    committed: [{ key, value: input.value, updates: [update] }],
    pending: [],
  }
  return { operation, stepCommit }
}

/** The Session command that commits the working directory of one step into the session log. */
export function workingDirectoryCommand(
  input: StepInput,
): Extract<SessionCommand, { kind: 'change' }> {
  const { operation, stepCommit } = workingDirectoryStep(input)
  const encoded = encodeContextStepCommit({
    tenant: input.tenant,
    operation,
    executionEnded: false,
    stepCommit,
  })
  // The commit is made here from a value its schema admits: one that cannot be encoded is a defect.
  if ('failure' in encoded) throw new Error(`the working directory step commit: ${encoded.failure}`)
  return {
    kind: 'change',
    input: {
      tenant: input.tenant,
      session: input.session,
      operation,
      declaration: {
        kind: 'context-step-commit',
        basis: {
          owner: OWNER,
          record: `${input.scope.ref}/${workingDirectoryDescriptor.key}/step/${input.step}`,
          revision: '1',
          digest: digestOf(input.value),
        },
        updates: encoded.ok.updates,
      },
    },
  }
}
