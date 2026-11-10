import { z } from 'zod'
import { PermissionDefinitionSchema } from '@omne-harness/permissions'
import type { DeclarationChange, MutationName } from '@omne-harness/session-contract'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import { canonicalText, sha256 } from './codec.ts'

export const SESSION_COMMIT_PROTOCOL = '2'
export const SESSION_COMMIT_BASIS = { key: 'session.commit-basis', protocol: '1' } as const
export const SESSION_COMMIT_RESULT = { key: 'session.commit-result', protocol: '1' } as const
export const SESSION_ORDINARY_BASIS = 'session-ordinary-basis'
const text = z.string().min(1)
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/)
const evidence = z.strictObject({ owner: text, record: text, revision: text, digest: text })
const permissionChange = z.strictObject({
  operation: text,
  commandDigest: z.string().regex(/^[0-9a-f]{64}$/),
  revision: z.string().regex(/^(0|[1-9][0-9]*)$/),
  definition: PermissionDefinitionSchema.nullable(),
  authority: evidence,
})
export const SessionCommitBasisSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ordinary'), commandsDigest: digest }),
  z.strictObject({
    kind: z.literal('permission-change'),
    commandsDigest: digest,
    coordination: evidence,
    permissionChange,
  }),
])
export type SessionCommitBasis = z.infer<typeof SessionCommitBasisSchema>
export const SessionCommitResultSchema = z.strictObject({
  coordination: evidence,
  commandsDigest: digest,
  operation: text,
  response: z.json(),
})
export type SessionCommitResult = z.infer<typeof SessionCommitResultSchema>

export const SessionBasisCommandsSchema = z.strictObject({
  commands: z
    .array(
      z.strictObject({
        participant: z.literal('session'),
        facts: z.record(z.string(), z.json()),
      }),
    )
    .length(1),
})

/** Binds every Session fact, including its guards and budgets, without interpreting the command. */
export function sessionCommitDigest(commands: readonly FactCommandV2[]): string {
  return `sha256:${sha256(canonicalText(commands))}`
}

/** Adds the ordinary producer only after all participants have formed their final command facts. */
export function sessionCommitCommands(
  commands: readonly FactCommandV2[],
): readonly FactCommandV2[] {
  if (commands.some(command => command.participant === SESSION_ORDINARY_BASIS))
    throw new TypeError('Session basis was already supplied')
  const own = commands.filter(command => command.participant === 'session')
  if (own.length === 0) return commands
  if (own.length !== 1) throw new TypeError('more than one Session participation in one write')
  const facts = SessionBasisCommandsSchema.parse({ commands: own })
  return [...commands, { participant: SESSION_ORDINARY_BASIS, facts }]
}

const commandKinds = {
  addTodo: true,
  removeTodo: true,
  markTodoComplete: true,
  accept: true,
  startRun: true,
  claim: true,
  reload: true,
  recordMessage: true,
  preserveResult: true,
  completeConsumption: true,
  completeExternalConsumption: true,
  bindExternalCall: true,
  commitDerived: true,
  release: true,
  control: true,
  finishRun: true,
  create: true,
  completeInitialization: true,
  change: true,
  setRelation: true,
  configureAutoArchive: true,
  considerAutoArchive: true,
  recordIdle: true,
  interrupt: true,
  cancelRun: true,
  stopCall: true,
  freeze: true,
  receive: true,
} satisfies Record<MutationName, true>
const declarationKinds = {
  'permission-mode': true,
  'collaboration-mode': true,
  'environment-mode': true,
  workspace: true,
  model: true,
  declaration: true,
  'context-registration': true,
  'context-step-commit': true,
  'recovery-input': true,
} satisfies Record<Exclude<DeclarationChange['kind'], 'permission-assignment'>, true>
const object = z.record(z.string(), z.json())
const commandShape = z.strictObject({
  kind: text,
  input: z.looseObject({
    operation: text,
    session: text,
    tenant: z.json(),
  }),
})
const intentShape = z.discriminatedUnion('intent', [
  z.looseObject({
    intent: z.literal('command'),
    command: commandShape,
    guards: z.array(z.json()),
    intakeLimits: z.json().optional(),
  }),
  z.looseObject({ intent: z.literal('query'), tenant: text, session: text, operation: text }),
  z.looseObject({ intent: z.literal('check'), check: object }),
  z.looseObject({ intent: z.literal('entries'), observation: object }),
  z.looseObject({ intent: z.literal('log'), observation: object }),
])

/** Classifies the execution path; the Session writer remains responsible for business validation. */
export function ordinarySessionFacts(facts: FactCommandV2['facts']): boolean {
  const parsed = intentShape.safeParse(facts)
  if (!parsed.success) return false
  if (parsed.data.intent !== 'command') return true
  const command = parsed.data.command
  if (!Object.hasOwn(commandKinds, command.kind)) return false
  if (command.kind !== 'change') return true
  const declaration = z.object({ kind: text }).safeParse(command.input['declaration'])
  return declaration.success && Object.hasOwn(declarationKinds, declaration.data.kind)
}

export function permissionAssignmentFacts(facts: FactCommandV2['facts']): boolean {
  const parsed = intentShape.safeParse(facts)
  if (!parsed.success || parsed.data.intent !== 'command' || parsed.data.command.kind !== 'change')
    return false
  return z
    .object({ kind: z.literal('permission-assignment') })
    .safeParse(parsed.data.command.input['declaration']).success
}
