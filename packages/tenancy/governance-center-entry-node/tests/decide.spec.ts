import { decisionStorage } from './support/decision-storage.ts'
const storage = decisionStorage()
// 判定次序与路由表，参与方是桩（tests/support/stubs.ts）：`decide` 交出的就是写上连接的那一整份字节（answer 钩子原样写出），
// 所以这里比较的字节就是线上字节；真实组合与真实连接上的对应断言在 center.spec.ts。
// 覆盖：T-1（路由表封闭 + SC-3 的源码扫描）、T-2 的桩那一半（表示层不合格三例不调 exchange、撤销落在认人与办事之间）、
// T-3 的桩那一半、T-4 的缺陷那一半、T-5 的桩那一半、T-6、T-10（27 条路由 × 每个可达失败值）、T-15、T-17，
// 以及 V-9「27 条路由的成功返回各取一例，按书写次序写出后过 Exchange」。
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROUTE_IDS, isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import { entryAnswerBytes, publicHealthBytes, routeFailureBytes } from '../src/routing/answers.ts'
import { type Decision, decide } from '../src/routing/decide.ts'
import { ROUTES } from '../src/routing/routes.ts'
import { conformsTo, entryValidator } from '../src/routing/schema.ts'
import {
  ACCOUNT,
  LOGIN_STATE,
  ORGANIZATION,
  OTHER_ACCOUNT,
  OTHER_ORGANIZATION,
  P,
  Q,
  StubParticipants,
  TENANT,
} from './support/stubs.ts'

const CENTER_ID = '3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60'
if (!isGovernanceCenterId(CENTER_ID)) throw new Error('fixture center id')
const PUBLIC_HEALTH = publicHealthBytes(CENTER_ID, '0.1.0')
const HC = 'composition.governance-center-entry/v1#S-18'
const REJECTED = entryAnswerBytes('login-state-rejected')
const INVALID = entryAnswerBytes('invalid-input')
const UNAVAILABLE = entryAnswerBytes('unavailable')
const VERSION = entryAnswerBytes('version-mismatch')

const AR8 = 'composition.account-registration/v2#S-8'
const AI15 = 'capability.account-identity/v3#S-15'
const AI16 = 'capability.account-identity/v3#S-16'
const AI37 = 'capability.account-identity/v3#S-37'
const AI50 = 'capability.account-identity/v3#S-50'
const ENTRY50 = 'composition.governance-center-entry/v2#S-50'
const og = (clause: number) => `capability.organization-governance/v2#S-${String(clause)}`

async function run(stub: StubParticipants, body: string | Buffer): Promise<Decision> {
  return decide(typeof body === 'string' ? Buffer.from(body, 'utf8') : body, {
    services: stub.entryServices(),
    storage: storage(),
    publicHealth: PUBLIC_HEALTH,
  })
}

/** 信封里不带 `presentedLoginState`。 */
const ABSENT: unique symbol = Symbol('absent')

function envelope(operation: string, payload: unknown, presentation: unknown = P): string {
  // Legacy success/failure matrix supplies the confirmed fixture identity. New
  // expectedTenant negative cases construct their raw envelopes explicitly.
  if (
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    ([23, 24, 28, 29, 30, 31, 32, 33, 37, 56, 58, 59, 60, 62].some(n => operation === og(n)) ||
      operation === ENTRY50 ||
      (operation === og(55) &&
        'callerIdentityKind' in payload &&
        payload.callerIdentityKind === 'tenant'))
  ) {
    payload = { expectedTenant: TENANT, ...payload }
  }
  return JSON.stringify(
    presentation === ABSENT
      ? { protocolVersion: '2', operation, payload }
      : { protocolVersion: '2', presentedLoginState: presentation, operation, payload },
  )
}

function body(decision: Decision): unknown {
  const bytes = decision.bytes
  if (bytes === undefined) throw new Error('no answer')
  return JSON.parse(bytes.subarray(bytes.indexOf('\r\n\r\n') + 4).toString('utf8'))
}

const CREDENTIALS = {
  loginIdentifier: 'ada@example.invalid',
  credential: 'correct horse battery staple',
}

/** 每条路由一份合 `Payload_<路由>` 的载荷。 */
const PAYLOADS: Record<string, Record<string, unknown>> = {
  [AI50]: { currentCredential: 'old-secret', newCredential: 'new-secret' },
  [ENTRY50]: { loginIdentifier: 'recipient@example.invalid' },
  [og(61)]: { invitation: 'inv_1' },
  [og(62)]: { affiliationRequest: 'afr_1' },
  [AR8]: CREDENTIALS,
  [AI15]: CREDENTIALS,
  [AI16]: { loginStateHandle: LOGIN_STATE },
  [AI37]: {},
  [og(21)]: {},
  [og(22)]: { organization: ORGANIZATION },
  [og(23)]: { invitedAccount: OTHER_ACCOUNT },
  [og(24)]: { invitation: 'inv_1' },
  [og(25)]: { invitation: 'inv_1' },
  [og(26)]: { tenant: TENANT },
  [og(27)]: {},
  [og(28)]: { targetTenant: TENANT, role: 'member' },
  [og(29)]: { targetTenant: TENANT },
  [og(30)]: { recipientOrganization: OTHER_ORGANIZATION, direction: 'recipientAsParent' },
  [og(31)]: { affiliationRequest: 'afr_1' },
  [og(32)]: { affiliationRequest: 'afr_1' },
  [og(33)]: { childOrganization: OTHER_ORGANIZATION },
  [og(34)]: { organizations: [ORGANIZATION] },
  [og(35)]: { tenant: TENANT },
  [og(36)]: {},
  [og(37)]: { targetTenant: TENANT },
  [og(55)]: { invitation: 'inv_1', callerIdentityKind: 'account' },
  [og(56)]: { affiliationRequest: 'afr_1' },
  [og(57)]: {},
  [og(58)]: {},
  [og(59)]: {},
  [og(60)]: {},
}

/** 每条路由在第 ③ 步调用的那一个领域方法（桩的键）。 */
const OPERATIONS: Record<string, string> = {
  [AI50]: 'logins.commitCredentialChange',
  [ENTRY50]: 'offers.issueInvitation',
  [og(61)]: 'offers.declineInvitation',
  [og(62)]: 'offers.declineAffiliationRequest',
  [AR8]: 'registration.register',
  [AI15]: 'logins.issue',
  [AI16]: 'logins.revoke',
  [AI37]: 'logins.listEffective',
  [og(21)]: 'organizations.createTeam',
  [og(22)]: 'organizations.read',
  [og(23)]: 'offers.issueInvitation',
  [og(24)]: 'offers.withdrawInvitation',
  [og(25)]: 'offers.acceptInvitation',
  [og(26)]: 'memberships.standing',
  [og(27)]: 'memberships.mine',
  [og(28)]: 'memberships.changeRole',
  [og(29)]: 'memberships.remove',
  [og(30)]: 'offers.issueAffiliationRequest',
  [og(31)]: 'offers.withdrawAffiliationRequest',
  [og(32)]: 'offers.acceptAffiliationRequest',
  [og(33)]: 'organizations.dissolveAffiliation',
  [og(34)]: 'organizations.ancestorChain',
  [og(35)]: 'organizations.scopeLayers',
  [og(36)]: 'memberships.currentTenant',
  [og(37)]: 'memberships.switchCurrentTenant',
  [og(55)]: 'offers.readInvitation',
  [og(56)]: 'offers.readAffiliationRequest',
  [og(57)]: 'offers.listReceivedInvitations',
  [og(58)]: 'offers.listIssued',
  [og(59)]: 'memberships.list',
  [og(60)]: 'offers.listReceivedAffiliationRequests',
}

const at = '2026-09-23T08:00:00Z'
const invitationView = `{"invitation":"inv_1","issuerOrganization":"${ORGANIZATION}","invitedAccount":"${OTHER_ACCOUNT}","role":"member","offerTiming":{"issuedAt":"${at}","expiresAt":"2026-09-23T08:00:00.25Z"},"offerState":"pending"}`
const requestTiming = `"offerTiming":{"issuedAt":"${at}","expiresAt":"2026-09-23T08:00:00.123Z"},"offerState":"pending"`
const tenant = `{"organization":"${ORGANIZATION}","account":"${ACCOUNT}"}`

/** V-9：桩的缺省成功返回，按 `Result_<路由>` 的书写次序写出后的体（由 Schema 手写，不从实现推）。 */
const SUCCESS_BODIES: Record<string, string> = {
  [AI50]: '{"result":"ok"}',
  [ENTRY50]: '{"result":"inv_1"}',
  [og(61)]: '{"result":"ok"}',
  [og(62)]: '{"result":"ok"}',
  [AR8]: '{"result":"registered"}',
  [AI15]: `{"result":{"loginState":"${P}","loginStateHandle":"${LOGIN_STATE}"}}`,
  [AI16]: '{"result":"ok"}',
  [AI37]: `{"result":[{"loginStateHandle":"${LOGIN_STATE}","issuedAt":"${at}","lastActivityAt":"${at}","absoluteExpiresAt":"2026-09-23T16:00:00Z","idleExpiresAt":"2026-09-23T09:00:00Z"}]}`,
  [og(21)]: '{"result":"org_new"}',
  [og(22)]: `{"result":{"organization":"${ORGANIZATION}","organizationKind":"team"}}`,
  [og(23)]: '{"result":"inv_1"}',
  [og(24)]: '{"result":"ok"}',
  [og(25)]: `{"result":${tenant}}`,
  [og(26)]: '{"result":{"standing":"effective","role":"member"}}',
  [og(27)]: `{"result":[${tenant}]}`,
  [og(28)]: '{"result":"ok"}',
  [og(29)]: '{"result":"ok"}',
  [og(30)]: '{"result":"afr_1"}',
  [og(31)]: '{"result":"ok"}',
  [og(32)]: '{"result":"ok"}',
  [og(33)]: '{"result":"ok"}',
  [og(34)]: `{"result":["${OTHER_ORGANIZATION}"]}`,
  [og(35)]:
    `{"result":{"organizationLayer":{"layer":"organization","organization":"${ORGANIZATION}"},"tenantLayer":{"layer":"tenant","tenant":${tenant}}}}`,
  [og(36)]: `{"result":${tenant}}`,
  [og(37)]: '{"result":"ok"}',
  [og(55)]: `{"result":${invitationView}}`,
  [og(56)]:
    `{"result":{"affiliationRequest":"afr_1","issuerOrganization":"${ORGANIZATION}","recipientOrganization":"${OTHER_ORGANIZATION}","direction":"recipientAsParent",${requestTiming}}}`,
  [og(57)]: `{"result":[${invitationView}]}`,
  [og(58)]:
    `{"result":{"invitations":[${invitationView}],"affiliationRequests":[{"affiliationRequest":"afr_1","issuerOrganization":"${ORGANIZATION}","recipientOrganization":"${OTHER_ORGANIZATION}","direction":"recipientAsParent",${requestTiming}}]}}`,
  [og(59)]: `{"result":[{"tenant":${tenant},"role":"superAdministrator","effective":true}]}`,
  [og(60)]:
    `{"result":[{"affiliationRequest":"afr_1","issuerOrganization":"${ORGANIZATION}","direction":"recipientAsParent",${requestTiming}}]}`,
}

describe('T-1 路由表封闭（S-17、S-24；SC-3）', () => {
  it('路由表的键恰等于 Schema EnvelopeRouteId 的枚举；公开体检不在表里、走第 0 步', () => {
    const enumeration: unknown = entryValidator('EnvelopeRouteId').schema
    const values =
      typeof enumeration === 'object' && enumeration !== null && 'enum' in enumeration
        ? enumeration.enum
        : undefined
    expect(new Set(ROUTES.map(route => route.id))).toEqual(new Set(values as string[]))
    expect(new Set(ROUTE_IDS)).toEqual(new Set(values as string[]))
    expect(ROUTES.map(route => route.id)).not.toContain(HC)
  })

  it('表外的 operation（含不投影的 AI S-13／S-17／S-18、OG S-20／S-53）⇒ invalid-input，认人没有发生', async () => {
    for (const operation of [
      'capability.account-identity/v3#S-13',
      'capability.account-identity/v3#S-17',
      'capability.account-identity/v3#S-18',
      og(20),
      og(53),
      'composition.governance-center-entry/v1#S-26',
      'health',
    ]) {
      const stub = new StubParticipants()
      const decision = await run(stub, envelope(operation, {}))
      expect(decision.bytes, operation).toBe(INVALID)
      expect(stub.count('logins.exchange')).toBe(0)
    }
  })

  it('SC-3：本包源码不按名字解析服务或方法（没有 services[…]、没有以变量为参数的 ctx.get）', () => {
    const root = join(import.meta.dirname, '../src')
    const files = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
      .map(entry => join(entry.parentPath, entry.name))
    expect(files.length).toBeGreaterThan(10)
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/services\s*\[/)
      expect(text, file).not.toMatch(/ctx\.get\(\s*[^'"\s)]/)
      expect(text, file).not.toMatch(/\[\s*method\s*\]/)
    }
  })
})

describe('V-9 与 T-10 的成功那一支：27 条路由的成功返回', () => {
  it.each(ROUTE_IDS.map(id => [id]))(
    '%s：按 Result_<路由> 的书写次序写出、连同 operation 过 Exchange',
    async id => {
      const stub = new StubParticipants()
      if (id === ENTRY50)
        stub.on('memberships.standing', async () => ({
          standing: 'effective',
          role: 'superAdministrator',
        }))
      const exempt = id === AR8 || id === AI15
      const decision = await run(stub, envelope(id, PAYLOADS[id], exempt ? ABSENT : P))
      const bytes = decision.bytes
      expect(bytes).toBeDefined()
      if (bytes === undefined) return
      expect(bytes.subarray(bytes.indexOf('\r\n\r\n') + 4).toString('utf8')).toBe(
        SUCCESS_BODIES[id],
      )
      expect(conformsTo('Exchange', { operation: id, reply: body(decision) })).toBe(true)
      expect(
        conformsTo('Envelope', JSON.parse(envelope(id, PAYLOADS[id], exempt ? ABSENT : P))),
      ).toBe(true)
      // S-26 的补授权与被投影的操作是同一个方法：一次补授权读、一次办事
      expect(stub.count(OPERATIONS[id] ?? '')).toBe(id === og(26) ? 2 : 1)
    },
  )

  it('MembershipStanding 的 ineffective 支；组织有上级时 parentOrganization 在', async () => {
    const stub = new StubParticipants()
    let calls = 0
    stub.on('memberships.standing', async () => {
      calls += 1
      return calls === 1 ? { standing: 'effective', role: 'member' } : { standing: 'ineffective' }
    })
    expect(JSON.stringify(body(await run(stub, envelope(og(26), PAYLOADS[og(26)]))))).toBe(
      '{"result":{"standing":"ineffective"}}',
    )
    const withParent = new StubParticipants()
    withParent.on('organizations.read', async () => ({
      ok: { id: ORGANIZATION, kind: 'team', parent: OTHER_ORGANIZATION },
    }))
    expect(JSON.stringify(body(await run(withParent, envelope(og(22), PAYLOADS[og(22)]))))).toBe(
      `{"result":{"organization":"${ORGANIZATION}","organizationKind":"team","parentOrganization":"${OTHER_ORGANIZATION}"}}`,
    )
  })
})

type Expected = 'pass' | 'rejected' | 'unavailable' | 'invalid-input' | 'defect'

/** 契约 S-14、S-19～S-23 的路由表逐格重写一遍（不从实现推）：每条路由每个具名值落到哪里。 */
const FAILURES: Record<string, Record<string, Expected>> = {
  [AI50]: {
    'current-credential-rejected': 'pass',
    'credential-rejected': 'pass',
    'login-state-rejected': 'rejected',
    'invalid-input': 'invalid-input',
    'storage-unavailable': 'unavailable',
  },
  [og(61)]: {
    invitationDoesNotExist: 'pass',
    alreadyConcluded: 'pass',
    accountDoesNotExist: 'defect',
    accountNotActivated: 'defect',
    invalidInput: 'invalid-input',
    unavailable: 'unavailable',
  },
  [og(62)]: {
    affiliationRequestDoesNotExist: 'pass',
    notAuthorized: 'pass',
    alreadyConcluded: 'pass',
    invalidInput: 'invalid-input',
    unavailable: 'unavailable',
  },
  [ENTRY50]: {
    notAuthorized: 'pass',
    accountDoesNotExist: 'pass',
    issuerIsPersonalOrganization: 'pass',
    alreadyAnEffectiveMember: 'pass',
    invalidOfferDuration: 'pass',
    accountNotActivated: 'defect',
    invalidInput: 'invalid-input',
    unavailable: 'unavailable',
  },
  [AR8]: {
    'identifier-taken': 'pass',
    'credential-rejected': 'pass',
    interrupted: 'pass',
    'identifier-held-by-expired-record': 'defect',
  },
  [AI15]: {
    'identifier-or-credential-rejected': 'pass',
    'invalid-input': 'invalid-input',
    'storage-unavailable': 'unavailable',
  },
  [AI16]: {
    'login-state-not-found': 'pass',
    'not-authorized': 'rejected',
    'invalid-input': 'invalid-input',
    'storage-unavailable': 'unavailable',
  },
  [AI37]: {
    'login-state-rejected': 'rejected',
    'storage-unavailable': 'unavailable',
    'invalid-input': 'defect',
  },
  [og(21)]: {
    accountNotActivated: 'defect',
    accountDoesNotExist: 'defect',
    unavailable: 'unavailable',
    invalidInput: 'defect',
  },
  [og(22)]: {
    organizationDoesNotExist: 'pass',
    unavailable: 'unavailable',
    invalidInput: 'invalid-input',
  },
  [og(23)]: {
    issuerIsPersonalOrganization: 'pass',
    notAuthorized: 'pass',
    accountNotActivated: 'pass',
    accountDoesNotExist: 'pass',
    alreadyAnEffectiveMember: 'pass',
    invalidOfferDuration: 'pass',
    unavailable: 'unavailable',
    invalidInput: 'invalid-input',
  },
  [og(24)]: {
    invitationDoesNotExist: 'pass',
    notAuthorized: 'pass',
    alreadyConcluded: 'pass',
    unavailable: 'unavailable',
    invalidInput: 'invalid-input',
  },
  [og(25)]: {
    invitationDoesNotExist: 'pass',
    offerNoLongerValid: 'pass',
    notTheInvitedAccount: 'pass',
    alreadyAnEffectiveMember: 'pass',
    accountNotActivated: 'defect',
    accountDoesNotExist: 'defect',
    unavailable: 'unavailable',
    invalidInput: 'invalid-input',
  },
  [og(26)]: { unavailable: 'unavailable', invalidInput: 'invalid-input' },
  [og(27)]: { unavailable: 'unavailable', invalidInput: 'defect' },
  [og(28)]: {
    notAuthorized: 'pass',
    membershipNotEffective: 'pass',
    wouldLeaveNoSuperAdministrator: 'pass',
    unavailable: 'unavailable',
    invalidInput: 'invalid-input',
  },
  [og(29)]: {
    personalOrganizationMemberCannotLeave: 'pass',
    notAuthorized: 'pass',
    membershipNotEffective: 'pass',
    wouldLeaveNoSuperAdministrator: 'pass',
    unavailable: 'unavailable',
    invalidInput: 'invalid-input',
  },
  [og(30)]: {
    personalOrganizationTakesNoPartInAffiliation: 'pass',
    notAuthorized: 'pass',
    organizationDoesNotExist: 'pass',
    wouldFormACycle: 'pass',
    invalidOfferDuration: 'pass',
    unavailable: 'unavailable',
    invalidInput: 'invalid-input',
  },
  [og(31)]: {
    affiliationRequestDoesNotExist: 'pass',
    notAuthorized: 'pass',
    alreadyConcluded: 'pass',
    unavailable: 'unavailable',
    invalidInput: 'invalid-input',
  },
  [og(32)]: {
    affiliationRequestDoesNotExist: 'pass',
    offerNoLongerValid: 'pass',
    notAuthorized: 'pass',
    alreadyHasAParentOrganization: 'pass',
    wouldFormACycle: 'pass',
    personalOrganizationTakesNoPartInAffiliation: 'pass',
    unavailable: 'unavailable',
    invalidInput: 'invalid-input',
  },
  [og(33)]: {
    noSuchAffiliation: 'pass',
    notAuthorized: 'pass',
    unavailable: 'unavailable',
    invalidInput: 'invalid-input',
  },
  [og(34)]: {
    organizationDoesNotExist: 'pass',
    unavailable: 'unavailable',
    invalidInput: 'invalid-input',
  },
  [og(35)]: { unavailable: 'unavailable', invalidInput: 'invalid-input' },
  [og(36)]: { loginStateNotValid: 'rejected', unavailable: 'unavailable', invalidInput: 'defect' },
  [og(37)]: {
    notOwnTenant: 'pass',
    membershipNotEffective: 'pass',
    loginStateNotValid: 'rejected',
    unavailable: 'unavailable',
    invalidInput: 'invalid-input',
  },
  [og(55)]: {
    invitationDoesNotExist: 'pass',
    unavailable: 'unavailable',
    invalidInput: 'invalid-input',
  },
  [og(56)]: {
    affiliationRequestDoesNotExist: 'pass',
    unavailable: 'unavailable',
    invalidInput: 'invalid-input',
  },
  [og(57)]: { unavailable: 'unavailable', invalidInput: 'defect' },
  [og(58)]: { notAuthorized: 'pass', unavailable: 'unavailable', invalidInput: 'defect' },
  [og(59)]: { notAuthorized: 'pass', unavailable: 'unavailable', invalidInput: 'defect' },
  [og(60)]: { notAuthorized: 'pass', unavailable: 'unavailable', invalidInput: 'defect' },
}

/** 让第 ③ 步那一个方法给出 `name`（补授权也用 memberships.standing 的那条路由，第一次读照常答有效）。 */
function failWith(stub: StubParticipants, id: string, reply: unknown): void {
  const key = OPERATIONS[id] ?? ''
  if (id === og(26)) {
    let calls = 0
    stub.on(key, async () => {
      calls += 1
      return calls === 1 ? { standing: 'effective', role: 'member' } : reply
    })
    return
  }
  stub.on(key, async () => reply)
}

function failureReply(id: string, name: string): unknown {
  return id === AR8 ? name : { failure: name }
}

async function expectOutcome(decision: Decision, expected: Expected, name: string): Promise<void> {
  switch (expected) {
    case 'pass':
      expect(decision.bytes).toEqual(routeFailureBytes(name))
      expect(conformsTo('RouteFailure', body(decision))).toBe(true)
      expect(decision.record.defect).toBeUndefined()
      return
    case 'rejected':
      expect(decision.bytes).toBe(REJECTED)
      return
    case 'unavailable':
      expect(decision.bytes).toBe(UNAVAILABLE)
      expect(decision.record.defect).toBeUndefined()
      return
    case 'invalid-input':
      expect(decision.bytes).toBe(INVALID)
      return
    case 'defect':
      expect(decision.bytes).toBe(UNAVAILABLE)
      expect(decision.record.defect).toBe(true)
  }
}

describe('T-10：每条路由的每个可达失败值 ⇒ 契约路由表所写（S-14、S-19～S-23）', () => {
  const cases = Object.entries(FAILURES).flatMap(([id, table]) =>
    Object.entries(table).map(([name, expected]) => [id, name, expected] as const),
  )
  it.each(cases)('%s：%s ⇒ %s', async (id, name, expected) => {
    const stub = new StubParticipants()
    if (id === ENTRY50)
      stub.on('memberships.standing', async () => ({
        standing: 'effective',
        role: 'superAdministrator',
      }))
    failWith(stub, id, failureReply(id, name))
    const exempt = id === AR8 || id === AI15
    await expectOutcome(
      await run(stub, envelope(id, PAYLOADS[id], exempt ? ABSENT : P)),
      expected,
      name,
    )
  })

  it.each(ROUTE_IDS.map(id => [id]))(
    '%s：失败集合之外的名字、返回了却没有值、抛出 ⇒ 缺陷',
    async id => {
      const exempt = id === AR8 || id === AI15
      for (const reply of [failureReply(id, 'somethingElse'), undefined, 42]) {
        const stub = new StubParticipants()
        if (id === ENTRY50)
          stub.on('memberships.standing', async () => ({
            standing: 'effective',
            role: 'superAdministrator',
          }))
        failWith(stub, id, reply)
        await expectOutcome(
          await run(stub, envelope(id, PAYLOADS[id], exempt ? ABSENT : P)),
          'defect',
          '',
        )
      }
      const stub = new StubParticipants()
      if (id === ENTRY50)
        stub.on('memberships.standing', async () => ({
          standing: 'effective',
          role: 'superAdministrator',
        }))
      stub.on(OPERATIONS[id] ?? '', async () => {
        throw new TypeError('boom')
      })
      if (id === og(26)) {
        let calls = 0
        stub.on(OPERATIONS[id] ?? '', async () => {
          if (++calls === 1) return { standing: 'effective', role: 'member' }
          throw new TypeError('boom')
        })
      }
      const decision = await run(stub, envelope(id, PAYLOADS[id], exempt ? ABSENT : P))
      expect(decision.bytes).toBe(UNAVAILABLE)
      expect(decision.record).toMatchObject({
        defect: true,
        observed: { value: 'throw:TypeError' },
      })
    },
  )

  it('interrupted 原样透传（不改成功、不改 unavailable）', async () => {
    const stub = new StubParticipants()
    stub.on('registration.register', async () => 'interrupted')
    expect(body(await run(stub, envelope(AR8, CREDENTIALS, ABSENT)))).toEqual({
      failure: 'interrupted',
    })
  })

  it('矛盾清单：OG S-27 与 AI S-37 空列表、OG S-36 的 account 分量不等于认人所得、成功返回不合 Result_<路由> ⇒ 缺陷', async () => {
    const cases: [string, string, unknown][] = [
      [og(27), 'memberships.mine', { ok: [] }],
      [AI37, 'logins.listEffective', { ok: [] }],
      [
        og(36),
        'memberships.currentTenant',
        { ok: { organization: ORGANIZATION, account: OTHER_ACCOUNT } },
      ],
      [og(21), 'organizations.createTeam', { ok: { organization: '  ' } }],
      [og(22), 'organizations.read', { ok: { id: ORGANIZATION, kind: 'nope', parent: null } }],
      [og(55), 'offers.readInvitation', { ok: { id: 'inv_1' } }],
    ]
    for (const [id, key, reply] of cases) {
      const stub = new StubParticipants()
      stub.on(key, async () => reply)
      const decision = await run(stub, envelope(id, PAYLOADS[id]))
      expect(decision.bytes, id).toBe(UNAVAILABLE)
      expect(decision.record.defect, id).toBe(true)
    }
  })

  it('撤销：AI S-16 的 invalid-input（桩）⇒ invalid-input（目标来自载荷）', async () => {
    const stub = new StubParticipants()
    stub.on('logins.revoke', async () => ({ failure: 'invalid-input' }))
    expect((await run(stub, envelope(AI16, { loginStateHandle: 'abc' }))).bytes).toBe(INVALID)
  })

  it('OG 的 invalidInput 在交进去的输入含载荷项时是 invalid-input，全是入口层产出的值时是缺陷（同一条路由两种载荷）', async () => {
    const stub = new StubParticipants()
    stub.on('organizations.createTeam', async () => ({ failure: 'invalidInput' }))
    expect((await run(stub, envelope(og(21), {}))).record.defect).toBe(true)
    expect((await run(stub, envelope(og(21), { creationKey: 'k1' }))).bytes).toBe(INVALID)
  })
})

describe('T-2 桩那一半：六种不认与其间撤销逐字节相同；表示层不合格不调 exchange', () => {
  it('没带、带了两个、表示层不合格（首或末空白、\\uD800 孤立代理、1025 个标量值）、查不到、其间被撤销 ⇒ 同一份 137 字节', async () => {
    const answers: Buffer[] = []
    const stub = new StubParticipants()
    answers.push(
      ...[(await run(stub, envelope(og(27), {}, ABSENT))).bytes].filter(b => b !== undefined),
    )
    answers.push(
      ...[
        (
          await run(
            stub,
            `{"protocolVersion":"2","presentedLoginState":"${P}","presentedLoginState":"${Q}","operation":"${og(27)}","payload":{}}`,
          )
        ).bytes,
      ].filter(b => b !== undefined),
    )
    for (const malformed of [` ${P}`, `${P} `, `lsp_\\uD800x`, 'x'.repeat(1025)]) {
      const text = `{"protocolVersion":"2","presentedLoginState":"${malformed}","operation":"${og(27)}","payload":{}}`
      const decision = await run(stub, text)
      if (decision.bytes !== undefined) answers.push(decision.bytes)
    }
    expect(stub.count('logins.exchange')).toBe(0)
    const unknown = await run(stub, envelope(og(27), {}, Q))
    if (unknown.bytes !== undefined) answers.push(unknown.bytes)
    expect(stub.count('logins.exchange')).toBe(1)
    // 其间被撤销：认人之后、推导时 OG S-36 给 loginStateNotValid；办事时 AI S-37 给 login-state-rejected
    const between = new StubParticipants()
    between.on('memberships.currentTenant', async () => ({ failure: 'loginStateNotValid' }))
    const derived = await run(between, envelope(og(23), { invitedAccount: OTHER_ACCOUNT }))
    if (derived.bytes !== undefined) answers.push(derived.bytes)
    between.on('logins.listEffective', async () => ({ failure: 'login-state-rejected' }))
    const listed = await run(between, envelope(AI37, {}))
    if (listed.bytes !== undefined) answers.push(listed.bytes)
    // 没带、两个、四个表示层不合格、查不到、推导时其间撤销、办事时其间撤销
    expect(answers).toHaveLength(9)
    for (const answer of answers) expect(answer).toBe(REJECTED)
    // 1024 个标量值恰在上界上，交给 exchange
    const edge = new StubParticipants()
    await run(edge, envelope(og(27), {}, 'x'.repeat(1024)))
    expect(edge.count('logins.exchange')).toBe(1)
  })

  it('工程记录分得出 absent／multiple／malformed／judged', async () => {
    const stub = new StubParticipants()
    expect((await run(stub, envelope(og(27), {}, ABSENT))).record.rejection).toBe('absent')
    expect(
      (
        await run(
          stub,
          `{"protocolVersion":"2","presentedLoginState":"${P}","presentedLoginState":"${P}","operation":"${og(27)}","payload":{}}`,
        )
      ).record.rejection,
    ).toBe('multiple')
    expect((await run(stub, envelope(og(27), {}, 42))).record.rejection).toBe('malformed')
    expect((await run(stub, envelope(og(27), {}, Q))).record.rejection).toBe('judged')
  })

  it('exchange 给出 storage-unavailable ⇒ unavailable（不改说成 login-state-rejected）；集合外 ⇒ 缺陷', async () => {
    const stub = new StubParticipants()
    stub.on('logins.exchange', async () => ({ failure: 'storage-unavailable' }))
    const unavailable = await run(stub, envelope(og(27), {}))
    expect(unavailable.bytes).toBe(UNAVAILABLE)
    expect(unavailable.record).toMatchObject({
      observed: { call: 'authenticate', value: 'storage-unavailable' },
    })
    stub.on('logins.exchange', async () => ({ failure: 'nope' }))
    expect((await run(stub, envelope(og(27), {}))).record.defect).toBe(true)
    stub.on('logins.exchange', async () => ({ ok: { loginStateId: ' ', accountId: ACCOUNT } }))
    expect((await run(stub, envelope(og(27), {}))).record.defect).toBe(true)
  })
})

describe('T-3 判定次序（桩那一半）', () => {
  it('版本对不上 × 四种出示物 ⇒ 四次 version-mismatch，出示物一眼都不看；公开体检照常', async () => {
    const stub = new StubParticipants()
    const presentations = [undefined, P, Q, ' bad']
    for (const presentation of presentations) {
      const text = JSON.stringify({
        protocolVersion: '0-obsolete',
        ...(presentation === undefined ? {} : { presentedLoginState: presentation }),
        operation: og(27),
        payload: {},
      })
      expect((await run(stub, text)).bytes).toBe(VERSION)
    }
    expect(stub.count('logins.exchange')).toBe(0)
    expect((await run(stub, JSON.stringify({ operation: HC }))).bytes).toBe(PUBLIC_HEALTH)
  })

  it('① 的触发：缺席、重复、不是字符串、不被接受；读不下来、顶层不是对象', async () => {
    const stub = new StubParticipants()
    for (const text of [
      `{"operation":"${og(27)}","payload":{}}`,
      `{"protocolVersion":1,"operation":"${og(27)}","payload":{}}`,
      `{"protocolVersion":"2","protocolVersion":"2","presentedLoginState":"${P}","operation":"${og(27)}","payload":{}}`,
      '',
      '[]',
      'null',
    ]) {
      expect((await run(stub, text)).bytes, text).toBe(VERSION)
    }
  })

  it('①′：有表外成员 ⇒ invalid-input，认人没有发生', async () => {
    const stub = new StubParticipants()
    const text = `{"protocolVersion":"2","presentedLoginState":"${P}","operation":"${og(27)}","payload":{},"asOrganization":"${OTHER_ORGANIZATION}"}`
    expect((await run(stub, text)).bytes).toBe(INVALID)
    expect(stub.count('logins.exchange')).toBe(0)
  })

  it('有效配坏载荷 ⇒ invalid-input；已撤销（桩判不认）配同一份 ⇒ login-state-rejected（认人在前）', async () => {
    const stub = new StubParticipants()
    const bad = { invitedAccount: OTHER_ACCOUNT, extra: 1 }
    expect((await run(stub, envelope(og(23), bad, P))).bytes).toBe(INVALID)
    expect((await run(stub, envelope(og(23), bad, Q))).bytes).toBe(REJECTED)
  })

  it('数据所在够不着（exchange 给 storage-unavailable）：出示了 ⇒ unavailable；没带 ⇒ login-state-rejected（不用查就判得了）', async () => {
    const stub = new StubParticipants()
    stub.on('logins.exchange', async () => ({ failure: 'storage-unavailable' }))
    expect((await run(stub, envelope(og(27), {}, Q))).bytes).toBe(UNAVAILABLE)
    expect((await run(stub, envelope(og(27), {}, ABSENT))).bytes).toBe(REJECTED)
  })

  it('注册与登录的坏载荷：不调凭据解析之后的任何参与方，存储不可用也照样 invalid-input', async () => {
    for (const id of [AR8, AI15]) {
      const stub = new StubParticipants()
      stub.on('registration.register', async () => 'interrupted')
      stub.on('logins.issue', async () => ({ failure: 'storage-unavailable' }))
      for (const payload of [
        {},
        { loginIdentifier: ' ada', credential: 'x' },
        { loginIdentifier: 'ada', credential: '' },
        { loginIdentifier: 'ada', credential: 'x', more: 1 },
      ]) {
        expect(
          (await run(stub, envelope(id, payload, ABSENT))).bytes,
          JSON.stringify(payload),
        ).toBe(INVALID)
      }
      expect(stub.count('registration.register') + stub.count('logins.issue')).toBe(0)
    }
  })

  it('免认人的路由不看出示物，也不看它的重复（examples §6 #12）', async () => {
    const stub = new StubParticipants()
    const without = await run(stub, envelope(AI15, CREDENTIALS, ABSENT))
    const text = `{"protocolVersion":"2","presentedLoginState":"${P}","presentedLoginState":"${Q}","operation":"${AI15}","payload":${JSON.stringify(CREDENTIALS)}}`
    expect((await run(stub, text)).bytes).toEqual(without.bytes)
    expect(stub.count('logins.exchange')).toBe(0)
  })
})

describe('T-4 缺陷那一半', () => {
  it('参与方给出集合外的值 ⇒ unavailable 且记为缺陷；工程记录只写入口层观察到的值', async () => {
    const stub = new StubParticipants()
    stub.on('memberships.mine', async () => ({ failure: 'diskOnFire' }))
    const decision = await run(stub, envelope(og(27), {}))
    expect(decision.bytes).toBe(UNAVAILABLE)
    expect(decision.record).toMatchObject({
      defect: true,
      observed: { call: 'operation', value: 'outside-failure-set' },
    })
    expect(JSON.stringify(decision.record)).not.toMatch(/storage|clock|存储|钟/)
  })
})

describe('T-5 桩那一半：句柄、撤销与列表', () => {
  it('句柄首尾空白 ⇒ invalid-input，revoke 没被调用；合 S-31 的短句柄 abc 原样到达 revoke；撤销路由只有一次领域调用', async () => {
    const stub = new StubParticipants()
    expect((await run(stub, envelope(AI16, { loginStateHandle: ' abc' }))).bytes).toBe(INVALID)
    expect(stub.count('logins.revoke')).toBe(0)
    stub.on('logins.revoke', async () => ({ failure: 'login-state-not-found' }))
    expect(body(await run(stub, envelope(AI16, { loginStateHandle: 'abc' })))).toEqual({
      failure: 'login-state-not-found',
    })
    const [call] = stub.callsOf('logins.revoke')
    expect(call?.args).toEqual(['abc', LOGIN_STATE])
    expect(stub.count('logins.listEffective')).toBe(0)
    expect(stub.count('memberships.currentTenant')).toBe(0)
  })

  it('拿列表里的 LoginStateId 当出示物：桩判不认，与从没签发过的值逐字节相同', async () => {
    const stub = new StubParticipants()
    const asPresentation = await run(stub, envelope(og(27), {}, LOGIN_STATE))
    const never = await run(stub, envelope(og(27), {}, Q))
    expect(asPresentation.bytes).toBe(REJECTED)
    expect(never.bytes).toBe(REJECTED)
  })
})

describe('T-6 身份推导与补授权（桩那一半）', () => {
  it('推导所得 TenantId 交给发起者一格；载荷夹带「以组织 B 行事」⇒ invalid-input，没有邀请被发出', async () => {
    const stub = new StubParticipants()
    await run(stub, envelope(og(23), { invitedAccount: OTHER_ACCOUNT }))
    expect(stub.callsOf('offers.issueInvitation')[0]?.args[0]).toEqual(TENANT)
    expect(
      (
        await run(
          stub,
          envelope(og(23), {
            invitedAccount: OTHER_ACCOUNT,
            issuerTenant: { organization: OTHER_ORGANIZATION, account: ACCOUNT },
          }),
        )
      ).bytes,
    ).toBe(INVALID)
    expect(stub.count('offers.issueInvitation')).toBe(1)
  })

  it('推导：OG S-36 的 account 分量不等于认人所得、invalidInput、集合外 ⇒ 缺陷；unavailable ⇒ unavailable', async () => {
    const cases: [unknown, 'defect' | 'unavailable'][] = [
      [{ ok: { organization: ORGANIZATION, account: OTHER_ACCOUNT } }, 'defect'],
      [{ failure: 'invalidInput' }, 'defect'],
      [{ failure: 'nope' }, 'defect'],
      [{ failure: 'unavailable' }, 'unavailable'],
    ]
    for (const [reply, expected] of cases) {
      const stub = new StubParticipants()
      stub.on('memberships.currentTenant', async () => reply)
      const decision = await run(stub, envelope(og(59), {}))
      expect(decision.bytes).toBe(UNAVAILABLE)
      expect(decision.record.defect === true ? 'defect' : 'unavailable').toBe(expected)
      expect(stub.count('memberships.list')).toBe(0)
    }
  })

  it('补授权：不在（ineffective）⇒ notAuthorized 且不调被投影的操作；读不到 ⇒ unavailable', async () => {
    const stub = new StubParticipants()
    stub.on('memberships.standing', async () => ({ standing: 'ineffective' }))
    expect(body(await run(stub, envelope(og(22), { organization: OTHER_ORGANIZATION })))).toEqual({
      failure: 'notAuthorized',
    })
    expect(stub.count('organizations.read')).toBe(0)
    stub.on('memberships.standing', async () => ({ failure: 'unavailable' }))
    expect((await run(stub, envelope(og(22), { organization: OTHER_ORGANIZATION }))).bytes).toBe(
      UNAVAILABLE,
    )
  })

  it('上级链两个组织：一个在、一个不在 ⇒ notAuthorized；一个读不到一个 ineffective，两种次序都 unavailable 且两个都被读了', async () => {
    const twoOrganizations = { organizations: [ORGANIZATION, OTHER_ORGANIZATION] }
    const byOrganization = (map: Record<string, unknown>) => async (key: unknown) =>
      typeof key === 'object' && key !== null && 'organization' in key
        ? map[String(key.organization)]
        : undefined
    const stub = new StubParticipants()
    stub.on(
      'memberships.standing',
      byOrganization({
        [ORGANIZATION]: { standing: 'effective', role: 'member' },
        [OTHER_ORGANIZATION]: { standing: 'ineffective' },
      }),
    )
    expect(body(await run(stub, envelope(og(34), twoOrganizations)))).toEqual({
      failure: 'notAuthorized',
    })
    expect(stub.count('organizations.shareAncestor')).toBe(0)
    for (const order of [
      [ORGANIZATION, OTHER_ORGANIZATION],
      [OTHER_ORGANIZATION, ORGANIZATION],
    ]) {
      const s = new StubParticipants()
      s.on(
        'memberships.standing',
        byOrganization({
          [ORGANIZATION]: { failure: 'unavailable' },
          [OTHER_ORGANIZATION]: { standing: 'ineffective' },
        }),
      )
      expect((await run(s, envelope(og(34), { organizations: order }))).bytes).toBe(UNAVAILABLE)
      expect(s.count('memberships.standing')).toBe(2)
    }
  })

  it('补授权读给出 invalidInput（桩）或抛出 ⇒ 缺陷，哪怕另一个读出了 ineffective', async () => {
    const stub = new StubParticipants()
    let calls = 0
    stub.on('memberships.standing', async () => {
      calls += 1
      return calls === 1 ? { standing: 'ineffective' } : { failure: 'invalidInput' }
    })
    const decision = await run(
      stub,
      envelope(og(34), { organizations: [ORGANIZATION, OTHER_ORGANIZATION] }),
    )
    expect(decision.bytes).toBe(UNAVAILABLE)
    expect(decision.record.defect).toBe(true)
  })

  it('补授权读的参数是 (该组织, 认人所得 AccountId)', async () => {
    const stub = new StubParticipants()
    await run(
      stub,
      envelope(og(35), { tenant: { organization: OTHER_ORGANIZATION, account: OTHER_ACCOUNT } }),
    )
    expect(stub.callsOf('memberships.standing')[0]?.args[0]).toEqual({
      organization: OTHER_ORGANIZATION,
      account: ACCOUNT,
    })
  })

  it('S-55：判别式 account 交认人所得 AccountId、tenant 交推导所得 TenantId；缺席或不在集合内 ⇒ invalid-input', async () => {
    const stub = new StubParticipants()
    await run(stub, envelope(og(55), { invitation: 'inv_1', callerIdentityKind: 'account' }))
    await run(stub, envelope(og(55), { invitation: 'inv_1', callerIdentityKind: 'tenant' }))
    expect(stub.callsOf('offers.readInvitation').map(call => call.args[0])).toEqual([
      { kind: 'account', accountId: ACCOUNT },
      { kind: 'tenant', tenantId: TENANT },
    ])
    expect(stub.count('memberships.currentTenant')).toBe(1)
    expect((await run(stub, envelope(og(55), { invitation: 'inv_1' }))).bytes).toBe(INVALID)
    expect(
      (await run(stub, envelope(og(55), { invitation: 'inv_1', callerIdentityKind: 'session' })))
        .bytes,
    ).toBe(INVALID)
  })
})

describe('T-15 重复成员落在它那一步（S-4；https-json/1 S-8）', () => {
  const raw = (members: string) => `{${members}}`
  const PV = '"protocolVersion":"2"'
  const PS = `"presentedLoginState":"${P}"`
  const OP = `"operation":"${og(23)}"`
  const PL = `"payload":{"invitedAccount":"${OTHER_ACCOUNT}"}`

  it('protocolVersion 重复 ⇒ version-mismatch', async () => {
    expect((await run(new StubParticipants(), raw([PV, PV, PS, OP, PL].join(',')))).bytes).toBe(
      VERSION,
    )
  })

  it('operation 重复（第二个以转义写出）⇒ invalid-input，认人读面没有被调用', async () => {
    const stub = new StubParticipants()
    expect(
      (await run(stub, raw([PV, PS, OP, `"\\u006fperation":"${og(23)}"`, PL].join(',')))).bytes,
    ).toBe(INVALID)
    expect(stub.count('logins.exchange')).toBe(0)
  })

  it('payload 重复 ⇒ 有效出示物得 invalid-input，已撤销的得 login-state-rejected（认人在前）', async () => {
    const stub = new StubParticipants()
    expect((await run(stub, raw([PV, PS, OP, PL, PL].join(',')))).bytes).toBe(INVALID)
    expect(
      (await run(stub, raw([PV, `"presentedLoginState":"${Q}"`, OP, PL, PL].join(',')))).bytes,
    ).toBe(REJECTED)
  })

  it('免认人的路由 payload 重复：注册组合与账号能力都判不了也照样 invalid-input', async () => {
    const stub = new StubParticipants()
    stub.on('logins.issue', async () => ({ failure: 'storage-unavailable' }))
    const payload = `"payload":${JSON.stringify(CREDENTIALS)}`
    expect(
      (await run(stub, raw([PV, `"operation":"${AI15}"`, payload, payload].join(',')))).bytes,
    ).toBe(INVALID)
    expect(stub.count('logins.issue')).toBe(0)
  })

  it('出示物重复（其一有效）⇒ login-state-rejected，认人读面没有被调用', async () => {
    const stub = new StubParticipants()
    expect(
      (await run(stub, raw([PV, PS, `"presentedLoginState":"${Q}"`, OP, PL].join(',')))).bytes,
    ).toBe(REJECTED)
    expect(stub.count('logins.exchange')).toBe(0)
  })

  it('载荷内部成员重复 ⇒ 与 payload 重复同一步：有效 ⇒ invalid-input；已撤销 ⇒ login-state-rejected', async () => {
    const stub = new StubParticipants()
    const inner = `"payload":{"invitedAccount":"${OTHER_ACCOUNT}","role":"member","role":"superAdministrator"}`
    expect((await run(stub, raw([PV, PS, OP, inner].join(',')))).bytes).toBe(INVALID)
    expect(
      (await run(stub, raw([PV, `"presentedLoginState":"${Q}"`, OP, inner].join(',')))).bytes,
    ).toBe(REJECTED)
    expect(stub.count('offers.issueInvitation')).toBe(0)
  })

  it('examples §6 #15、#16：offerTtl 9007199254740990.5 不是整数 ⇒ invalid-input；1e3 合形状、交给领域的是 1000', async () => {
    const stub = new StubParticipants()
    const ttl = (literal: string) =>
      raw(
        [
          PV,
          PS,
          OP,
          `"payload":{"expectedTenant":${JSON.stringify(TENANT)},"invitedAccount":"${OTHER_ACCOUNT}","offerTtl":${literal}}`,
        ].join(','),
      )
    expect((await run(stub, ttl('9007199254740990.5'))).bytes).toBe(INVALID)
    expect((await run(stub, ttl('9007199254740992'))).bytes).toBe(INVALID)
    await run(stub, ttl('1e3'))
    expect(stub.callsOf('offers.issueInvitation')[0]?.args).toEqual([
      TENANT,
      OTHER_ACCOUNT,
      undefined,
      1000,
    ])
  })

  it('examples §6 #17、#19：公开体检里其余成员与重复一概不看；两个 operation 不是公开体检', async () => {
    const stub = new StubParticipants()
    expect(
      (await run(stub, `{"operation":"${HC}","protocolVersion":"0-obsolete","x":1,"x":2}`)).bytes,
    ).toBe(PUBLIC_HEALTH)
    expect((await run(stub, `{"operation":"${HC}","operation":"${HC}"}`)).bytes).toBe(VERSION)
    expect(
      (await run(stub, `{"operation":"composition.governance-center-entry\\/v1#S-18"}`)).bytes,
    ).toBe(PUBLIC_HEALTH)
  })

  it('JSON 超出嵌套或成员数上界 ⇒ 不答（关连接不写）', async () => {
    const decision = await run(
      new StubParticipants(),
      `{"operation":"${HC}","x":${'['.repeat(70)}${']'.repeat(70)}}`,
    )
    expect(decision.bytes).toBeUndefined()
  })
})

describe('T-17 凭据表示层跟随 credentials.parse（S-19）', () => {
  it('换成规则不同的桩，判定随之改变；parse 不过或 credential 不是非空字符串 ⇒ invalid-input，注册组合与账号能力都没被调用', async () => {
    const stub = new StubParticipants()
    expect(body(await run(stub, envelope(AR8, CREDENTIALS, ABSENT)))).toEqual({
      result: 'registered',
    })
    stub.on('credentials.parse', raw =>
      typeof raw === 'string' && raw.startsWith('pin:') ? { ok: raw } : { invalidInput: 'scheme' },
    )
    expect((await run(stub, envelope(AR8, CREDENTIALS, ABSENT))).bytes).toBe(INVALID)
    expect((await run(stub, envelope(AI15, CREDENTIALS, ABSENT))).bytes).toBe(INVALID)
    expect(
      body(
        await run(stub, envelope(AI15, { loginIdentifier: 'ada', credential: 'pin:1234' }, ABSENT)),
      ),
    ).toMatchObject({ result: {} })
    expect(stub.count('registration.register')).toBe(1)
    expect(stub.count('logins.issue')).toBe(1)
    for (const credential of ['', 7, null]) {
      expect(
        (await run(stub, envelope(AR8, { loginIdentifier: 'ada', credential }, ABSENT))).bytes,
      ).toBe(INVALID)
    }
    expect(stub.count('registration.register')).toBe(1)
  })

  it('parse 抛出 ⇒ 缺陷（不是 invalid-input）', async () => {
    const stub = new StubParticipants()
    stub.on('credentials.parse', () => {
      throw new RangeError('boom')
    })
    const decision = await run(stub, envelope(AI15, CREDENTIALS, ABSENT))
    expect(decision.bytes).toBe(UNAVAILABLE)
    expect(decision.record).toMatchObject({ defect: true, observed: { call: 'credentials' } })
  })
})
