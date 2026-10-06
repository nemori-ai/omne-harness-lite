# Package adoption review

This record covers the first template PR. It records manual decisions, not business or system acceptance.
The current marker remains in each package.json. Re-scan after any source or template change.

Every marked package received a complete tree check and a review of its public responsibility, applicable integration rules and existing behavior owner.
Unresolved architectural classifications remain visible in scan output. They are not automatically violations or acceptance evidence.
Accepted legacy behavior and verification sources remain effective until their consumers and evidence duties migrate.

## Reviewed adoption

| Package | Variant | Manual finding |
| --- | --- | --- |
| [packages/core/account-identity](../../../../packages/core/account-identity/README.md) | service-contract | Accounts/Logins/Credentials 三面及命名空间事件；SPEC 保持参与、凭据捕获和提交后通知。 |
| [packages/core/account-registration](../../../../packages/core/account-registration/README.md) | service-contract | Registration 定义不持有提供者；SPEC 明确三次提交、停止与清除链。 |
| [packages/core/agent-definition](../../../../packages/core/agent-definition/README.md) | module | 纯 body 判断及无损输入提取；不读取资产或授予权限。 |
| [packages/core/arrival-events](../../../../packages/core/arrival-events/README.md) | module | 公开信封形状、固定 Schema 与 fills reduction；不提供传输或可靠投递。 |
| [packages/core/assembly-lifecycle](../../../../packages/core/assembly-lifecycle/README.md) | service-contract | 唯一 AssemblyLifetimeService 与管理 helper；源/模型属于协调机制，不添加业务 Service。 |
| [packages/core/asset-model](../../../../packages/core/asset-model/README.md) | module | 纯资产值和显式注入 body contracts 的判断；JSON 例子归 tests/fixtures，原有效行为源保持。 |
| [packages/core/call-accounts](../../../../packages/core/call-accounts/README.md) | module | 精确十进制账值判断/汇总；无服务查询、日志写入或费用所有权接管。 |
| [packages/core/client-local-state](../../../../packages/core/client-local-state/README.md) | service-contract | ClientLocalStateService/ClientStateStorage 唯一双键；记录、快照和关闭承诺有实际拥有者。 |
| [packages/core/content-blocks](../../../../packages/core/content-blocks/README.md) | module | 严格无损 JSON、块形状与公共 Schema；无工具执行/资源获取，JSON 新薄承诺与未迁源范围明确。 |
| [packages/core/cordis-plugin-tree](../../../../packages/core/cordis-plugin-tree/README.md) | cordis-module | prepare/load 是绑定协调机制；RowLifetime 是私有端口，不能据 provide 事实误选公开 Service 提供者变体。 |
| [packages/core/execution-environments](../../../../packages/core/execution-environments/README.md) | service-contract | 两公共 Service 与纯数据捕获函数；无进程/后端实现，SPEC 约束恢复、落点和作用域。 |
| [packages/core/governance-center-entry](../../../../packages/core/governance-center-entry/README.md) | service-contract | EntryOpening/EntryMaintenance 与四通知；纯根只含公共形状和通知常量。 |
| [packages/core/governance-center-entry-https-json](../../../../packages/core/governance-center-entry-https-json/README.md) | service-contract | GovernanceTransportService 只定义单次交换；无网络提供者或关闭资源复制。 |
| [packages/core/governance-client-operations](../../../../packages/core/governance-client-operations/README.md) | service-contract | 公共 ActionIntent/使用期/关闭观察与正式服务分面；定义包不选择客户端提供者。 |
| [packages/core/identity-values](../../../../packages/core/identity-values/README.md) | module | 身份解析、树关系和签名是独立公开函数；无注册服务或隐含租户权限，实际 Schema 字节/身份保持。 |
| [packages/core/kernel-basis](../../../../packages/core/kernel-basis/README.md) | cordis-module | 已接受纯结果/绑定/testing 三分面；泛型键抽取 unknown 已按真实探针与 D-114 适用范围人工核对，增加既有 helper 薄规格及合规范例。 |
| [packages/core/loop-extension](../../../../packages/core/loop-extension/README.md) | module | 定义、经过和结果判断；规范 JSON 输入归 fixtures，执行/日志责任属于 runner。 |
| [packages/core/loop-extension-runner](../../../../packages/core/loop-extension-runner/README.md) | service-contract | 三公共 Service、整批定位值和独立映射；调用方 effect 与贡献代际在 SPEC 明确，未迁 runner 协议仍有效。 |
| [packages/core/mcp-endpoint](../../../../packages/core/mcp-endpoint/README.md) | module | 端点形状判断和显式 body contract；不建立 MCP 连接。 |
| [packages/core/messages](../../../../packages/core/messages/README.md) | module | 消息及技术记录的形状、严格判断与纯映射；不声明持久写入或 Run 恢复实现。 |
| [packages/core/model-profile](../../../../packages/core/model-profile/README.md) | module | 精确档案值判断及固定 Schema；不选择目录提供者或发送模型请求。 |
| [packages/core/model-response](../../../../packages/core/model-response/README.md) | module | 模型回复/终结形状及无损校准复制；不接管请求、取消、费用或 ACK 释放责任。 |
| [packages/core/offer-expiry](../../../../packages/core/offer-expiry/README.md) | service-contract | 纯值、ClockService 和唯一 clock 键；不选择租约策略或复制时钟实现。 |
| [packages/core/organization-governance](../../../../packages/core/organization-governance/README.md) | service-contract | 四抽象 Service 和五通知共用公共定义；同提交、清除及未实现 OG3 的范围分别保留。 |
| [packages/core/runtime-context](../../../../packages/core/runtime-context/README.md) | service-contract | RuntimeContextService 唯一键及无载荷唤醒事件；SPEC/Observation 模型维护来源撤代、原工作和实际排空。 |
| [packages/core/skill-package](../../../../packages/core/skill-package/README.md) | module | 技能值判断/文件读取与显式版本入口；不执行技能脚本或装配服务。 |
| [packages/core/slash-command](../../../../packages/core/slash-command/README.md) | module | 命令识别、参数展开及显式已选择技能；不作授权或选择具体运行时。 |
| [packages/core/storage](../../../../packages/core/storage/README.md) | service-contract | 存储/启动/完成服务定义与 conformance 分面；参与身份和真实物理完成责任保持。 |
| [packages/core/stream-assembly](../../../../packages/core/stream-assembly/README.md) | module | 传入事件的公开状态转移函数；不建立 transport、调用工具或注册 Cordis 服务。 |
| [packages/core/tool-definition](../../../../packages/core/tool-definition/README.md) | module | 工具形状、参数 Schema 判断及返回映射；测试 JSON 输入归 fixtures，不提供工具执行。 |
| [packages/core/tool-execution-runtime](../../../../packages/core/tool-execution-runtime/README.md) | service-contract | 四正式 Service、纯 codec/judge 与公共 schema；作者登记归调用方效应，SPEC 定义取消、结果和保有关闭责任；不等于 local 后端验收。 |
| [packages/frontend/client-local-state-sqlite](../../../../packages/frontend/client-local-state-sqlite/README.md) | service-provider | LocalStateService 继承公共定义；私有持久目录和 SQLite 工厂通过服务注入，close 等真实工作。 |
| [packages/frontend/governance-center-client-https](../../../../packages/frontend/governance-center-client-https/README.md) | service-provider | TransportService 继承定义；单次网络工厂与独立/管理绑定共用原实例及关闭。 |
| [packages/frontend/governance-client-operations-local](../../../../packages/frontend/governance-client-operations-local/README.md) | service-provider | ClientService 消费两公共依赖；管理关闭观察资源与原客户端实例配对。 |
| [packages/infra/clock-lease](../../../../packages/infra/clock-lease/README.md) | service-provider | LeaseClockService 继承 ClockService；存储与寿命注入，持久策略和 ADR 位于正确位置。 |
| [packages/infra/storage-sql](../../../../packages/infra/storage-sql/README.md) | service-provider | SqlStorageService 实现共享存储定义；owning/borrowed 生命周期及同实例事务例外不扩大。 |
| [packages/tenancy/account-identity-sql](../../../../packages/tenancy/account-identity-sql/README.md) | service-provider | AccountsSqlService/登录同源实例；storage/clock 必需注入，credentials 调用时捕获，管理真实收尾。 |
| [packages/tenancy/account-registration-sequential](../../../../packages/tenancy/account-registration-sequential/README.md) | service-provider | Registration 提供者捕获 accounts/organizations/purge；步骤终止和实例关闭承诺保留。 |
| [packages/tenancy/credential-verification-scrypt](../../../../packages/tenancy/credential-verification-scrypt/README.md) | service-provider | 公共 Credentials 子类；独立 scrypt 闭包，不把撤除当凭据计算完成。 |
| [packages/tenancy/governance-center-entry-node](../../../../packages/tenancy/governance-center-entry-node/README.md) | cordis-module | 双网络面是已接受服务端绑定/工厂；不凭插件数量造公共业务 Service，资源服务和事件依赖显式。 |
| [packages/tenancy/organization-governance-sql](../../../../packages/tenancy/organization-governance-sql/README.md) | service-provider | 四公共 Service 共用数据实例；参与、通知和真实关闭沿 R1 接受，不制造独立事务。 |
| [packages/util/unix-format](../../../../packages/util/unix-format/README.md) | module | 只返回字符串的输出格式化；无运行时依赖或隐含 Service，provenance 保留实际来源。 |
| [packages/util/xml-format](../../../../packages/util/xml-format/README.md) | module | 显式字段规则驱动 XML 字符串；无运行时依赖或 Service，provenance 保留实际来源。 |

## Packages without a marker

These packages remain visible in every inventory. Absence is not an automatic finding of nonconformance.
Do not add a marker until the specific missing resource or integration qualification is complete.

| Package | Remaining scope |
| --- | --- |
| [packages/agent-loop/loop-extension-runner-local](../../../../packages/agent-loop/loop-extension-runner-local/README.md) | 缺少提供者薄 SPEC；完整运行、贡献关闭及公开五类依赖仍需 H4/H6 核对。 |
| [packages/assets/assembly-manifest-store](../../../../packages/assets/assembly-manifest-store/README.md) | IC-2 普通对象发布与 6 条 IC-4 根闭包偏离；H3 承接，不贴模板标识。 |
| [packages/assets/evaluation-input-store](../../../../packages/assets/evaluation-input-store/README.md) | 缺少本包薄 SPEC；R1 的共享路径证据不能替代提供者全量集成核对，H4 承接。 |
| [packages/core/assembly-manifest](../../../../packages/core/assembly-manifest/README.md) | 缺少真实 tests 与薄 SPEC；已有抽象 Service 不等于全部模板资源已经接续。 |
| [packages/core/asset-evaluation](../../../../packages/core/asset-evaluation/README.md) | 已有 SPEC 只接续环境扩展；完整公共集成与旧操作条款尚需按 H4/H6 实际范围核验。 |
| [packages/core/asset-registry](../../../../packages/core/asset-registry/README.md) | 缺少模块薄 SPEC；公共类型存在不代表当前 registry 提供者/共同行为已经整改。 |
| [packages/core/model-profile-directory](../../../../packages/core/model-profile-directory/README.md) | 缺少真实 tests 与薄 SPEC；H4 五类公共依赖整改仍未完成。 |
| [packages/core/model-request-runtime](../../../../packages/core/model-request-runtime/README.md) | 当前 SPEC 只接续 retryDelay 和档案验证扩展；完整十五操作/五依赖及 Session 责任须 H4 迁移，不将局部源判为全量达标。 |
| [packages/core/session-log](../../../../packages/core/session-log/README.md) | 缺少本包真实 tests；log source/bind/backing 已有规格，完整定义与提供者集成仍需 H4 核对。 |
| [packages/core/session-tenancy](../../../../packages/core/session-tenancy/README.md) | 缺少本包真实 tests；已有作用域类型与附加核验条款不能代替完整 H4 公共依赖验收。 |
| [packages/core/tool-admission](../../../../packages/core/tool-admission/README.md) | 缺少本包真实 tests；不为 adoption 造空测试，保留阶段二真正验收义务。 |
| [packages/infra/credential-custodian-local](../../../../packages/infra/credential-custodian-local/README.md) | 独立凭据借用工厂仍消费旧实现协议，完整新模板行为归属/资源集成待核，不因纯根可加载就贴标。 |
| [packages/infra/execution-environments-host](../../../../packages/infra/execution-environments-host/README.md) | 新增管理和环境恢复边界涉及真实 OS 资源；本 PR 不以 SPEC 存在替代提供者全量集成验收。 |
| [packages/model/model-profile-directory-local](../../../../packages/model/model-profile-directory-local/README.md) | 缺少本包薄 SPEC；实际可换代档案服务与历史/注册面待 H4 核验。 |
| [packages/model/model-request-runtime-local](../../../../packages/model/model-request-runtime-local/README.md) | IC-2 普通对象 modelRuntime 发布仍在；仅补公开已有 SPEC 的打包清单，H4 处理完整生命周期。 |
| [packages/model/pi-ai-transport](../../../../packages/model/pi-ai-transport/README.md) | 缺少本包薄 SPEC；tokenizer 资源归 resources 并保持字节，transport/档案/策略全量集成待 H4，归位不等于请求整改。 |
| [packages/session/runtime-context-local](../../../../packages/session/runtime-context-local/README.md) | 来源/日志/Session 的生命周期组合需提供者完整核对；此处不能用定义包或部分验收提升 local 状态。 |
| [packages/session/session-log-jsonl](../../../../packages/session/session-log-jsonl/README.md) | 物理 JSONL owner 与 source/backing 的发布/撤除组合尚需核验；独立工厂不是完整 Cordis 提供者整改。 |
| [packages/session/session-tenancy-table](../../../../packages/session/session-tenancy-table/README.md) | SPEC 仅接续 maintenance/seed 增量；holdingTenant 和模型恢复消费仍须 H4 核对完整公共依赖。 |
| [packages/tools/asset-registry-local](../../../../packages/tools/asset-registry-local/README.md) | 缺少真实 tests，README 明确 scaffold/component checks 未通过；不伪称已完整交付。 |
| [packages/tools/tool-admission-local](../../../../packages/tools/tool-admission-local/README.md) | 动态 host、真实日志借用及恢复责任仍需提供者完整核验；三个动态绑定抽取 unknown 不被静态无偏离替代。 |
| [packages/tools/tool-execution-local](../../../../packages/tools/tool-execution-local/README.md) | 动态作者/日志/资源恢复与保有关闭仍需全量提供者核验；静态 unknown 与完整业务接受分别保留。 |
| [packages/tools/tool-result-files](../../../../packages/tools/tool-result-files/README.md) | 文件发布、实际 IO 排空和 scope 服务共同责任尚需独立完整核验；泛型 Service unknown 不是符合证据。 |
