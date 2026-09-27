# D-092：真实鉴权验收启动投影的精确技术采用

2026-09-27。主线依用户对 model-request-runtime 实施、严格按接受设计施工及主调度/验收的授权，技术采用 [auth-bootstrap 三候选](../../proposals/model-request-adaptation/auth-bootstrap.md)的 A，以及 [应用 v3-auth-bootstrap rev1](../../../realization/apps/model-request-acceptance/v3-auth-bootstrap-design.md)，原设计字节 SHA `838952d20f001a224033ec68eedfb4e6a6eb4e6f13900dd3ec1429ed1a1e4be7`。精确替代范围是 D-076 应用 revision2 的 A-1/A-2/A-6 与 bootstrap2/3，仅在真实身份、目录、model-only CCL 阶段。原 design.md 字节和其它阶段、provider 契约保持原坐标。

采用的顺序：同一个 guard 打开同一个实际 storage，先完成本阶段全部迁移；局部 storage 贡献、clock、credentials、AI、OG、registration 固定六 fiber 全 ACTIVE 且真实 clock 可用后确认升级；成功确认后才加载目录 management、唯一 CCL 与借用 lookup；固定完整八 fiber 全 ACTIVE 且未开始关闭才开放真实注册/issue/exchange/currentTenant/standing/source/bind/store 场景。配置、预置密钥、显式等待策略、真实资格与可信来源对遵守投影。bootstrap构造/传递reader，不执行受限读取；CCL 唯一 close owner 为应用。

明确接受的成本：确认后目录或 CCL/lookup 启动失败不能恢复旧升级快照；已迁移库和已提交清单保留。应用关闭准入、排空真实工作、顺序撤借用者和唯一 CCL/基础 fiber，最后 await 真实 storage.close；重开按 provider 公共幂等/认回规则读取实际状态，不整段重放注册/来源操作。基础 clock 租约是确认前允许的明示元数据；不因此放行账号、登录、成员、发布清单、绑定、副本业务写。guard确认删除生效后目录落盘失败的原 storage 缺口保持，pending clear 不证明确认或恢复成功。

独立 architecture-reviewer 对相同 HEAD `2fd302ce` 和设计 SHA 的只读评审在本次范围内没有阻断。其依据包括实际 UpgradeGuard.confirm 只要求本 storage serving、六基础启动体无业务方法调用（clock租约除外）、目录真实 preprovide提交、currentTenant真实核login及额外standing、实际 storage close所有权。原计划评审的启动环由该精确替代消除；不是宣称原规则本已允许提前确认。评审未运行产品/形式测试，AB-V1～V8全部仍待。

本决定不改领域 Schema或registry契约版本，不新增绑定，不接受完整CCL、通用身份/资产平台、modelRuntime十三操作、网络、37官方定义或认证。逐符号导入/构造/闭包传递/调用守卫须单独交付；普通规则通过不代验。候选标签保留起草时状态，应用当前可消费范围由本决定点明。人的总体交付接受未发生。
