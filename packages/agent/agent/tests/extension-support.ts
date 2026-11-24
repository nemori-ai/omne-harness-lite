import type { AgentDependencies } from '@omne-harness/agent'
import type {
  AgentCheckpoint,
  DurableEvidence,
  EnabledExtension,
  ExtensionInput,
  ExtensionInvocationMode,
  ExtensionInvocationResult,
  ExtensionReplayBinding,
  LoopExtensionDeclaration,
  Position,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import { adoption, evidence, type Principal } from './journal-support.ts'

type Dependencies = AgentDependencies<Principal, ContentBlock>

export type Invocation = Readonly<{
  extension: string
  version: string
  mode: ExtensionInvocationMode['kind']
  input: ExtensionInput
}>
export type Behavior = (
  input: ExtensionInput,
  mode: ExtensionInvocationMode,
) => ExtensionInvocationResult | Promise<ExtensionInvocationResult>

export function declare(
  name: string,
  position: Position,
  extra: Partial<LoopExtensionDeclaration> = {},
): LoopExtensionDeclaration {
  return {
    name,
    position,
    power: 'veto',
    implementation: { kind: 'builtin', builtinName: name },
    ...extra,
  }
}

export const output = (value: unknown): ExtensionInvocationResult => ({ kind: 'output', value })
export const observed = output({ kind: 'observed' })

/** The tenant's view of its enabled extensions, held in memory: a test installs, removes and breaks it. */
export function tenantView() {
  let members: EnabledExtension[] = []
  let revision = 0
  const state = {
    reads: 0,
    readable: true,
    positions: [] as Position[],
    unreadableAt: [] as Position[],
  }
  return {
    state,
    enable(declaration: LoopExtensionDeclaration, version = '1') {
      members = [
        ...members.filter(member => member.declaration.name !== declaration.name),
        { declaration, implementation: adoption(`${declaration.name}@${version}`) },
      ].sort((left, right) => left.declaration.name.localeCompare(right.declaration.name))
      revision += 1
    },
    disable(name: string) {
      members = members.filter(member => member.declaration.name !== name)
      revision += 1
    },
    port: {
      async read(input) {
        state.reads += 1
        state.positions.push(input.position)
        if (!state.readable || state.unreadableAt.includes(input.position))
          return fail({
            kind: 'unavailable' as const,
            owner: 'runtimeContext',
            diagnostic: 'the enabled extensions are not readable',
          })
        return succeed({
          members: members.filter(member => member.declaration.position === input.position),
          basis: evidence(`enabled-extensions/${revision}`),
        })
      },
    } satisfies NonNullable<Dependencies['enabledExtensions']>,
  }
}

export type TenantView = ReturnType<typeof tenantView>

/** The implementations by capability name. A name without a behavior is not resolvable, as a removed one is. */
export function implementations() {
  const behaviors = new Map<string, Behavior>()
  const invocations: Invocation[] = []
  const replays: ExtensionReplayBinding[] = []
  return {
    invocations,
    replays,
    define(name: string, behavior: Behavior) {
      behaviors.set(name, behavior)
    },
    remove(name: string) {
      behaviors.delete(name)
    },
    port: {
      async resolve(input) {
        const { declaration, implementation } = input.passage
        const behavior = behaviors.get(declaration.name)
        if (behavior === undefined)
          return fail({
            kind: 'unavailable' as const,
            owner: 'agentExtensions',
            diagnostic: `no implementation of ${declaration.name}`,
          })
        return succeed({
          implementation,
          async invoke(extension, _signal, mode) {
            if (mode.kind === 'replay') replays.push(mode.binding)
            invocations.push({
              extension: declaration.name,
              version: implementation.name,
              mode: mode.kind,
              input: extension,
            })
            return behavior(extension, mode)
          },
        })
      },
    } satisfies Dependencies['extensions'],
  }
}

export type Implementations = ReturnType<typeof implementations>

export type SavedPass = Readonly<{
  node: string
  position: string
  chain: AgentCheckpoint['chain']
  calls: readonly Readonly<{ id: string; state: string; output: string | null }>[]
}>

/** Every commit that changed the open chain or its calls, in order, as the Journal took it. */
export function recordingPasses(dependencies: Dependencies) {
  const commits: SavedPass[] = []
  const total = { commits: 0, trace: [] as string[] }
  let before = JSON.stringify([null, []])
  const journal: Dependencies['journal'] = {
    ...dependencies.journal,
    async commit(input) {
      const committed = await dependencies.journal.commit(input)
      if ('failure' in committed) return committed
      total.commits += 1
      const { chain, passages, position } = input.checkpoint
      const calls = passages.map(passage => ({
        id: String(passage.id),
        state: passage.progress.kind,
        output:
          passage.progress.kind === 'resolved' || passage.progress.kind === 'applied'
            ? (passage.progress.conclusion.skipped ??
              passage.progress.conclusion.output?.kind ??
              null)
            : null,
      }))
      const now = JSON.stringify([chain?.pass ?? null, calls])
      const node = String(input.operation).split('/')[0] ?? ''
      total.trace.push(`${node}>${position}:${input.state.kind}`)
      if (now !== before) commits.push({ node, position, chain, calls })
      before = now
      return committed
    },
  }
  return { commits, total, dependencies: { ...dependencies, journal } }
}

export function reminder(text: string) {
  return {
    kind: 'inject',
    message: {
      id: `msg_${'r'.repeat(24)}`,
      role: 'system_reminder',
      blocks: [
        { kind: 'text', id: 'blk_reminder', visibility: { toHuman: false, toModel: true }, text },
      ],
    },
  }
}

export const basisOf = (revision: number): DurableEvidence =>
  evidence(`enabled-extensions/${revision}`)
