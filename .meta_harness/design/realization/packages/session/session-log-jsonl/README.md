# session-log-jsonl

**2026-09-27 恢复识别增补**：[D-085](../../../../record/decisions/session-log-recovery-projection-adoption/decision.md) 已技术采用 [v3-recovery-design](v3-recovery-design.md) rev2（SHA256 `ea205862968dbe54889d7ba4b80ffcb33e04318c5ba8a82fb09367c1bbd324ae`）。沿D084补每日志预写active／健康clean和必填processOwnership，标记及锁不代证旧物理进程退出，三操作业务面不变。当前仅采用设计；真实宿主观察、10项恢复oracle及所有调用者／双语README迁移仍待，新增bindings0。施工spoke部分源码检查不构成本节点最终验收，下方较早“尚未建包”等按其日期读取。

**2026-09-27 当前增量**：[D-084](../../../../record/decisions/session-log-jsonl-v3-projection-adoption/decision.md) 已技术采用 [SL3 提供者投影](v3-design.md) rev 2（SHA256 `f8561eed58597fbb972d474b14648f74f74cafae3d1125f7813a45a4c241b351`），消费 D-083 已接受的 session-log/v3。当前实施面为必填 condition 的四参数 append、两读面及独立闭包／薄插件；不可信态三操作 unavailable，旧 V-5 的读旧尾预期由 SLJ3-V8 替代，其余 IO 义务保留。旧三参数不兼容；RT3 等实际消费者须显式采用新版本和停旧写方后接入。当前尚未建包、绑定0、真实验证未完成。下方首稿状态按其 SL2／2026-09-25 范围读取，不以历史设计状态代新版实现证据。

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿，尚无实现修订。兑现 `omne-harness-lite-design-2026-09-15 · capability.session-log · v2`（[契约](../../../../spec/capabilities/session-log/v2/contract.md)，状态 `accepted`，已接受、已冻结）的**全部条款**，作为它第十一节说的「本版的最小提供者」（[D-063](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1）
- 源码位置：`packages/session/session-log-jsonl`——**尚未建包**。第一层 `session` 已由产品负责人接受（[D-064 ⑱](../../../../record/decisions/assets-runtimes-rulings-2026-09-26/decision.md)）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 公开面：**公开函数面**是追加的三道判定与表示层校验、判定态的折叠、日志行的编解码（纯函数），以及不依赖 Cordis 的闭包 `openJsonlSessionLog`（候选名，自己持属主锁与文件句柄）；**Cordis 服务面** `sessionLog` 是它的一种消费者，另加「据点根一份」、撤除时的排空次序与配置校验（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）
- 契约采用与边界依据：**一个 Cordis 插件、一条 fiber，不 inject 任何服务**（会话日志落文件系统 JSONL，[D-026](../../../../record/decisions/infrastructure-persistence-choices/decision.md)；不用 `storage`、不用 `clock`——条目壳本版不带时刻，契约 G-4）。
  它**取代**据点装配[验收装配](../../../apps/cli/design.md#验收装配)里「会话日志」那一行原先的替身；**真承接者**是 loop 与会话那一程（契约 [G-1](../../../../spec/capabilities/session-log/v2/contract.md#十已知缺口)，据点装配缺口 C-1）。
  **只兑现窄口，不扩展契约**：条目壳的其余字段、封存、投影协议、追加通知一概不做。
  产品据点清单**本版不装它**（据点装配[关键选择 5](../../../apps/cli/design.md#关键选择)）；装上它会完整工作——它不缺写入方，缺的是调用方（agent loop，C-8）

## 分层状态

四项分别陈述，不互相补齐。

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：本节点声称兑现的条款逐条对在 [design.md 的投影表](design.md#契约责任到插件服务与操作)：S-5～S-24 的全部规矩与三个操作。**尚未建包、没有一行源码**。
  声称兑现的范围里有四处**有前提**：判重（S-8）在派生索引那一段上靠「同一折叠版本写入、日志根不被外部改写」两条前提，内容错而结构对的索引打开时查不出（SLJ-11）；提交即持久对「操作系统崩溃与断电」按本节点的刷盘政策（每批 `fdatasync`，[关键选择二](design.md#关键选择)，主线已裁（[D-060 §八 N-40](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）接受）兑现，但**跨两种存储的断电次序不保证**——SQL 一侧按 D-027 仍可能丢最后一段（已知边界 SLJ-2）；单写者靠本机文件锁，**网络文件系统上不成立**（SLJ-7）；插件重跑时新实例若早于旧实例放锁，新实例启动失败（SLJ-4，待核对主张）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空**。契约的形式任务 `session-log-v2-appends` 证的是契约的模型（判定与写入同一步、判重读耐久内容这两个前提的必要性），**不是本节点实现的证据**，不绑；本节点没有源码、没有测试。证据形式逐条记在 [verification.md](verification.md)
- 实际验证：**尚无**。没有源码、没有测试、没有集成运行

## 按当前问题展开

| 当前问题 | 阅读入口 |
| --- | --- |
| 目录与文件怎样分、一行是什么、半截的尾行怎样丢、索引怎样重建 | [实现设计：落盘形状](design.md#落盘形状) |
| 判重与栅栏怎样「判定与写入同一步」、共同存储对象是什么、两条交错怎样反证 | [实现设计：关键选择](design.md#关键选择) |
| 三个运行时消费者的 L／RL 要求在这里落在哪 | [实现设计：消费者要求的承接](design.md#消费者要求的承接互指) |
| 策略配置项与初值 | [实现设计：策略配置项](design.md#策略配置项) |
| 装卸配对、在途追加归谁 | [实现设计：成对的装载与撤除](design.md#成对的装载与撤除) |
| SL3 四参数条件、同文件比较／整批提交、未知恢复与迁移 | [已采用增量](v3-design.md)及[D-084](../../../../record/decisions/session-log-jsonl-v3-projection-adoption/decision.md) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空） |
| 证据义务、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
