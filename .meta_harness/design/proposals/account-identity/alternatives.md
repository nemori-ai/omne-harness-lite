# 账号身份权威的三个候选

## 选择对象与共同约束

对 [PF-026.C1–C5](../../requirements/product/PF-026-account-journey-and-isolation/requirements.md)，选择哪个能力拥有产品账号及认证生命周期，哪种成熟 provider 提供注册/会话机制。三个候选都必须保持账号 `UserRef` 与组织成员关系分离，由可信账号及目标租户共同限定数据、设置、权限和其他资产的归属与可见范围，并提供可辨失败及仅退出当前登录态。Tenant 继续拥有个人租户唯一 claim；[PF-019](../../requirements/product/PF-019-tenant-subscription-usage-billing-and-budget/README.md) 与 budget-accounting@1 BG-01/02/06 分别约束租户账目、预算和授额；[PF-006](../../requirements/product/PF-006-user-settings-and-agent-definition-authorization/README.md) 要求设置范围明确，但账号级设置 owner/求值契约仍缺。CLI 切换账号时不能沿用前账号的偏好或缓存；未来本地磁盘上的 skills/settings 定位须以可信账号和目标租户为输入，具体布局未定；具体开放注册政策未定。

| 候选 | 责任及兑现方式 | 总负担与关键反例 | 证据状态 |
|---|---|---|---|
| **A：独立账号能力 + 成熟嵌入式认证 provider**（推荐） | 项目账号服务拥有产品 `UserRef`、注册状态与可信主体；Better Auth 类库管理凭据、会话/撤销，适配 SQLite；耐久协调者与 Tenant 建立个人租户，CLI 有多账号凭据槽。 | 需适配认证库 ID/数据库迁移与 Cordis 生命周期，尤其是注册与 Tenant 分仓时的中途状态；CLI device flow 可能要求本地 HTTP/UI，不能先承诺。 | [E4–E6](../../research/account-auth-sources/evidence.md)仅证明机制存在；本项目 spike 未执行。 |
| **B：独立账号能力 + 独立 IdP 服务** | Keycloak 类 IdP 持有注册、登录、会话；本项目映射其 subject 为不复用的 `UserRef`，维护个人租户组合和 CLI OIDC/device 登录。 | 增加首版单机部署的服务、数据库、备份、升级与离线依赖；IdP 成功注册仍可能先于 Tenant 发布，恢复问题未消失。适合已有组织 IdP 或要求集中身份管理的部署。 | [E7](../../research/account-auth-sources/evidence.md)支持 IdP 功能；本产品部署成本/可靠性未实测。 |
| **C：扩展 Tenant 为账号和认证权威 + 成熟认证组件** | Tenant 在同一边界内创建 `UserRef`、个人租户、成员并管理或委托凭据和会话；可能将账号与租户写入同一数据库事务。 | 若确实有共同存储，原子提交较直接；但尚无租户的注册主体与登录生命周期被绑进租户治理，未来认证方式变更牵动 Tenant。仅把认证库表放同库不能证明其写入能加入 Tenant 同一事务；在外部 IdP 场景优势消失。 | TG-01 的归属和首次 bootstrap 见[设计正文](design.md)；共同事务能力未验证。 |

这三条是不同的权威与部署路径：A 把认证当嵌入式 provider，B 把它变成外部服务权威，C 改变现有 Tenant 的能力边界；不是同一个插件改名。

## 推荐与改变选择的观察

当前推荐 **A**：它顺着 CD-01 已留出的认证边界和 TG-01 的 Tenant 责任划分，复用成熟注册/会话组件，首版单机不必先引入独立 IdP 服务。提案不接受 Better Auth 作为具体 provider；其采用版本、安全修复政策、provider subject 与不复用 `UserRef` 的稳定映射、数据库迁移及 CLI 授权方式仍需 spike。PF-026.C2 要求退出当前登录态后，新交互不能继续凭它访问；spike 必须证明退出成功回执后旧 token/缓存 cookie 均被拒绝，未核实撤销不得报告成功。Better Auth 官方指出 cookie cache 可使已撤销 session 在别的设备上持续有效至 `maxAge`，故采用配置须禁用/约束该缓存或另行验证撤销状态（[会话文档](https://better-auth.com/docs/concepts/session-management)）。官方安全政策只支持最新版，正式选型须核对升级责任（[来源](https://github.com/better-auth/better-auth/security)）。

如果本项目已有必须共用的组织 IdP、集中 SSO 或独立部署的硬要求，B 可能胜出。如果单一事务是经故障实验验证且确为必要、而独立边界无法在可接受恢复语义下闭合，C 才值得重议；不能仅因跨 owner 流程难写便转移账号权威。无论选哪条，注册准入政策和中途失败必须明确。
