# tool 独立验收

本目录保存独立编写的持续场景，对应[正式登记](../../../../.meta_harness/design/product/tool-execution/acceptance.md)中的 S1–S3。它们只验证已登记的有限技术保证，不接受整个 draft 产品主题。

从仓库根运行：

```sh
pnpm --workspace-concurrency=1 --filter @omne-harness/tool... -r run build
pnpm --filter @omne-harness/tool run acceptance --maxWorkers=1
```

验收配置不设置源码别名。场景导入构建后的公开包入口及公开 testing 入口，不导入 examples 或已有测试夹具。单场景超时为 10 秒。驱动最多等待 100 次宿主轮转，分页最多读取 32 页。两种等待都检查实际条件，不使用固定 sleep。

| 场景                                                    | 触发与观察                                                                                                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [S1](PD-tool-execution.success.acceptance.ts)           | 函数工具真实执行一次，经真实 facts/custody/settlement 收场，公开分页得到两段完整正文。消费者处理并保存匹配完成记录后解除 delivery，内容仍可读。                                      |
| [S2](PD-tool-execution.arguments-failure.acceptance.ts) | 结构合法且 complete=true 的重复键参数形成 accepted 的 arguments 逻辑终局。环境准备、binding start 和原 executor 均为零。消费者读取失败原因并处理后解除 delivery。                    |
| [S3](PD-tool-execution.excluded-start.acceptance.ts)    | 已受理调用先经公开 authority.exclude 可靠排除，再推进真实 driver。结果 unavailable，effect/execution 为 not-started，名额释放，交付仍 pending。消费者读取原因并处理后解除 delivery。 |

每条场景输出 JSON 记录，其中 `result` 为 `PASS` 或 `FAIL`。断言失败使 Vitest 以非零退出码结束。设置 `OMNE_QA_EVIDENCE_DIR` 可额外保存各场景的结构化观察和消费完成记录。该目录必须是派发者允许写入的证据目录。消费者先完成字符计数与正文摘要，保存调用引用、固定版本、delivery、consumer 和正文，再提交 `processed` 依据。

装配使用真实 runtime、driver、ledger 和独立执行入口。替身及固定业务输入见[验收夹具](fixtures/README.md)。本组只证明单进程、非耐久提供者边界。生产授权、真实模型、Agent/Session、持久化和跨进程恢复未覆盖。非终端面，终端几关不适用。

最终候选仍须由另一实例独立验收。场景作者自跑不等于整项交付的 QA 或接受。契约范围见 [SPEC](../SPEC.md)，导航见 [index](index.md)。
