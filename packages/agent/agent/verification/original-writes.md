# 原 Journal 写的验证映射

本页映射 [SPEC 的原写认回](../SPEC.md#原-journal-写的认回)到当前实现与可运行用例。它不声明 SQL、进程重启或任意并发的验证通过。

## 性质与实现

| 性质                | 保护位置                                                                                                                | 可观察判据                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| OriginalWriteStable | [original-write.ts](../src/loop/original-write.ts) 从 AgentJournal 参数派生完整请求；coordinator 在调用前保存请求与节点 | open 丢回执重试传入同一个原请求，消息准入和采用解析各执行一次            |
| 已提交动作不重复    | coordinator 的 R0 查询原 operation，再采用 load 的 checkpoint；控制入口先认回原 recording operation                     | I0 只有一次 input-taken，M0 只有一次 Model admit，F3 只有一次 ended      |
| 未确认不能释放      | provider 的 reserved 保存 coordinator；未知普通写阻止 W0 替代提交                                                       | 永久 unknown 的 open 保持 reserved；永久 unavailable 的执行保持 occupied |
| excluded 不重新受理 | provider 在 excluded 后保留原预占，不用 load denied 推断缺席                                                              | 同号 invoke 返回 conflict，新号仍为 busy，预占容量为一项                                  |
| 并行控制身份独立    | control.ts 以 Journal 实例、tenant、execution 与 control operation 分开保存请求                                         | 两个并行 control 各自查询自己的原 operation，不覆盖或串用                |
| 原路线恢复          | coordinator 把原写节点与请求一起保存；committed 从权威快照继续                                                          | 正常完成仍为 complete，取消仍为 cancelled，丢回执不生成新的业务故障      |

## 可运行资源

[original-writes.spec.ts](../tests/original-writes.spec.ts)在生产 Agent 端口的真实内存 Journal 提交成功后抛错。它覆盖 open、I0/M0 commit、control、recordControl、commitSettlement 的建立与判断、prepareFinish 和 tryFinish。独立控制入口与 F0 驱动分别验证原 stage 认回。并行场景验证两个控制身份。

[loop-admission.spec.ts](../tests/loop-admission.spec.ts)保留未知 open、失败 query 与并发 invoke 的预占约束，并核对 excluded 与异输入。`original-writes.spec.ts` 的 existing execution + denied load 反例要求保留预占。[loop-recovery.spec.ts](../tests/loop-recovery.spec.ts)保留原 commit-unknown 的恢复路径。[provider-run-failure.spec.ts](../tests/provider-run-failure.spec.ts)保留永久不可用时 occupied 的结果。

在仓库根先构建本成员，再运行定向用例。每条命令经共享测试名额执行。

```sh
scripts/with-test-slot.sh pnpm --dir packages/agent/agent run build
scripts/with-test-slot.sh pnpm --dir packages/agent/agent exec vitest run --mode fast tests/original-writes.spec.ts tests/loop-admission.spec.ts tests/loop-recovery.spec.ts tests/provider-run-failure.spec.ts tests/provider-control.spec.ts tests/journal-tool-control.spec.ts
scripts/with-test-slot.sh pnpm --dir packages/agent/agent run typecheck
```

## 证据边界

有限候选模型中的 OriginalWriteStable 只约束其建模状态与交错。这里的映射不能把有限模型结论扩成所有实现并发的证明。测试使用脚本化 Model 和非耐久内存 Journal。SQL、真正断进程、receiver 的独立未定写、settlement custody 与未实现 Rh 路径不由这些用例证明。

普通不可用、失权、缺失材料或未闭合责任保持原结果。原写保护不增加 node-failed 公共契约，不保证所有失败都能终结。

## 内部恢复资格与端口转发

重复受理只有收到原 open 的 committed 回执，才允许再次调用原 open。协调者核对回执的 execution、operation 和当前未定写的方法。缺失回执保持 commit-unknown，错配回执返回 conflict。受理与执行共享互斥入口，不能在另一个驱动活动时清除待认回写。`original-writes.spec.ts` 验证无回执和错配回执均不重发，原回执可继续恢复。

Journal 包装器显式转发端口方法，保持原接收者。它不要求端口成员为可枚举自有属性。公开取消场景使用不可枚举且检查接收者的 load 方法，验证取消仍可完成。
