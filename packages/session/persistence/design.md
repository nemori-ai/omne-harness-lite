# Session persistence 提供者设计

状态：`f98ac926` 恢复映射已接受为最小运行基线施工输入。现有
[src/index.ts](src/index.ts) 只提供 `/baseline`；目标 `recoverSession` 尚未实现。
[来源入口](../../../docs/proposals/core-capabilities/implementation/runtime-provider-interfaces.md)
保留历史与验证边界。

采用 [DR v1](../../../spec/capabilities/durable-records/v1/contract.md)、
[session v1](../../../spec/capabilities/session/v1/contract.md)（恢复顺序 SE-11、裁决扫描 SE-18）、
[run v1](../../../spec/capabilities/run/v1/contract.md)（RN-08 兼容证据）、
[CC v2](../../../spec/compositions/core-work-coordination/v2/contract.md)；
[D-014](../../../docs/decisions/D-014-session-run-agent-lifecycles.md) 前的 session-run v1 映射
沿 [Session 接口](../../../docs/proposals/core-capabilities/implementation/session-runtime-interfaces.md)
`cd16f1` 保留为历史。当前恢复顺序见下文；状态贡献输入归
[Session](../session/design.md#15-恢复投影与可观测性)，投影缓存归
[projection](../projection/design.md)。`checkpoint` 不再是权威事件
（用户裁决 [U-23](../../../docs/proposals/session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户)），
下文的 checkpoint 均指投影缓存。

## 过程与依赖

候选默认入口 `@omne-harness-lite/session-persistence` 导出具名恢复过程
`recoverSession`。输入为宿主授权范围内的真实 `RecordReader`、同一已同步有效
前缀的 Watermark、Session 公共 decoder/纯 fold 与明确版本清单；输出为给
[SessionHost](../session/design.md) 受限安装面核验的恢复结果及水位/版本依据。
目标签名由公开源码建立。此过程没有 Cordis 服务、inject 或插件；纯解码/
折叠不造空 effect，不增加第二 writer/append/flush 协议。

包只消费 records 与 Session 的公开事件/恢复类型，不让 Session import 本实现。
应用持有 writer/锁/reader 的管理资源，只把受限 reader 交恢复调用。不得经
原 baseline provider handle 从旁写另一份 JSONL；默认入口不能保留这条绕行路径。

## 恢复和清理

恢复校验完整 envelope 的 stream、因果、转移、同批关系和所有相关版本。checkpoint
必须绑定原 namespace、SessionRef、输入 kind/version、fold/schema 和完整源水位；
它只能加速已验证前缀，越界/错 Session/未知版本明确弃用重建或 unavailable，
不能 deserialize 失败后默认空。

只在真实“新建且无状态”事实下初始化空根。unknown kind、必需 contribution
缺失或完整安全前缀与业务状态不一致是具名恢复错误，不用投影丢失解释。当前
装配开放的 TL/HD/执行 owner 要在相同域水位兑现自己的 decoder/恢复责任；
缺其必需信息不能声称整个域恢复完毕。未开放 HD 不伪造 pending 请求为空；
若日志存在该事实而无 owner，依赖路径关闭。

读取游标/快照只属于本次恢复；完成、取消或失败都释放其实际 reader 使用，
晚到输入不安装到后来的 host generation。reader 本体/锁的最终释放仍归宿主。
部分失败留下错误位置/版本/已验证水位，原日志保留；没有外部写入可以“回滚”。
过程成功也不证明工具已停止、授权仍有效或可以重发 unknown：原执行 owner
核实 attempt，Session/AR/TG 重新取得当前运行资格后才恢复工作。

## 实施与验证

先消费真实 P1 reader 和 Session 默认 decoder/fold，再验证 S07/S08/S10 对
allow 基线的子场景：真实 fsync/回执窗口重启、错误 Session checkpoint、未知
版本、缺参与 owner、完整同批关系与原已完成结果。原效果不重发、unknown 不
归成功。当前没有这些产品恢复测量；源算法测试及文档迁移不抵扣。

## 实施协议的采用来源

下列状态、记录、端口和算法从已接受的 `cd16f1` Agent/Session 输入迁入，
迁移源快照为 `7e758f21f8f92c1d46fab194fdaf120239b8e11c`。
原稿只保留受审/接受和取舍历史；本页拥有所列当前提供者设计，语言无关承诺
仍归所采用的精确 spec。接口记法不等于已经存在或发布的产品 API。

## 恢复顺序与开放边界

恢复顺序固定（[SE-11](../../../spec/capabilities/session/v1/contract.md)、
[提案 session.md §7](../../../docs/proposals/session-run-agent-lifecycles/session.md#7-恢复顺序persistence-设计的输入)）：

1. records 提供者持锁扫描并重新同步有效前缀（DR-03/04）；
2. 全部 owner 的 decoder 与纯 fold 在同一 Watermark 装载：Session 的 session / queue /
   inbound 三条流、Run 的 run 流、TL/HD/MC 各自的流；
3. Session 校验同批关系、未知事件、状态贡献版本、定义/配置与环境能力；
4. 裁决者扫描全部 Session，把 accepted 而未 classified 的 arrival 在当前 Run 状态下裁决完
   （[SE-18](../../../spec/capabilities/session/v1/contract.md)）；
5. 投影重建：驱动位置从 run 流 fold，投影缓存版本与水位相符时加速，否则弃用重建；
6. TL/HD/MC 各 owner 核实在途 call / request / attempt 与停止账本（RN-08、CC-06）；
7. 当前身份、TG、AU 与对象资格重新取得；
8. 调度者对每个 Session 判断：占位 Run 执行者为空且有可干的事 → 经 AR 激活并以新 epoch
   重取（核对 [RN-08](../../../spec/capabilities/run/v1/contract.md) 兼容证据）；无占位且队首
   合格 → 开新 Run；
9. 耐久后才继续；历史读面可在第 3 步后带水位开放。

第 4 步在第 8 步之前是硬顺序。崩溃没有 Yield 事实：epoch 未封闭但 Registry 中无持有者
与 epoch 已封闭在派生上同为"该重取"（[LC-08](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)）。
模型与工具可能已发出但结局不明标 unknown，查询原 attempt；没有未发出证明不
重发。已完成结果恢复原引用且不重复文件效果；cancelled/deleted/closed 请求不
复活。AR 目录从空重建，旧 runtime 对象/Context/ExactUse/句柄永不反序列化。

有权历史读面可以在效果核实未完时开放，但必须带已验证水位/availability；坏前缀
不能靠“projection 还能显示”通过。session/persistence 只读获准 namespace/owner 的
envelopes，缺 TL/HD decoder 时不能声称整个域恢复完毕，实际入口按依赖关闭。
完整安全前缀与 schema/业务转移不一致是恢复错误，不是投影丢失可默认修复。
