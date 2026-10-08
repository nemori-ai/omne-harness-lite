// 路由标识（入口契约 S-17：被投影条款的坐标）与协议版本常量（S-8）。

/** 公开体检自己的路由标识（S-18）；不在路由表里，走判定次序第 0 步。 */
export const PUBLIC_HEALTH_ROUTE = 'composition.governance-center-entry/v1#S-18'

/** 31 条路由，恰为 Schema `EnvelopeRouteId` 的枚举（T-1 核对两者相等）。 */
export const ROUTE_IDS = [
  'composition.account-registration/v2#S-8',
  'capability.account-identity/v3#S-15',
  'capability.account-identity/v3#S-16',
  'capability.account-identity/v3#S-37',
  'capability.organization-governance/v2#S-21',
  'capability.organization-governance/v2#S-22',
  'capability.organization-governance/v2#S-23',
  'capability.organization-governance/v2#S-24',
  'capability.organization-governance/v2#S-25',
  'capability.organization-governance/v2#S-26',
  'capability.organization-governance/v2#S-27',
  'capability.organization-governance/v2#S-28',
  'capability.organization-governance/v2#S-29',
  'capability.organization-governance/v2#S-30',
  'capability.organization-governance/v2#S-31',
  'capability.organization-governance/v2#S-32',
  'capability.organization-governance/v2#S-33',
  'capability.organization-governance/v2#S-34',
  'capability.organization-governance/v2#S-35',
  'capability.organization-governance/v2#S-36',
  'capability.organization-governance/v2#S-37',
  'capability.organization-governance/v2#S-55',
  'capability.organization-governance/v2#S-56',
  'capability.organization-governance/v2#S-57',
  'capability.organization-governance/v2#S-58',
  'capability.organization-governance/v2#S-59',
  'capability.organization-governance/v2#S-60',
  'capability.account-identity/v3#S-50',
  'capability.organization-governance/v2#S-61',
  'capability.organization-governance/v2#S-62',
  'composition.governance-center-entry/v2#S-50',
] as const

export type RouteId = (typeof ROUTE_IDS)[number]

/**
 * `accepted_protocol_versions`（S-8）：包内常量，不是 config——对得上哪些协议版本由本包的路由表实现了哪些版本决定；
 * 做成 config 就让装配能宣称接受一个代码没实现的版本。随本包版本定下，运行期间不变，非空。
 */
export const ACCEPTED_PROTOCOL_VERSIONS: readonly string[] = Object.freeze(['3'])
