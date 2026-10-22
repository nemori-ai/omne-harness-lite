// A Shell tool package writes its environment need once and derives the executor's facility set
// from it. The declaration is stored as plain JSON in the tool definition, next to the schema adoption.
import {
  environmentNeedAdoption,
  type Access,
  type CommandOutcome,
  type EnvironmentBinding,
  type EnvironmentNeedDeclaration,
  type FacilitySet,
  type OriginRef,
  type TerminalRef,
} from '@omne-harness/execution-environment-contract'

export const shellNeeds = {
  facilities: ['command', 'terminal'],
  isolation: ['process'],
  layers: ['host_machine', 'session_sandbox', 'tenant_sandbox'],
} as const satisfies EnvironmentNeedDeclaration

/** `{ command: CommandFacility<unknown>; terminal: TerminalFacility<unknown> }` */
export type ShellEnvironment = FacilitySet<(typeof shellNeeds)['facilities'][number]>

/** The JSON a tool definition stores: the schema adoption identity and the declaration value. */
export const shellEnvironmentSlot = { schema: environmentNeedAdoption, value: shellNeeds }

export type ShellCall<P> = Readonly<{
  requestId: string
  access: Access<P>
  origin: OriginRef
  binding: EnvironmentBinding
  terminal: TerminalRef
  script: string
}>

export async function runShellLeg<P>(
  env: ShellEnvironment,
  call: ShellCall<P>,
  emit: (bytes: Uint8Array) => void,
): Promise<CommandOutcome | 'refused'> {
  const leg = await env.terminal.execute(call)
  if (leg.kind !== 'done') return 'refused'
  for await (const chunk of leg.value.output) emit(chunk.data)
  return leg.value.result
}

export function cannotReadFiles(env: ShellEnvironment): void {
  // @ts-expect-error the Shell declaration does not name 'files'
  void env.files
}
