# 身份与组织租户集成设计的限定接受

状态：设计已采用，产品实现和领域验收未完成。

负责人 panqiwei 授权主会话实施架构整改、按独立增量验证和合入。
主会话在该委托内于 2026-10-04T18:02:31.077484+00:00 采用本次设计，原 BASE 为
`588628544ab92bd542f24efa1801634eb6eee56e`。
这不表示负责人已亲自逐条审阅，也不把评审者当作接受者。
精确正文及散列见 [inputs.json](inputs.json)，接受对象为 r5 加目标图表达勘误和验收分配补充。

本事件落实 [D-114](../cordis-integration-conventions/decision.md)、
[D-115](../actual-architecture-and-thin-spec/decision.md)，沿用其
[架构判断来源](../../../../research/architecture-judgment-aids/research.md)。
旧业务输入和接受坐标见[保持表](../../../architecture/identity-integration/preservation.md)。

## 接受范围

- 接受账号、登录、凭据接缝、注册、组织四面、客户端公共操作/状态/传输、入口/宿主的
  定义/提供者/绑定/装配分工。公共根与 `./cordis` 分离，操作全集及原业务语义保持。
- 接受共享的逐行资源协调机制：同步独占接管、即时资格失效、资源按消费者结束的逆序关闭、
  独立观察真实关闭结果。它不重新实现 Cordis 服务发现，不强迫外部工作完成。
- 接受单代装配的替换边界。两张网络面共享准入资格，注册在原交接点即时停止续步，
  已交出的工作仍被观察。底层资源保留到完整消费者结束，不能以服务注销替代收场。
- 接受两层插件树、稳定 id、安全来源 DTO、提供者声明与宿主政策分开核验。
  必需和实际存在的可选资源提供者均先于消费者，声明真实性须由实际装配验证。
- 接受句柄先于 apply 的控制协议：ready 交付启动结果，closed 交付实际收尾，dispose 请求取消/停止。
  启动失败和关闭失败分别保留，未知或未完成不被超时转换成完成。
- 接受施工依赖：T2 先完成协调原语、能力工厂，再接手写宿主；T3 接公共客户端与 CLI；
  T4 复用上述责任切换到数据树。每一完整增量独立验收合入后再开始下一增量。

运行接口按[目标设计](../../../architecture/identity-integration/design.md)、
[有序收尾](../../../architecture/identity-integration/retirement.md)和
[插件树协议](../../../architecture/identity-integration/plugin-tree.md)落实。
新公共成员随可运行实现建立，D0 不发布空包或删除仍被消费的旧承诺。

## 取证与独立判断

首轮发现 Cordis 不保证跨消费者排空且吞清理异常，后续发现双面准入、注册续步及旧开闸资格缺口。
第三实质轮的表达审阅还指出启动控制与准备输入缺失。主会话据此停止局部修补，
重新核对合层、声明准备、资源协调、加载控制与宿主政策的完整责任，再形成结构修订。
独占接管和可选依赖次序的反例随后分别闭合。

`identity_d0_choice`、`identity_lifetime_choice_b`、`identity_lifetime_choice_c` 的
独立 Choice 最终均无本轮阻断。`identity_d0_expression` 的表达复审及图补核、
`remediation_plan_review` 的计划及最终验收分配复核均无阻断。
评审未执行产品检查，不等同于 L3 实现评审或 QA。
原快照、逐轮判断摘要和结构诊断由任务归档保全，不能改写早期阻断为一次通过。

已运行的机制证据分别为：

- [Cordis 事实与有限模型](../../evidence/2026-10-04-probe-identity-lifecycle/README.md)。
- [现有 CG/CLS 与真实 SQLite](../../evidence/2026-10-04-probe-identity-lifecycle-2/README.md)。
- [双面准入与注册续步](../../evidence/2026-10-04-probe-identity-lifecycle-3/README.md)。
- [启动控制与双失败](../../evidence/2026-10-04-probe-identity-lifecycle-4/README.md)。
- [独占接管和可选依赖次序](../../evidence/2026-10-04-probe-identity-lifecycle-5/README.md)。

这些是声明范围内的真实机制/现有组件观察及有限安全枚举。
它们不验证正式新 API、全部提供者、任意拓扑或完整 TLS/Unix/SQLite 宿主，也不证明无条件进展。

## 保持、取代与后续门

账号/登录身份、凭据代际、租户授权、原错误优先、数据表示、幂等及通知语义保持。
注册仍是 produce→createPersonal→activate 的独立提交链，不改为全链事务或增加补偿。
OG/入口的精确同提交参与例外保持，不扩展为任意具体提供者导入。

本事件只改变集成投影的接受状态，不整体取代旧业务契约、Schema URI、模型或冻结。
类型与薄规格迁入、全部消费者和证据义务接续、删除后验证通过之前，旧源仍有效。
OG2/AR2 formal README 未登记的旧缺口继续由 T2 收齐输入，N5/N6 完成登记迁移。

D0 合入只完成设计门。T2-01b、T3-03b、T4-05b 仍分别要求独立 QA 在最新 main
冻结具体驱动、原断言/阈值、已知失败并记录实际 BASE 行为，完成前不得开始对应实现。
正式资源绑定、完整 setup/close 故障、真实宿主/CLI/制品及受影响原模型按
[施工与验收](../../../architecture/identity-integration/delivery.md)执行独立 L3。

N1～N4、R1-T1 的原接受不改写。R1-T2～T5、R2、R3、N5～N8 均未完成。
IR-CC-1、QA-FAC-1、EIS 超时和原 45 秒冷恢复因果责任继续保留；PostgreSQL 整体恢复、
完整 Agent/Tool Runtime 和 Session 产品能力不由本事件接受。
本次未运行全量 make check、检查/合并队列、完整基准或付费模型调用。
