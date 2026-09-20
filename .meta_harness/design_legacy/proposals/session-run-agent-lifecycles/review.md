# 独立评审 r1：三个决定点与分布前提

[提案索引](README.md) · [状态机与级联](lifecycles.md)

2026-09-14，用户派发 architecture-reviewer 对联合计划稿（主检出
`tmp/next-design-prep/session-run-agent-plan.md`，基线 spoke `design/dsh-e-loop-inbound@5b9c821`，
需求基线 `6f7f1de`）做只读评审，范围限 D1 契约拆分、D2 run-driver 引用、D6 组合契约身份，
以及"Run 独立权威可分布"的前提与 §4a 的 TLA+ 范围。评审未运行任何工具，未接受任何决定。
下文为评审原文（去掉了工作树路径前缀），处置表在末尾。

## 发现（按严重度）

1. **[阻断前提] D1 把同提交条款变成无人拥有的跨能力原子关系。** SR-06（取项+建 Run+占位+epoch
   同提交）、SR-12/RD-15（终态与占位释放同提交）、SR-17（裁决与终态同域全序）、SR-20（结算与
   接续同提交）、SR-21（take*/重取等裁决）在 v2 内是能力内部承诺；拆成 session/run 后成为跨
   能力承诺。CC-01 明言"原子关系仅限本契约明确的组合"，清单无"裁决↔Run 终态""结算↔接续
   转换"。§0 说形状 2"用 CC v1 具名组合"，但 CC v1 未承认。后果：I-13/I-14 失去保护位置
   （否定变体 splitSettle 已给出分裂反例）。建议：拍板前先定 CC v2 扩清单，或由组合契约承载
   并说明其与 CC-01 的关系。
2. **[阻断前提] §3 理由(2)混淆"驱动器实例可迁移"与"Run 权威可另置协调域"。** 前者
   D-012/D-013 已设计（驱动器只是消费者，Yield/重取）；后者与 CC-01、DR-01（异域不自动原子）、
   SR-06/17/20、live-agent v1"单一逻辑协调权威、未规定租约/接管"直接冲突。用它作 D1 理由是
   把未证明性质当依据。建议 D1 只以用户目标 1 为据，(2) 改写为"边界就绪"。
3. **[重要] 决定与版本簿记。** D-012/D-013 以 session-run v2 为"精确对象"，拆分需 D-014 声明
   对二者的部分取代范围（仅工件身份）并给 change_basis（用户目标 1 可作输入变化）。catalog
   能否表达 id 级后继未核（metadata.md 未读）。另一未决政策：D-013 曾允许"合并前原地修正"
   RD-04；spoke 未合回时 v2/run-driver v1 是否算"已发布"决定 D1/D2 是否需要 superseded/v2，
   需用户裁定。
4. **[重要] D1 分配表粒度不够。** 需逐句归属：SR-07 命令 Run 终态映射与控制语义（Run 侧）、
   SR-11 前半（新 input 耐久+队列顺序，Session 侧）、SR-12"Session 范围强停置 hold"（Session
   侧）、SR-09 完成条件依赖 Inbound continuation。QueueControl.tla（SR v1）同时覆盖队列与强停，
   证据映射需重做。
5. **[重要] D6 的备选代价论证不成立。** CC v1 已在 ASB v1 之上分层，"两份组合覆盖同一参与者"
   是既有模式；真实判据是 CB-01～14 原文与 Binding.tla 是否不变。风险：Yield/重取已在
   RD-04/RD-14/SR-18，组合再写一份即第二权威；Binding+Lifecycles 合并模型有超时前例
   （全家桶 30 分钟未收敛）。
6. **[一般] D2 备选并不违规**：superseded 仍可被精确引用（仅 withdrawn 禁止）。若 run-driver
   v2 需新增对组合契约的规范依赖，应记为"引用变化含新增依赖"而非"只改引用"；
   verification.md 映射改编号。
7. **[一般] 与 D-013 归属偏差**：D-013 把裁决/调度归 `packages/session/session`；计划稿把调度者
   单独成插件、"裁决读 Run 状态"放组合者。同包属映射细节，另立包需 D-014 记取代。
   "互不 required inject"下 SR-14 启动扫描先于重取由谁排序，须在 cordis.md 明示。

## 结论

- **D1：同意推荐**（用户目标 1 直接要求 `spec/capabilities/<对象>`），须先确认发现 1、3、4。
- **D2：同意推荐**，前提 D1 成立且如实标注新增依赖；备选合规可作回退。
- **D6：建议备选**（新组合身份引用 CB v1，只拥有三条关系、级联矩阵、广播义务，各方义务引用
  RD/SE/RN），除非确认 v2 必须实质改写 CB 条款；理由：保留 D-007 证据与 session design.md
  的 CB 映射，模型更小。
- **分布前提：有条件成立**，仅作边界就绪。条件：首版同域（CC-01）；跨域前须发新版改写
  SR-17（裁决者与 Run 终态同域）、SR-06/12/20 改 CC-05 耐久意图+幂等消费、I-14 改最终性质、
  补旧 epoch 活性/租约（live-agent v1 缺口）、SR-21 等待跨域重定义。这些是领域语义变化，
  SYS-DEPLOY"不改变领域语义"对这些条款当前不满足。
- **§4a 模型：方向对，不充分且不最小。** 缺：裁决者所在域及对 Run 状态的陈旧读（I-13 是最受
  威胁的性质，未列）；SR-21 跨域等待；新 epoch 已发而旧执行者仍提交；"空 Registry 派生重取"
  在多节点非全局事实。TRUE 配置与 RunDriverSched 重复，只应作回归；FALSE 应是仅含形状 2
  三行（结算/接续、强停/占位释放、取批/建 Run）的独立小模型以守 2 分钟。结果只能产出
  "跨域义务清单"，不能证明当前条款可分布。

## 未核查

metadata.md 的 catalog 形状；`packages/core/agent`、persistence、projection 的 design.md 对
组合契约 v2 的消费影响；run-driver v1 scenarios.md 逐条引用；inbound.md 覆盖表；Cordis 可选
注入语义；未执行任何 TLC。

## 处置

| 发现 | 处置 | 状态 |
|---|---|---|
| 1 | 作者核对 CC-01 原文属实。用户 2026-09-14 裁决 D1 拆分：[CC v2](../../../spec/compositions/core-work-coordination/v2/contract.md) 把声明规则改为"本契约及同一协调域内发布的组合契约明确声明的组合"，[LC-04](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md) 逐行声明形状 2 的行 | 已闭合（D-014） |
| 2 | 采纳：A-12 理由 (2) 改写为"边界就绪"；D1 只以用户 U-17 为据；§4a 结论改为"跨域义务清单" | 已修订 README、lifecycles.md、计划稿 |
| 3 | 用户裁定已接受工件算已发布：[D-014](../../decisions/D-014-session-run-agent-lifecycles.md) 对 D-008/D-012/D-013 声明部分取代（仅工件身份）并记 change_basis；session-run v1/v2 与 run-driver v1 标 superseded 而非原地重构 | 已闭合（D-014） |
| 4 | 采纳：[session.md §2](session.md#2-条款逐句归属) 给出逐句条款归属表，含 SR-07/09/11/12 的拆分 | 已闭合（波 2） |
| 5 | 采纳：用户裁决 D6 新组合身份 `composition.session-run-agent-lifecycles` v1，引用 [CB v1](../../../spec/compositions/agent-session-binding/v1/contract.md) | 已闭合（D-014） |
| 6 | 采纳：[run-driver v2](../../../spec/capabilities/run-driver/v2/contract.md) 如实记对生命周期组合 v1 的新增依赖 | 已闭合（D-014） |
| 7 | 采纳：裁决者、调度者与组合者留在 `packages/session/session`（同包内独立插件），不取代 D-013 归属；扫描先于重取的排序归调度者插件，写入 [cordis.md](cordis.md#2-插件与服务依赖) 与 [Session 设计](../../../packages/session/session/design.md#1-插件与服务) | 已闭合（波 2/3d） |
| §4a | 采纳：FALSE 配置为只含形状 2 三行加陈旧读、旧执行者迟到提交、SR-21 等待的独立小模型；TRUE 配置只作回归 | 已修订 lifecycles.md 末节 |
