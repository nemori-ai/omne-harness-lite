// The world of the handler cases: a stand-in for the principal port that follows identity's rule
// (the account of the target tenant must be the account of the login), and a double of the
// settings face that records what it was handed and answers what the case scripts.
import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import {
  accountCodec,
  organizationCodec,
  tenant,
  tenantCodec,
  type TenantId,
} from '@omne-harness/legal-identity'
import { createAssetsContribution } from '../../src/contribution.ts'
import type {
  ReadRefusal,
  SettingView,
  TargetTenantPrincipals,
  TenantSettingsPort,
  WriteOutcome,
} from '../../src/ports.ts'

const BODY = 'abcdefghjkmnpqrstvwxyz2345'

/** A login of the account `acc_<letter><body>` and its personal-organization tenant. */
export type FixtureLogin = Readonly<{ account: string; tenant: TenantId; tenantText: string }>

export function fixtureLogin(letter: string): FixtureLogin {
  const suffix = `${letter}${BODY.slice(1)}`
  const account = accountCodec.parse(`acc_${suffix}`)
  const organization = organizationCodec.parse(`org_${suffix}`)
  if (!account.ok || !organization.ok) throw new Error('fixture identity did not parse')
  const minted = tenant(organization.value, account.value)
  const text = tenantCodec.encode(minted)
  if (!text.ok) throw new Error('fixture tenant did not encode')
  return { account: account.value.text, tenant: minted, tenantText: text.value }
}

export function loginIdentity(login: FixtureLogin): LoginIdentity {
  return login as unknown as LoginIdentity
}

/** The principal the stand-in issues: opaque to the handlers, readable here. */
export type FixturePrincipal = Readonly<{ account: string; tenantText: string }>

type Listed = Awaited<ReturnType<TenantSettingsPort['list']>>
type Described = Awaited<ReturnType<TenantSettingsPort['describe']>>

export type FaceCall = Readonly<{ method: keyof TenantSettingsPort; input: unknown }>

export type World = Readonly<{
  /** The principal-port refusal from now on; `undefined` answers by the account rule. */
  refuseTargets(refusal: 'denied' | 'basis-unavailable' | 'throw' | undefined): void
  /** Takes the settings face off the tree. */
  removeFace(): void
  /** What the face answers from now on; `throw` makes it throw. */
  answer(next: Partial<FaceAnswers>): void
  calls(): readonly FaceCall[]
  contribution: ReturnType<typeof createAssetsContribution>
}>

type FaceAnswers = Readonly<{
  list: Listed | 'throw'
  describe: Described | 'throw'
  write: WriteOutcome | 'throw'
}>

export function createWorld(): World {
  let refusal: 'denied' | 'basis-unavailable' | 'throw' | undefined
  let present = true
  let answers: FaceAnswers = {
    list: { kind: 'listed', items: [], next: null, completeness: 'complete' },
    describe: { kind: 'unavailable' },
    write: { kind: 'unavailable' },
  }
  const calls: FaceCall[] = []

  const principals: TargetTenantPrincipals = {
    async actingFor(login, tenantText) {
      if (refusal === 'throw') throw new Error('identity is down')
      if (refusal !== undefined) return { refused: refusal }
      const caller = login as unknown as FixtureLogin
      const target = tenantCodec.parse(tenantText)
      if (!target.ok || target.value.account.text !== caller.account) return { refused: 'denied' }
      const principal: FixturePrincipal = { account: caller.account, tenantText }
      return { ok: principal as unknown as Principal }
    },
  }

  function reply<T>(value: T | 'throw'): Promise<T> {
    return value === 'throw' ? Promise.reject(new Error('face threw')) : Promise.resolve(value)
  }
  const face: TenantSettingsPort = {
    list: input => (calls.push({ method: 'list', input }), reply(answers.list)),
    describe: input => (calls.push({ method: 'describe', input }), reply(answers.describe)),
    set: input => (calls.push({ method: 'set', input }), reply(answers.write)),
    clear: input => (calls.push({ method: 'clear', input }), reply(answers.write)),
  }

  return {
    refuseTargets: value => {
      refusal = value
    },
    removeFace: () => {
      present = false
    },
    answer: next => {
      answers = { ...answers, ...next }
    },
    calls: () => calls,
    contribution: createAssetsContribution({
      settings: () => (present ? face : undefined),
      principals,
    }),
  }
}

export const ASSET = { category: 'tool', name: 'shell' } as const
const declaration = {
  title: 'Invoke',
  purpose: 'Whether Shell may run',
  appliesAt: 'Applies from the next call.',
  clearEffect: 'The organization value applies.',
}

/** One view of each kind, as the face gives them. */
export const VIEWS = {
  ordinary: {
    asset: ASSET,
    item: 'depth',
    revision: '7',
    declaration,
    kind: 'ordinary',
    valueSchema: { type: 'integer', minimum: 1 },
    default: { kind: 'set', value: 3 },
    own: { kind: 'set', value: 5 },
    effective: { value: { kind: 'set', value: 5 }, source: 'tenant' },
    lockedBy: null,
    editable: { kind: 'yes' },
  },
  permission: {
    asset: ASSET,
    item: 'invoke',
    revision: '12',
    declaration,
    kind: 'permission',
    choices: [
      { value: 'deny', label: 'Deny', description: '', permitsOperation: false },
      { value: 'ask', label: 'Ask', description: 'a person approves', permitsOperation: true },
      { value: 'auto', label: 'Auto', description: 'no approval', permitsOperation: true },
    ],
    default: 'ask',
    own: 'auto',
    effective: { kind: 'value', value: 'ask', source: 'organization' },
    bound: ['deny', 'ask'],
    editable: { kind: 'yes' },
  },
  secret: {
    asset: { category: 'model', name: 'provider' },
    item: 'key',
    revision: '0',
    declaration,
    kind: 'secret',
    own: 'unreadable',
    official: 'unreadable',
    editable: { kind: 'no', reason: 'not-a-source' },
  },
} as const satisfies Readonly<Record<string, SettingView>>

export const READ_REFUSALS: readonly ReadRefusal['kind'][] = [
  'denied',
  'not-visible',
  'conflict',
  'unavailable',
]
