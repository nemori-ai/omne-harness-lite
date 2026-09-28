# 真实鉴权验收阶段的确认与目录装载

2026-09-27。本提案补本包独立验收应用的一个实际启动循环，范围限于真实身份、目录和 model-only CCL。依据是 [D-075](../../decisions/model-credential-source-projection/decision.md)、[D-076](../../decisions/model-runtime-delivery-adoption/decision.md) 与原应用 [design.md](../../../realization/retired/model-request-acceptance/design.md)，不重开产品目标或提供者领域契约。

原应用要求全部 mandatory fiber ACTIVE 才确认升级且确认前无业务提交；目录已接受的 preprovide loadManifest 却先耐久采用清单再发布。合法空清单同样提交正序号。原计划独立评审据实际源码发现 `confirm → manifest commit → directory ACTIVE → confirm`，现有公共接口没有只构造但不采用清单的模式。不能由仅有 app 权限的实施者自行选择绕过。

## 三个实质候选

| 候选 | 保护位置和后果 | 最强理由与成本 |
| --- | --- | --- |
| A：应用分阶段确认 | 全迁移和固定六基础 fiber 就绪、同一真实 clock 可用后确认；随后加载目录/CCL/lookup，固定完整八 fiber 就绪才开业务场景 | 保持 storage 的 serving 前提与目录 preprovide 提交，不改 provider 公共面。成本是确认后目录/CCL/lookup 启动失败不能整库回退；app须明确部分启动 cleanup，基础启动体以后新增业务写须重审 |
| B：目录延迟业务采用 | 改目录提供者为先构造发布、再在确认后通过明确操作采用清单；所有构件可在确认前试装 | 可扩大可回退范围；须演进已接受目录生命周期、暴露 readiness/业务调用门并重验所有目录消费者，不能在 app 私自令旧目录不写 |
| C：沿原 storage 插件，另取实际关闭回执 | 使用原 storageSqlPlugin 资源 owner，建立能够观测其真实 close/pending 的回执接线，再分配确认和业务采用责任 | 少一段借用 storage 的局部贡献；仍须闭合旧全ACTIVE循环，且 await disposer 不能证明底层关闭，可能涉及 storage 插件公开回执演进 |

推荐 A，并把确认后无法整库回退作为明确采用成本。必要共同对象仍是同一个实际 AtomicStorage 和 `model_credential_binding(tenant)` 行；不新增跨 owner 原子启动，不把确认当目录业务事实提交，不自动重放注册/bind/store。来源与权限保持 D-075 的逐符号许可。

精确投影是 [v3-auth-bootstrap rev1](../../../realization/retired/model-request-acceptance/v3-auth-bootstrap-design.md)，SHA `838952d20f001a224033ec68eedfb4e6a6eb4e6f13900dd3ec1429ed1a1e4be7`。独立 architecture-reviewer 只读核对实际 UpgradeGuard、clock 与六基础 provider 启动体、目录提交、真实 currentTenant/standing 和关闭所有权；本次范围内无阻断。基础 provider 初始化不调用业务方法，clock 租约是明示基础元数据；currentTenant 实际核真实 login，仍再调用 standing 核当前资格。该判断不替代 AB-V1～V8 的真实运行或符号守卫。

改票条件：基础启动体出现业务提交、必须恢复“所有后半启动失败也整库回退”、storage serving/confirm 或目录发布顺序改变，均重新比较 A/B/C。未验真实注册/认证、确认故障、关闭交错、重开、资源或秘密泄漏；没有模型网络和付费。选择归 [D-092](../../decisions/model-auth-bootstrap-adoption/decision.md)，本文本身不具有接受效力。
