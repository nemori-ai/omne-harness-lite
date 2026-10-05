// 参与方桩：六个被 inject 的治理面（logins、registration、credentials、organizations、memberships、offers），
// 每个方法记下调用、按可替换的处理函数作答。缺省答复是「一切顺利」的合形值；测试按需要替换成失败值、集合外的值、抛出或停住。
// 桩故意能给出参与方类型不允许的值（集合外、没有值、形状不对）——那正是入口层要当作缺陷收场的输入，
// 所以交给 `decide` 时整体按 `EntryServices` 收下（见 `entryServices()` 的注释）。
import type { StorageUnit } from '@omne-harness-lite/storage'
import type { EntryServices } from '../../src/entry-dependencies.ts'

export const ACCOUNT = 'acc_7f3c91'
export const OTHER_ACCOUNT = 'acc_91ab40'
export const ORGANIZATION = 'org_kf22'
export const OTHER_ORGANIZATION = 'org_b7'
export const LOGIN_STATE = 'b8f7117646179c7f8f923b56e9735b1a337d0cf67c7a5d63d3d2f4896ec0dd8e'
/** examples §6 的 P 与 Q：P 在桩里「有效」，Q 从没签发过。 */
export const P = 'lsp_q8Jf3kQ2vXw9pLr7TzA0mYc4Nd6Hb5Ue1GsW'
export const Q = 'lsp_Zt5Rn0aB7cD2eF9gH4iJ6kL1mN3oP8qS0uVx'
export const TENANT = { organization: ORGANIZATION, account: ACCOUNT }
export const INSTANT = Date.UTC(2026, 8, 23, 8, 0, 0)

export interface StubCall {
  readonly service: string
  readonly method: string
  readonly args: readonly unknown[]
}

type Handler = (...args: unknown[]) => unknown

const invitation = {
  id: 'inv_1',
  issuer: ORGANIZATION,
  invitedAccount: OTHER_ACCOUNT,
  role: 'member',
  timing: { issuedAt: INSTANT, expiresAt: INSTANT + 250 },
  state: 'pending',
}
const affiliationRequest = {
  id: 'afr_1',
  initiator: ORGANIZATION,
  recipient: OTHER_ORGANIZATION,
  direction: 'recipientAsParent',
  timing: { issuedAt: INSTANT, expiresAt: INSTANT + 123 },
  state: 'pending',
}

/** 每个方法的缺省答复：合形、成功。 */
function defaults(stub: StubParticipants): Record<string, Handler> {
  return {
    'accounts.resolveActivatedIdentifier': async () => ({ ok: OTHER_ACCOUNT }),
    'logins.finalizeActivity': async () => 'ok',
    'logins.prepareCredentialChange': async () => ({ ok: {} }),
    'logins.commitCredentialChange': async () => 'ok',
    'logins.issue': async () => ({ ok: { presentation: P, loginStateId: LOGIN_STATE } }),
    'logins.exchange': async presentation =>
      stub.valid.has(String(presentation))
        ? { ok: { loginStateId: LOGIN_STATE, accountId: ACCOUNT } }
        : { failure: 'login-state-rejected' },
    'logins.revoke': async () => 'ok',
    'logins.listEffective': async () => ({
      ok: [
        {
          loginStateId: LOGIN_STATE,
          issuedAt: INSTANT,
          lastActivityAt: INSTANT,
          absoluteExpiresAt: INSTANT + 28800000,
          idleExpiresAt: INSTANT + 3600000,
        },
      ],
    }),
    'registration.register': async () => 'registered',
    'credentials.parse': raw =>
      typeof raw === 'string' && raw.length > 0 ? { ok: raw } : { invalidInput: 'credential' },
    'organizations.createTeam': async () => ({ ok: { organization: 'org_new', tenant: TENANT } }),
    'organizations.read': async () => ({ ok: { id: ORGANIZATION, kind: 'team', parent: null } }),
    'organizations.dissolveAffiliation': async () => 'ok',
    'organizations.ancestorChain': async () => ({ ok: [OTHER_ORGANIZATION] }),
    'organizations.shareAncestor': async () => ({ ok: true }),
    'organizations.scopeLayers': () => ({
      ok: {
        organization: { layer: 'organization', organization: ORGANIZATION },
        tenant: { layer: 'tenant', tenant: TENANT },
      },
    }),
    'memberships.standing': async () => ({ standing: 'effective', role: 'member' }),
    'memberships.mine': async () => ({ ok: [TENANT] }),
    'memberships.changeRole': async () => 'ok',
    'memberships.remove': async () => 'ok',
    'memberships.currentTenant': async () => ({ ok: TENANT }),
    'memberships.switchCurrentTenant': async () => 'ok',
    'memberships.list': async () => ({
      ok: [{ tenant: TENANT, role: 'superAdministrator', effective: true }],
    }),
    'offers.declineInvitation': async () => 'ok',
    'offers.declineAffiliationRequest': async () => 'ok',
    'offers.issueInvitation': async () => ({ ok: 'inv_1' }),
    'offers.withdrawInvitation': async () => 'ok',
    'offers.acceptInvitation': async () => ({ ok: TENANT }),
    'offers.issueAffiliationRequest': async () => ({ ok: 'afr_1' }),
    'offers.withdrawAffiliationRequest': async () => 'ok',
    'offers.acceptAffiliationRequest': async () => 'ok',
    'offers.readInvitation': async () => ({ ok: invitation }),
    'offers.readAffiliationRequest': async () => ({ ok: affiliationRequest }),
    'offers.listReceivedInvitations': async () => ({ ok: [invitation] }),
    'offers.listIssued': async () => ({
      ok: { invitations: [invitation], affiliationRequests: [affiliationRequest] },
    }),
    'offers.listReceivedAffiliationRequests': async () => ({ ok: [affiliationRequest] }),
  }
}

export const STUB_METHODS = {
  accounts: ['resolveActivatedIdentifier'],
  logins: [
    'issue',
    'exchange',
    'revoke',
    'listEffective',
    'finalizeActivity',
    'prepareCredentialChange',
    'commitCredentialChange',
  ],
  registration: ['register'],
  credentials: ['parse'],
  organizations: [
    'createTeam',
    'read',
    'dissolveAffiliation',
    'ancestorChain',
    'shareAncestor',
    'scopeLayers',
  ],
  memberships: [
    'standing',
    'mine',
    'changeRole',
    'remove',
    'currentTenant',
    'switchCurrentTenant',
    'list',
  ],
  offers: [
    'declineInvitation',
    'declineAffiliationRequest',
    'issueInvitation',
    'withdrawInvitation',
    'acceptInvitation',
    'issueAffiliationRequest',
    'withdrawAffiliationRequest',
    'acceptAffiliationRequest',
    'readInvitation',
    'readAffiliationRequest',
    'listReceivedInvitations',
    'listIssued',
    'listReceivedAffiliationRequests',
  ],
} as const

export type StubService = keyof typeof STUB_METHODS

export class StubParticipants {
  readonly calls: StubCall[] = []
  /** 在 `exchange` 桩里算「有效」的出示物。 */
  readonly valid = new Set<string>([P])
  readonly #handlers: Record<string, Handler>

  constructor() {
    this.#handlers = defaults(this)
  }

  /** 替换一个方法的答复（`'memberships.standing'` 这样的键）。 */
  on(key: string, handler: Handler): void {
    if (!(key in this.#handlers)) throw new Error(`no stub method ${key}`)
    this.#handlers[key] = handler
  }

  count(key: string): number {
    return this.calls.filter(call => `${call.service}.${call.method}` === key).length
  }

  callsOf(key: string): readonly StubCall[] {
    return this.calls.filter(call => `${call.service}.${call.method}` === key)
  }

  /** 某个服务面的对象：每个方法记下调用再交给当前的处理函数。 */
  service(name: StubService): Record<string, Handler> {
    const face: Record<string, Handler> = {}
    for (const method of STUB_METHODS[name]) {
      face[method] = (...args: unknown[]) => {
        this.calls.push({ service: name, method, args })
        const handler = this.#handlers[`${name}.${method}`]
        if (handler === undefined) throw new Error(`no stub method ${name}.${method}`)
        return handler(...args)
      }
    }
    if (name !== 'credentials' && name !== 'registration') {
      face['participate'] = raw => {
        const unit = raw as StorageUnit
        return Object.fromEntries(
          Object.entries(face)
            .filter(([method]) => method !== 'participate')
            .map(([method, invoke]) => [
              method,
              (...args: unknown[]) => unit.run(async () => invoke(...args)),
            ]),
        )
      }
    }
    return face
  }

  /** 作为装配层 provide 的服务（名字即服务名）。 */
  provided(): { readonly name: string; readonly value: unknown }[] {
    return (Object.keys(STUB_METHODS) as StubService[]).map(name => ({
      name,
      value: this.service(name),
    }))
  }

  /**
   * 直接交给 `decide` 的服务集合。桩会有意给出参与方类型之外的值，类型上按 `EntryServices` 收下是这里唯一的断言：
   * 入口层对参与方返回值的处理本来就不信任类型（一律按运行期形状核），测试要喂的正是类型之外的东西。
   */
  entryServices(): EntryServices {
    const services: Record<StubService, unknown> = {
      accounts: this.service('accounts'),
      logins: this.service('logins'),
      registration: this.service('registration'),
      credentials: this.service('credentials'),
      organizations: this.service('organizations'),
      memberships: this.service('memberships'),
      offers: this.service('offers'),
    }
    return services as unknown as EntryServices
  }
}
