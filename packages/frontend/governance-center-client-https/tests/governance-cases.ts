// Fixed EC2 test examples; independent of product routing implementations.
const ACCOUNT = 'acc_7f3c91'
const OTHER_ACCOUNT = 'acc_91ab40'
const ORGANIZATION = 'org_kf22'
const OTHER_ORGANIZATION = 'org_b7'
const LOGIN_STATE = 'b8f7117646179c7f8f923b56e9735b1a337d0cf67c7a5d63d3d2f4896ec0dd8e'
const P = 'lsp_q8Jf3kQ2vXw9pLr7TzA0mYc4Nd6Hb5Ue1GsW'
const Q = 'lsp_Zt5Rn0aB7cD2eF9gH4iJ6kL1mN3oP8qS0uVx'
const TENANT = { organization: ORGANIZATION, account: ACCOUNT }
const AR8 = 'composition.account-registration/v2#S-8'
const AI15 = 'capability.account-identity/v3#S-15'
const AI16 = 'capability.account-identity/v3#S-16'
const AI37 = 'capability.account-identity/v3#S-37'
const AI50 = 'capability.account-identity/v3#S-50'
const ENTRY50 = 'composition.governance-center-entry/v2#S-50'
const og = (clause: number) => `capability.organization-governance/v2#S-${String(clause)}`

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
  [og(21)]: { name: 'test organization' },
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
  [og(22)]:
    `{"result":{"organization":"${ORGANIZATION}","organizationKind":"team","name":"test organization"}}`,
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

export const governanceCases = Object.entries(PAYLOADS).map(([operation, payload]) => ({
  operation,
  envelope: {
    protocolVersion: '3',
    operation,
    ...(operation === AR8 || operation === AI15 ? {} : { presentedLoginState: P }),
    payload:
      [23, 24, 28, 29, 30, 31, 32, 33, 37, 56, 58, 59, 60, 62].some(n => operation === og(n)) ||
      operation === ENTRY50
        ? { ...payload, expectedTenant: TENANT }
        : payload,
  },
  reply: JSON.parse(SUCCESS_BODIES[operation] ?? 'null') as unknown,
}))
