# Run 转移的 owner-prepared 组合

## 需要作出的选择

Session force-stop、Yield、interrupt、cancel、terminal、reacquire 与 resume 需要与 Session/AR/Inbound facts
同批，却不能让多个消费者各自制造 `run.epoch.closed`。要同时保护“一 epoch 至多一 close”和跨 owner 原子性。

## 现有能力如何承载

| 要求/条款 | 现有能力 | 组合与 owner | 当前缺口 |
|---|---|---|---|
| Run 状态、epoch、终止意图 | RN-01/03/05/08 | Run 唯一解释合法转移 | round-3 provider 仍让 Session/Tools 直接写 close |
| 跨 owner 同批 | CC-01、LC-03/04 | 各 owner prepare/check，协调者合并 | 未固定 effect-free prepare 与 submit-time owner guard |
| WorkPermit/恢复 | AR、RD-14 | AR 准备许可，Run 准备 issue/close | latestIssued/openEpoch/executor 被混成一个 epoch 字段 |

## 剩余责任与能力演化

无需新增能力。扩展 Run 提交面为统一、无副作用 `prepareTransition`：Run owner 根据 aggregate revision、
latestIssuedEpoch、openEpoch、operationId 生成 opaque guard 与 Run facts。协调者不能解读或修改 facts，只把它与
其他 owner preparation 合并；CC submit 时每个 owner 重新检查 guard，整批 commit 或 reject。

Run fold 分开 latestIssuedEpoch、nullable openEpoch 和 runtime executor。open epoch 才能由 Run owner准备唯一
close；已 closed 只返回原 epochClosureRef。force-stop terminationIntent 硬拒 successor；resume/reacquire 成功均
发行 successor，old open epoch 用既有 reacquired 原因先唯一关闭。

## 契约、动作链与 Cordis 投影

`RunPlugin` 提供 `omneRun.prepareTransition/readRun/lookupOperation`；Session/Tools/Driver 只持该受限服务。
`LifecycleCompositionsPlugin` 只合并 RecordPreparation 并调用 CC，不注册第二个 Run writer。卸载先封新 prepare、
排空在途 submit，再撤服务；已提交 facts 与 operation lookup 保留。

## 证据义务与受阻消费

| 前提 | 保护者 | 证据 | 闭合条件 |
|---|---|---|---|
| 每 epoch 至多一 close | Run owner guard/fold | Yield→Session force-stop、terminal↔control、TS-20 mutation | exact formal model/TLC 与 provider fault injection |
| composite 原子性 | CC + 各 owner guard | 一个 guard stale 时整批拒绝 | CC/provider integration evidence |
| strict force-stop | Run terminationIntent/RN-05 | force-stop↔reacquire/resume race | successor mutation 必须失败 |
| 回执丢失 | Run operation ledger | committed lookup，不把 preparation 当结果 | crash/retry test |

## 交接缺口

当前没有实现或 formal pass。该候选仍需 architecture/spec reviewer。revision 协调已固定：一次 owner
append/operation 推进 stream/aggregate revision 一次，同 append 多 facts 共享 revision，最终 envelope
`(batchSeq,index)` 与 append-local order 给逐 fact 次序；不得把 fact count 当 CAS revision。
