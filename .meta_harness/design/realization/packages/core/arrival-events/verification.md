# arrival-events 验证与证据

契约侧的证据义务权威在 [`spec/data/arrival-events/verification.md`](../../../../spec/data/arrival-events/verification.md#证据义务)（V-1～V-9、SC-1～SC-4）。
本页只登记**落在本节点上的那一部分**。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | `examples.md` 第 1～9 节逐行过包内校验；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| V-2 拒绝值的具名与次序 | 每个拒绝行逐字相同；第 11 节专验次序；嵌着的块与账取那两份契约的名字 | 未开始 | 本节点 |
| V-3 本契约自己的 Schema 管不到的拒绝值 | `presentation_invalid`、`head_modality_mismatch`、`frame_media_inline`（任意一层、语音填字节）等；要借开块的两项在块开着与没开时各一例 | 未开始 | 本节点 |
| V-5 封口块等于归约（生产者义务） | 生产者一侧的性质测试以 `reduceFills` 为参照 | 未开始 | 生产者节点（传输适配、发帧入口）跑；本节点提供参照实现，另有 `reduceFills` 自身的单元测试（语音按字节相接） |

**不在本节点**：V-4（序列规则，归 stream-assembly）、V-6～V-8（要真实生产者与消费一侧）、V-9（跨进程，本版装配下无法演练）；SC-1～SC-4（生产者与节流方）。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **严格 base64 的判法未取证**（AEV-1）：`payload_kind_mismatch` 的语音那一支，实现须先证明拒得掉非标准字母表与错误填充。owner：本节点落包时。
