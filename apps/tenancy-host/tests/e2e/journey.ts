// 驱动器：把产品正文的核心旅程写成一串线上来往，手动演练（walk.ts）与套件（e2e.spec.ts）共用这一份。
// 旅程出处：PF-001 flows §1.1 注册 → §1.2 登录 → §1.4 创建组织 → §1.8 切换当前组织 → §1.5 邀请与加入。
// 读答复只用契约给出的成员名（EC S-17 命名表）；读不出应有的形状就抛出，说明拿到的是什么——不猜。
import { type Client, type Exchange, call, describe, publicHealth, resultOf } from './client.ts'

export interface Account {
  readonly loginIdentifier: string
  readonly credential: string
}

/** 登录成功交出的两样（EC S-19）：出示物与它的列表句柄。 */
export interface Login {
  readonly presentation: string
  readonly handle: string
}

/** IV `TenantId` 的规范形式：恰两个成员，`organization` 在前、`account` 在后（HB S-12 取定的次序）。 */
export interface TenantId {
  readonly organization: string
  readonly account: string
}

export function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${what}: expected an object, got ${JSON.stringify(value)}`)
  return Object.fromEntries(Object.entries(value))
}

export function asString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${what}: expected a non-empty string, got ${JSON.stringify(value)}`)
  return value
}

export function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value))
    throw new Error(`${what}: expected an array, got ${JSON.stringify(value)}`)
  return value
}

export function asTenantId(value: unknown, what = 'TenantId'): TenantId {
  const record = asRecord(value, what)
  const keys = Object.keys(record)
  if (keys.length !== 2 || keys[0] !== 'organization' || keys[1] !== 'account')
    throw new Error(`${what}: expected {organization, account}, got ${JSON.stringify(value)}`)
  return {
    organization: asString(record['organization'], `${what}.organization`),
    account: asString(record['account'], `${what}.account`),
  }
}

export function loginOf(exchange: Exchange): Login {
  const value = asRecord(resultOf(exchange), 'login result')
  return {
    presentation: asString(value['loginState'], 'loginState'),
    handle: asString(value['loginStateHandle'], 'loginStateHandle'),
  }
}

export function register(c: Client, account: Account, label = 'register'): Promise<Exchange> {
  return call(
    c,
    'register',
    { loginIdentifier: account.loginIdentifier, credential: account.credential },
    undefined,
    label,
  )
}

export async function login(c: Client, account: Account, label = 'login'): Promise<Login> {
  return loginOf(
    await call(
      c,
      'login',
      { loginIdentifier: account.loginIdentifier, credential: account.credential },
      undefined,
      label,
    ),
  )
}

/** 注册（必须得 `registered`）并登录。 */
export async function registerAndLogin(c: Client, account: Account): Promise<Login> {
  const registered = await register(c, account)
  if (registered.reply.kind !== 'result' || registered.reply.value !== 'registered')
    throw new Error(`register ${account.loginIdentifier}: ${describe(registered)}`)
  return await login(c, account)
}

/** EC S-23：当前租户身份查询。 */
export async function currentTenant(c: Client, presentation: string): Promise<TenantId> {
  return asTenantId(resultOf(await call(c, 'currentTenant', {}, presentation)), 'current tenant')
}

export interface WalkResult {
  readonly centerId: string
  readonly inviter: { readonly login: Login; readonly personalTenant: TenantId }
  readonly invitee: { readonly login: Login; readonly personalTenant: TenantId }
  readonly organization: string
  readonly invitation: string
  readonly joinedTenant: TenantId
  readonly members: readonly unknown[]
}

/**
 * 注册 → 登录 → 建团队组织 → 切到它 → 邀请 → 被邀请者看到并接受 → 读成员名单。
 * `step` 在每一步之前调用（演练据此打印标题、按需停顿）；每次来往经 `c.observe` 交给调用方。
 */
export async function walk(
  c: Client,
  inviter: Account,
  invitee: Account,
  step: (title: string) => Promise<void> = async () => {},
): Promise<WalkResult> {
  await step('公开体检（未登录即可读，EC S-18）')
  const health = await publicHealth(c)
  if (health.reply.kind !== 'public-health') throw new Error(`public health: ${describe(health)}`)

  await step(`注册 ${inviter.loginIdentifier}（PF-001 flows §1.1）`)
  const inviterLogin = await registerAndLogin(c, inviter)
  await step(`注册并登录 ${invitee.loginIdentifier}（§1.1、§1.2）`)
  const inviteeLogin = await registerAndLogin(c, invitee)

  await step('邀请者的当前租户身份：个人组织（§1.2）')
  const inviterPersonal = await currentTenant(c, inviterLogin.presentation)

  await step('建团队组织（§1.4）')
  const organization = asString(
    resultOf(await call(c, 'createOrganization', {}, inviterLogin.presentation)),
    'organization',
  )

  await step('切换当前组织到新建的团队组织（§1.8）')
  const switched = await call(
    c,
    'switchTenant',
    {
      expectedTenant: inviterPersonal,
      targetTenant: { organization, account: inviterPersonal.account },
    },
    inviterLogin.presentation,
  )
  if (resultOf(switched) !== 'ok') throw new Error(`switch: ${describe(switched)}`)

  await step('被邀请者的当前租户身份（他的账号标识从这里读出）')
  const inviteePersonal = await currentTenant(c, inviteeLogin.presentation)

  await step('发出邀请（§1.5 第 1 步）')
  const invitation = asString(
    resultOf(
      await call(
        c,
        'invite',
        {
          expectedTenant: { organization, account: inviterPersonal.account },
          invitedAccount: inviteePersonal.account,
        },
        inviterLogin.presentation,
      ),
    ),
    'invitation',
  )

  await step('被邀请者看到这份邀请')
  const received = asArray(
    resultOf(await call(c, 'listReceivedInvitations', {}, inviteeLogin.presentation)),
    'received invitations',
  )
  if (!received.some(item => asRecord(item, 'invitation view')['invitation'] === invitation))
    throw new Error('the invitation is not in the invitee list')

  await step('接受邀请（§1.5 第 2 步）：成员关系建立，租户产生')
  const joinedTenant = asTenantId(
    resultOf(await call(c, 'acceptInvitation', { invitation }, inviteeLogin.presentation)),
    'joined tenant',
  )

  await step('读成员名单')
  const members = asArray(
    resultOf(
      await call(
        c,
        'listMembers',
        { expectedTenant: { organization, account: inviterPersonal.account } },
        inviterLogin.presentation,
      ),
    ),
    'members',
  )

  return {
    centerId: health.reply.value.centerId,
    inviter: { login: inviterLogin, personalTenant: inviterPersonal },
    invitee: { login: inviteeLogin, personalTenant: inviteePersonal },
    organization,
    invitation,
    joinedTenant,
    members,
  }
}
