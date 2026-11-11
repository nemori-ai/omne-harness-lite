# 执行器形式模型与运行守护

行为依据是 [SPEC](../SPEC.md) 的有界调度、私有缓存和生命周期条款。模型分成线程协议与单worker缓存。安全证明见 [executor.md](proofs/executor.md)。它们不拥有Model的预算、RQ的lineage或身份授权含义。

## 状态与动作

| 模型事实 | 源码拥有者与兑现点 | 对应守护 |
| --- | --- | --- |
| host、lease状态 | [executor.ts](../src/executor.ts) 的 `phase`、`Lease.phase`、`close`、`releaseLease` | 准入在同步入口检查；重复release/close认回已建Promise |
| physical与answer分离 | `SlotPhase.counting`、`stopping.previous`、`Job.answered`，`answer`、`cancelRunning` | `answer`只结算结果；只在counted或实际exit后释放物理占用 |
| queue、Weight与Bounded | `count`、`hasCapacity`、`retainedInputBytes`、`removeQueued`、`dispatch` | 数量、每lease数量、保留字节分别比较；立即dispatch的同步路径在模型中合并为Submit |
| used、gen与身份耗尽 | `acquire`、`count`、`start`、`replace` | sequence到MAX_SAFE_INTEGER拒绝新lease/job，generation耗尽拒绝替换；不循环复用身份 |
| Counted、OldReady、GenerationFence | `start`的回调闭包、`receive`、`receivedCount` | 回调代际与消息代际均核对；模型负控覆盖旧Ready。当前代际job/lease匹配由源码和行为测试承接，不由本模型穷尽 |
| ClearStart、ClearAck、ReleaseComplete | `dispatch`的releasing分支、`receivedClear`、`finishRelease` | 清缓存ACK须匹配当前代际和lease；未收ACK只能等实际exit |
| Stop、Exit、CloseDone | `stop`、`exited`、`settleExitedWork`、`close`；[worker-port.ts](../src/worker-port.ts) | terminate调用不算退出；实际exit清空槽、统计与释放；close后不替换 |
| 超时事件 | `expire`、`cancelRunning`，[worker-protocol.ts](../src/worker-protocol.ts) 的limits校验 | jobTimeoutMs和显式cancellationGraceMs分别控制截止与取消宽限；模型不使用具体毫秒值 |
| lease私有cache与PrivateHit | [piece-cache.ts](../src/piece-cache.ts) 的 `leases.get(lease)`、`cache.entries.get(piece)` | 命中只搜索当前lease；不根据tenant或principal决定共享 |
| EvictLocal、EvictGlobal、Commit | `canStore`、`evict`、`remove`、`count` | 先满足两级容量再插入；模型放宽LRU选择为任意真实成员删除，保持更大的安全交错集合 |
| Clear只删本lease、Exit删整线程 | `PieceCache.clear`，worker进程退出 | 清理不恢复整张旧表，不删除其他仍合法lease的贡献 |

模型放宽了运行期故障时点和排队顺序。`Exit`可在任意活跃阶段出现。它没有隐去终止失败后的物理占用，未实际Exit时允许一直stopping。单槽的初始化不覆盖多worker初始化屏障，后者由真实组合测试承担。

## 可复跑入口

在仓库根设置 `TLA2TOOLS_JAR` 为已安装的tla2tools JAR，再运行下列命令。输出目录必须尚不存在，避免覆盖先前证据。

```sh
python3 packages/model/tokenizer-tiktoken/verification/run_tlc.py packages/model/tokenizer-tiktoken/verification/models/executor tmp/tokenizer-formal-executor
python3 packages/model/tokenizer-tiktoken/verification/run_tlc.py packages/model/tokenizer-tiktoken/verification/models/cache tmp/tokenizer-formal-cache
python3 -m unittest discover -s packages/model/tokenizer-tiktoken/verification -p test_run_tlc.py
```

每配置固定一个TLC worker、768 MiB Java堆、120秒超时。runner逐项记录模型和cfg SHA-256、JAR和runner SHA-256、Java版本、完整命令、退出码和原始日志。正控要求退出0及明确完成结论。负控要求退出12及精确匹配的不变量违例。超时、解析失败、未执行或普通非零退出均失败。这个入口不会自动运行仓库总检查，交付者必须显式执行。

## 有限配置与负控

| 配置 | 检查范围或预期反例 |
| --- | --- |
| executor/positive | 2 lease、3 job、2代际，队列数量1、字节2、每lease排队1；含释放和关闭 |
| executor/zero-queue | 2 lease、2 job、1代际，所有排队界为0，立即执行仍允许 |
| executor/bad-cancel-return | cancel答复后错误将槽设idle，命中PhysicalCapacity |
| executor/bad-late-success | counted覆盖已经失败的答复，命中NoLateSuccess |
| executor/bad-stale-generation | 接受旧代际Ready，把未完成初始化的新槽置idle，命中GenerationFence |
| cache/positive | 2 lease、2 piece，piece权重2/3，全局2条/4字节，单lease1条/3字节 |
| cache/zero-cache | 条数与字节限额为0 |
| cache/bad-cross-lease-hit | 用另一个lease的条目命中，命中PrivateHit |

cfg及expected verdict的唯一清单分别在 [executor/expect.txt](models/executor/expect.txt) 和 [cache/expect.txt](models/cache/expect.txt)。表中的“字节”是抽象计费单位，不是生产文本规模。模型负控不修改生产源码，不能冒称源码变异通过。

## 符合性与组合责任

[executor-lifecycle.spec.ts](../tests/executor-lifecycle.spec.ts) 用可控worker核对物理取消、清缓存ACK、旧代际、错任务身份、实际exit、替换耗尽与关闭。[executor.spec.ts](../tests/executor.spec.ts) 使用真实worker核对公开行为。差分计数由 [differential.spec.ts](../tests/differential.spec.ts) 承担。单次执行结果及所核源码修订留任务tmp。

应用拥有worker数与限额配置、父资源owner及完整关闭；family只借executor和取得lease。Model拥有preparation的facts和release协议。RQ拥有一次规划中的有限租约复用。模型没有把这些参与者合并成tokenizer领域，也不由worker识别principal、Session或Agent。多个槽的资源界组合证明在proofs中；实际装配符合性仍由宿主验证。

没有机器检查的TypeScript精化证明。TLC有限通过、人工归纳、真实worker行为测试与完整应用接受分别记录。任何依赖不再符合其前提时，相应模型结论不能直接用于新的实现。
