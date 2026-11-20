import {
  access,
  accountCodec,
  organizationCodec,
  tenant,
  workspaceCodec,
  type Access,
  type TenantId,
  type WorkspaceId,
} from '@omne-harness/legal-identity'
import {
  instanceId,
  loadBasis,
  reason,
  typeName,
  type InstanceId,
  type ManagementType,
  type Material,
  type TypeName,
} from '@omne-harness/workspace-contract'
import type { Minting, WorkspaceAction, WorkspaceAuthority } from '../ports.ts'

const BODY = '0123456789abcdefghjkmnpqrstvwxyz'
const body = (index: number): string => {
  let text = ''
  for (let rest = index, place = 0; place < 26; place++, rest = Math.floor(rest / 32))
    text = BODY[rest % 32]! + text
  return text
}

function parsed<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('a fake identity did not parse')
  return result.value
}

export function fakeTenant(index: number): TenantId {
  return tenant(
    parsed(organizationCodec.parse(`org_${body(index)}`)),
    parsed(accountCodec.parse(`acc_${body(index)}`)),
  )
}

/** The principal is a plain label; the domain never reads it. */
export const fakeAccess = (index: number): Access<string> =>
  access(`principal-${index}`, fakeTenant(index))

export const fakeWorkspaceId = (index: number): WorkspaceId =>
  parsed(workspaceCodec.parse(`wsp_${body(index)}`))

export function fakeMinting(): Minting {
  let workspaces = 0
  let instances = 0
  return {
    workspace: () => fakeWorkspaceId(++workspaces),
    instance: () => instanceId(`wsi_${body(++instances)}`) as InstanceId,
  }
}

type Rule<A> = (access: Access<string>, action: WorkspaceAction, target: string) => A
type StandingAnswer = 'member' | 'not-member' | 'unavailable' | 'throw'
type AdmitAnswer = 'allowed' | 'denied' | 'unavailable' | 'throw'

export type FakeAuthority = WorkspaceAuthority<string> &
  Readonly<{
    standingIs(rule: (access: Access<string>) => StandingAnswer): void
    admits(rule: Rule<AdmitAnswer>): void
    asked(): readonly Readonly<{ action: WorkspaceAction; target: string }>[]
  }>

export function fakeAuthority(): FakeAuthority {
  let standing: (access: Access<string>) => StandingAnswer = () => 'member'
  let admit: Rule<AdmitAnswer> = () => 'allowed'
  const asked: { action: WorkspaceAction; target: string }[] = []
  return {
    standingIs(rule) {
      standing = rule
    },
    admits(rule) {
      admit = rule
    },
    asked: () => asked,
    async standing(caller) {
      const answer = standing(caller)
      if (answer === 'throw') throw new Error('standing source is down')
      return answer
    },
    async admit(caller, action, target) {
      asked.push({ action, target })
      const answer = admit(caller, action, target)
      if (answer === 'throw') throw new Error('admission source is down')
      return answer
    },
  }
}

/** One thing in the fake world: the resource it is a copy of, and what can be seen of it now. */
export type FakeThing = {
  kinds: readonly string[]
  resource: string
  version: string
  /** Changes when another thing takes this address. */
  identity: number
  state: 'present' | 'gone' | 'unreadable' | 'versionless'
}

/** Addresses with nothing physical behind them, for rules that do not depend on a type. */
export type FakeWorld = Readonly<{
  things: Map<string, FakeThing>
  put(address: string, thing: Partial<FakeThing>): void
  /** How many times a type looked at the world. Looking is all a type may do. */
  looks(): number
  type(name: string, options?: { extends?: string; copies?: boolean }): ManagementType
}>

type FakeMaterial = { address: string; resource: string; identity: number }

export function fakeWorld(): FakeWorld {
  const things = new Map<string, FakeThing>()
  let looks = 0
  let identities = 0
  const material = (value: Material) => value as FakeMaterial

  return {
    things,
    looks: () => looks,
    put(address, thing) {
      things.set(address, {
        kinds: ['plain'],
        resource: address,
        version: 'v1',
        state: 'present',
        ...thing,
        identity: ++identities,
      })
    },
    type(name, options = {}) {
      const named = typeName(name) as TypeName
      return {
        name: named,
        extends: options.extends === undefined ? null : (typeName(options.extends) as TypeName),
        async recognise(address) {
          looks++
          const thing = things.get(address)
          if (thing === undefined || thing.state === 'gone') return { refused: reason('not-found') }
          if (thing.state === 'unreadable') return { unavailable: 'unreadable' }
          if (!thing.kinds.includes(name)) return { refused: reason('not-recognised') }
          return {
            ok: {
              material: { address, resource: thing.resource, identity: thing.identity },
              occupancy: address,
            },
          }
        },
        admits(existing, candidate) {
          if (existing.length === 0) return { kind: 'admitted' }
          const same = existing.every(
            other => material(other).resource === material(candidate.material).resource,
          )
          return options.copies === true && same
            ? { kind: 'admitted' }
            : { kind: 'refused', reason: reason('not-the-same-resource') }
        },
        async inspect(stored) {
          looks++
          const { address, identity } = material(stored)
          const thing = things.get(address)
          if (thing === undefined || thing.state === 'gone') return { refused: reason('missing') }
          if (thing.state === 'unreadable') return { unavailable: 'unreadable' }
          if (thing.identity !== identity) return { refused: reason('replaced') }
          if (thing.state === 'versionless') return { refused: reason('version-unreadable') }
          return { ok: { directory: address, basis: loadBasis(thing.version) } }
        },
      }
    },
  }
}
