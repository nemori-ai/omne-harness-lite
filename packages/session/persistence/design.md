# Session persistence 提供者设计

状态：受审 `5ffba4b` 的恢复映射迁移候选，尚待接受。现有
[src/index.ts](src/index.ts) 只提供 `/baseline`；目标 `recoverSession` 尚未实现。
[来源入口](../../../docs/proposals/core-capabilities/implementation/runtime-provider-interfaces.md)
保留历史与验证边界。

采用 [DR v1](../../../spec/capabilities/durable-records/v1/contract.md)、
[SR v1](../../../spec/capabilities/session-run/v1/contract.md)、
[CC v1](../../../spec/compositions/core-work-coordination/v1/contract.md)，恢复语义沿
[Session 接口](../../../docs/proposals/core-capabilities/implementation/session-runtime-interfaces.md)
`cd16f1` 的“控制、退出和恢复”“状态贡献、投影和可观测性”。

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
