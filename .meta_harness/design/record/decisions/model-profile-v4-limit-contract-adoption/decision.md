# D-097：模型档案 v4 输入限制契约的技术接受

2026-09-28，主调度在用户持续实施、按规格交付和负责技术验收的授权内，接受 `data.model-profile/v4` 的 S-1～S-33 及四份规范资源；精确摘要见 [acceptance.json](acceptance.json)。这是契约语义接受，提供者设计与实现采用各自明确，不代表 37 模型已经完成。

## 依据与范围

沿 [D-096](../model-profile-input-limits-product-adoption/decision.md) 接受的 PF-013 rev14，以及[既有模型适配提案](../../proposals/model-request-adaptation/design.md)的公共实现与窄数据边界接续。[37 项上游事实报告](../../../../research/model-request-adaptation/reports/2026-09-27-first-party-and-joint.md)说明模型/provider 信息的来源范围；未公开的限额不能冒充已知无限。

保留有限 `maxInputTokens` 和 image 档案必填的有限 `maxImageBytes`，新增 `upstreamInputLimits` 明确 unknown/unbounded/limited；已知有限值约束项目 cap，快照包含两组值。可选 `maxImages`、`maxRequestBytes` 的适用域、单位、精确跨字段关系和六项 updatedAt 变化采用本版精确条款。本次不选择任何模型的 cap 常量或计量算法。

独立 spec-reviewer 完成 MP4 单包及四资源摘要核对：三态/有限供给、适用域、S-33 比较、拒绝优先级、时间变化和历史不回填无阻断。Schema 命名空间与产品依据修订标记的非阻断项已修后复核。作者 74 个实例、42 个引用、14 定义与九条比较检查通过；集成候选登记后整批 design checker `internal/formal=registered` 通过。上述证据不证明真实 validator、目录事务或请求计量。

整批消费者评审发现 MR6 S-40 对快照接收者多加 S-33 重判；已回归 MP4 S-27 的写方义务，MR6 仍单独等待整批复核，不把该问题反向解释成 MP4 表示不完整。模型档案可以独立接受和实施，消费者不得自动跟随升级。

## 取代与交接

本版承接 v3，不修改任何旧冻结资源。采用 v4 的新写方执行本版完整规则；旧调用、旧响应仍由其精确历史格式读取/结算，禁止按缺字段自动猜版或从当前目录补 cap。旧入口的保留与新 root 的采用归提供者设计。

目录4、messages5、response6、loop-extension5、runtime6、runner4 当前是分别登记的候选，尚未被本决定接受。core 模块、目录持久化、传输定义和实际计量须有其已采用 realization 后才能按新契约实施；模型模态、输入来源、缓存命中与 TTL 到期仍须实际验证。本次新增四项冻结资源，不改变旧 covers reviewed 标记，不新增形式任务，不放行完整 service 或模型认证。
