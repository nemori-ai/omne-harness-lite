---
name: dispatch
description: >
  Reduce 建当前波任务、核对准入、登记 binding 并生成首次 Line 消息。首次派发、下一波物化或派发恢复时加载；收件与集成用 integrate。
---

# 派发

首次和恢复先读 `docs/engineering/integration.md`「集成节点的清单」及 `docs/engineering/map-reduce-states.md`。Reduce 的 PREPARE/DISPATCH/RELEASE_WAVE 按下表执行，请求状态、其他阶段和八类监督继续按 integrate。人只与唯一 reduce 会话讨论设计；Line 开工后没有波中问答通道。

| 阶段 | 输入与动作 | 出口/等待 | 失败/恢复 |
| --- | --- | --- | --- |
| PREPARE，R01/R02 | 已接受依据、里程碑目标、F、权限、当前波 roster、两宿主策略；核对写集/依赖并准备自包含输入 | 准入和输入齐备才到 DISPATCH；只正式建当前波，后一波仅预案 | 缺口先过三问，冻结依赖项，不把未定设计派给 Line |
| DISPATCH，R03 | 读回 binding、首次模板与目标机器绑定，render/validate 临时文件后打开 | 分别记录五种派发事实并持续监督，机器 claim 读回才算认领 | queued 不算打开；生成/认领结果未知先原操作恢复，重复消息复用唯一执行 |
| RELEASE_WAVE，R09–R13 | 本波整体成果通过后调整预案；非终态建后继任务与真实 R，有权终态不建虚构卡；发布所有存续线 delta | 非终态后继与全线 delta，或有权终态与全线 terminal delta 读回后，才可接受本波，再 release/close | 非终态缺后继、缺任一存续线 delta 或授权均拒绝放行；建卡未知先对账，不重复创建 |

## 1. 整理需求，定位已有卡

从有效卡、已接受正文和精确 F 读事实，不从主检出猜当前版本。人已授权且可查清的事项自行决定。Reduce 提问前完成里程碑必要性、方案复杂度、自主可决策性三问；剩余真实冲突或权限决定才交人。

## 2. 建卡

按 `docs/engineering/delivery.md` 与 `agent-delivery.md` 登记创建操作标识，按实际 Issue 模板写本次范围、负责人、revision、条件和验收。`kind:` 唯一且与正文主工作类型一致；`line:`、`nature:`、`contract:` 按正式标签工具同步。Project 是投影，失败单列，不伪造成功。创建未知先用原操作身份读回。

## 3. 波准入

分解当前波前，按 `docs/engineering/integration.md`「波段编排的判断原则」权衡关键路径、容量、反馈时延与风险。

按 integration 的不变量核对：开工依据已接受且合入提交在 F；跨线写集不交；契约成员只有一个写者；破坏性变更及真实消费者在具名责任内。使用 `tools/dev-flow/src/delivery/scope-cli.ts` 对本波绑定求交，同线顺序任务先按线聚合。任一失败不开波，改分解或缺口，不降低判据。

只正式排当前波及 R(w)，预规划后一波但不预建卡。当前波成果验证后才调整并物化下一波任务和 R(w+1)，它们仍依赖 R(w) 有效放行。先读回全部后继卡与所有存续线 delta，再接受 R(w)，最后发布 ReleaseRecord、关闭并读回。单卡接受和关闭事件不能替代整波放行。

## 4. 准备本波的 Wave

Wave 和 Project 字段沿 `delivery.md` 及工具帮助。已有 Wave 不覆写。没有正式当前 R 或约定期限时不能把远期预案当可订阅对象。Line idle 也必须有当前真实等待，不制造空任务或空 PR。

## 5. 发派发评论，写回 binding

按已采用工具的 `tools/dev-flow/src/delivery/README.md` 准备 `spec.json` 与人读 `prose.md`。分支、taskBase、route、写范围和权限由 binding 单源持有，prose 仅引用。

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/dispatch-cli.ts post --spec <spec.json> --text <prose.md> --dry-run
node --experimental-strip-types tools/dev-flow/src/delivery/dispatch-cli.ts post --spec <spec.json> --text <prose.md> --out <binding.json>
node --experimental-strip-types tools/dev-flow/src/delivery/dispatch-cli.ts bind --binding <binding.json> --worktree <工作树>
```

每次写入读回精确 revision/attempt；未知结果恢复原操作，不用 force 逃避冲突。该入口登记 binding，不等于首次消息 render/validate、打开或转发。

## 6. 建分支与工作树，运行 start

按固定工具的 integration/worktree 帮助从 binding 的 taskBase 准备隔离树。已有同名分支核对尖端，不能覆盖别的执行。运行 start 后用 status 读回 issue/revision/attempt/branch/taskBase 一致且 relation=current，不手写 context。首次重复转发只接续同 owner/attempt，owner 冲突或未知认领进入 RECOVER。

## 7. 看板字段

按工具结果补写已获准的 Project 字段。看板失败保留诊断，由有权限者补投影，不绕过真正 binding/准入。受限环境只需要 REST 协作事实，不能因 Project 不可写声称认领失败或成功。

## 8. 交出派发包

首次使用 `.meta_harness/human/map-reduce-delivery/templates/line-initial-dispatch.md`，从有效 binding、线包、计划、宿主策略和本机配置具体化。实例写到 `tmp/milestone-<id>/dispatch/<line>-r<revision>.md`，字段和权限引用不得另造第二份事实。readiness 包含目标机器可访问的精确版本、当前真实 R、合法 active/idle 入口、完整运行 recipe、无占位和秘密。

先用固定工具列出模板字段，再从有效来源写输入 JSON。输入含 schemaVersion=1、milestone 数字、line 短名、revision 数字和 fields 字符串映射。fields 必须包含全部列出字段，dispatch_revision 与 revision 一致。命令中的 input 是 reduce 已具体化的输入文件，不由转发者补填。

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/line-initial-dispatch-cli.ts fields
node --experimental-strip-types tools/dev-flow/src/delivery/line-initial-dispatch-cli.ts render --input <具体化输入.json> --root <目标检出>
node --experimental-strip-types tools/dev-flow/src/delivery/line-initial-dispatch-cli.ts validate --input <具体化输入.json> --root <目标检出>
```

render 只产生 GENERATED，validate 只产生 STRUCTURE_CHECKED。根据返回的 remainingGuards，实际读回 binding/owner/attempt、目标机上的固定材料、当前入口与收口链，核对工具 recipe、宿主策略及权限，并检查秘密和矛盾副本。保存逐项证据后才记录 VALIDATED。常见密钥扫描不能证明没有未知格式的秘密。同修订相同字节复用；不同字节拒绝，改内容使用新修订。

生成、完整校验、打开、人声明已转发、机器 claim 读回是五种事实。校验完成后，用宿主侧边栏或 IDE 的公开操作打开返回的绝对 path；queued 只算待展示。人原样转发，reduce 不自动发送或创建外部会话，也不让人补设计。新修订须重新校验；已认领后不得用重复消息绕过取消/写权交接。

包必须包含开工与结束两个边界、本域裁量、停止条件、ready/blocked/failed 同一交接入口、处置等待及正常逐 R 等待。后续波使用 delta，保留同一 Line 会话，不再“首次派发”。内部单节点 map brief 与外部常驻线模板分开。

## 恢复与停止

按 G00–G06/RC01–RC09，先保存待完成操作、游标、实际写者和恢复点。权威回执决定当前阶段，不能从已生成文件推断已打开、转发或 claim。明确停止冻结新写入并保存交接；STOPPED 不等于 DONE。新 epoch 先确认旧执行终止。恢复后的等待纳入 integrate 八类监督，先排空积压再挂脚本。
