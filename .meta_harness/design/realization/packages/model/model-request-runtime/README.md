# model-request-runtime

本节点描述模型请求的协调责任。公开类型与行为承诺归 [core/model-request-runtime](../../../../../../packages/core/model-request-runtime/README.md)，实际提供者归 [model-request-runtime-local](../../../../../../packages/model/model-request-runtime-local/README.md)。已迁职责按[当前归属](../../../../architecture/pilots/n4-ownership.md)读取；未迁协议和增量仍按其明确的现行采用范围接续。

独立调用能力和正式运行时分开消费。`invokeModel` 是单次调用；正式运行时负责锚点、发出、重试、结算、耐久内容、引用、ACK 与恢复。生产传输由 [pi-ai-transport](../pi-ai-transport/README.md) 提供；计量、日志、凭据和租户事实仍由各自拥有者提供。独立函数或局部用例通过，不能代替正式服务的跨 owner 保证。

## 精确采用范围

| 内容 | 当前拥有者 | 必须保留的边界 |
| --- | --- | --- |
| 统一 store 与组合 close | [统一收口](v10-owner-assembly-design.md#当前采用的收口范围)、[提供者 SPEC](../../../../../../packages/model/model-request-runtime-local/SPEC.md) | 跨日志换代交接 B1 不在采用范围；无键选择命令不承诺恰一次认回，活跃写者仍持有登记 |
| 按来源定界的凭据政策和头交接 | [凭据路径](v6-credential-path-design.md#当前采用范围) | CP-V/PH-V、真实 TLS/socket/reader/回调收口分别验证；不采用 RT6 模态候选或扩展未声明保密保证 |
| CallKey、独立消费者、原执行 owner、私有内容及原完整 Pending/final 关系 | [引用生命周期](v20-reference-lifecycle-design.md#当前采用范围) | unknown 留责、真实停止、当前授权和 SQL/JSONL 分域按 R20 义务核对；ACK 后永久保管/noGC 已被后继取代 |
| 请求期图片准备与真实任务生命周期 | [图片接入](v21-image-preparation-design.md#当前采用范围) | IP-V1～IP-V10、实际停止及资源释放独立验证；不扩大 T29 引用生命周期或完整 Session/Run/Agent |
| 第十五操作 ACK、保留门、Storage 原子释放及 ACK 后 SettlementWork | [ACK 后继](v22-acknowledgement-design.md#当前采用范围) | A22-V1～V16；A22-G2 实际恢复、G3 授权/停止/唯一恢复及 G4 双提交域/内存释放/全入口迁移分别闭合 |

技术采用不表示实现或验证完成。模型、接口签名或包制品存在，不自动关闭上述缺口；接受状态按 [catalog](../../../../registry/catalog.json) 和对应当前拥有者声明读取。

生产 Run 终结、attempt/generation fence、默认重试来源与上下文来源不能由替身布尔量补足。M17-G2/G4、F18-G2/G3、L1/L2 和 G-28 等既有责任仍由各自真实拥有者闭合；本入口不宣称完整 Session/Run/Loop 交付。

## 阅读入口

| 当前问题 | 入口 |
| --- | --- |
| 公开类型、操作及类型之外的行为 | [公共契约](../../../../../../packages/core/model-request-runtime/SPEC.md) |
| local 服务、装卸、存储与实际消费路径 | [提供者](../../../../../../packages/model/model-request-runtime-local/README.md) |
| 已迁责任与未迁协议怎样分界 | [当前归属](../../../../architecture/pilots/n4-ownership.md) |
| 插件、inject、在途责任与跨 owner 共同存储对象 | [基础设计](design.md)、[统一收口](v10-owner-assembly-design.md) |
| 当前接口、恢复、观察与实际来源 | [当前设计](v7-current-design.md)、[恢复](v12-recovery-timing-design.md)、[宿主接口](v11-host-observer-design.md) |
| 哪个资源支持哪条承诺、前提及有限范围 | [绑定表](bindings.yaml) |
| 并发、故障、取消、迟到完成、ACK 与恢复的剩余义务 | [验证方法与范围](verification.md) |

每次执行的输入、输出、评审和接受过程留本工作树 `tmp/<task>/`。本入口只维护当前职责、采用范围、导航与限制，不保存阶段流水。
