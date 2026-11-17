import type {
  ExtensionImplementations,
  Failure,
  LoopExtensionDeclaration,
  LoopExtensionImplementation,
  Reply,
} from '@omne-harness/agent-contract'
import { capabilityId, collectCandidates } from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import { memberOfImplementation } from '@omne-harness/loop-extension'
import {
  LOOP_EXTENSION_CATEGORY,
  declarationOf,
  type BuiltinExtensions,
  type EnabledMember,
  type ExtensionSources,
  type TenantExtensionSources,
} from '@omne-harness/loop-extension-contract'
import { fail, succeed } from '@omne-harness/operation-result'

type Member = Pick<EnabledMember, 'capability' | 'assetRef' | 'version'>

/** How a command implementation is made for one member. Absent when the host has no execution environment. */
export type CommandImplementations<P> = (
  input: Readonly<{
    access: Access<P>
    member: Member
    declaration: LoopExtensionDeclaration
  }>,
) => Reply<LoopExtensionImplementation['invoke']>

const unavailable = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: 'loop-extension',
  diagnostic,
})

async function held(sources: TenantExtensionSources, member: Member): Promise<boolean> {
  const capability = capabilityId(LOOP_EXTENSION_CATEGORY, member.capability)
  if (!capability.ok) return false
  const layers = await collectCandidates(sources.layers, capability.id)
  return layers.some(
    layer =>
      layer.state === 'read' &&
      layer.candidates.some(
        candidate => candidate.asset === member.assetRef && !candidate.disabled,
      ),
  )
}

/** The implementation of a member by the exact version the Agent recorded, not by the version that wins now. */
export function createExtensionImplementations<P>(
  input: Readonly<{
    sources: ExtensionSources<P>
    builtins: Pick<BuiltinExtensions, 'get'>
    commands?: CommandImplementations<P>
  }>,
): ExtensionImplementations<P> {
  async function invocation(
    access: Access<P>,
    member: Member,
  ): Reply<LoopExtensionImplementation['invoke']> {
    const sources = await input.sources.of(access).catch(() => undefined)
    if (sources === undefined) return fail(unavailable('the sources of the tenant are away'))
    if (!(await held(sources, member)))
      return fail(unavailable('the holding is disabled, removed or cannot be read'))
    const body = await sources
      .body({ asset: member.assetRef, version: member.version })
      .catch(() => undefined)
    const declaration = body === undefined ? null : declarationOf(body)
    if (declaration === null || declaration.name !== member.capability)
      return fail(unavailable('the declaration of the recorded version cannot be read'))
    if (declaration.implementation.kind === 'command')
      return input.commands === undefined
        ? fail(unavailable('this host runs no command implementation'))
        : input.commands({ access, member, declaration })
    const builtin = input.builtins.get(declaration.implementation.builtinName)
    return builtin === undefined
      ? fail(unavailable('the builtin implementation is not registered'))
      : succeed(builtin)
  }
  return {
    async resolve({ passage, principal, tenant }) {
      const { implementation } = passage
      const member = memberOfImplementation(implementation)
      if (member === null)
        return fail({
          kind: 'invalid',
          field: 'implementation',
          reason: 'not an implementation of a loop extension',
        })
      const invoke = await invocation({ principal, tenant }, member)
      return 'failure' in invoke ? invoke : succeed({ implementation, invoke: invoke.ok })
    },
  }
}
