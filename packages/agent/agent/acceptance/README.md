# acceptance

本目录由独立 QA 维护，核对 [PD-agent-progression 的 S1 与 S2](../../../../.meta_harness/design/product/agent-progression/acceptance.md)。场景覆盖 J-AG02 阶段 1 的输入、完整普通回复准入、无工具空动作批与完成，以及执行子进程死亡后的原责任接续。

## 允许的内容

[PD-agent-progression.stage1.acceptance.ts](PD-agent-progression.stage1.acceptance.ts)含公开 invoke 旅程和真实 SIGKILL 场景。[fixtures](fixtures/README.md)只提供进程驱动和现有依赖端口的传输。

## 边界

验收断言归 QA，产品实施者只运行。公开旅程使用构建后的工厂、真实协调者和评估器。子进程运行内部协调者与构建后的评估器，不替换这些被测边界。外部条件使用脚本 Model、内存 Journal、内存材料及现有测试装配。共用的 `tests/*-support.ts` 只提供输入与装配，不提供验收断言或通过记录。

父进程持有同一个 Journal、Model、材料、原 binding、Access 与实际受理的 Authority。子进程只持执行帧。驱动等待旧 PID 的 SIGKILL 退出回执后才启动新进程。`I2`、`M6`、`M1` 与已提交 `M4` 切点使用现有 `continueExecution(original Authority)`。终态 `F4` 切点使用原输入与操作的幂等 `accept()`，再 `runExecution()`。

旧进程死亡后，驱动释放切点并等待旧 IPC 请求收尾。before gate 后尚未调用端口的请求被取消，M1 与 F4 的读取也不再执行。after gate 前已经发生的操作保留。新进程启动前，Journal 快照必须与杀进程前相同。I2 仍无效果意图，新进程必须实际提交与原候选相同的 M0 意图。

F4 场景先由真实协调者形成 FinishIntent。合法宿主沿原 Access 与 Authority 固定两个 after-terminal passage，再通过真实 Journal.tryFinish 建立非空台账。宿主保存一项真实观察登记并查询丢失的回执。进程死亡后，原登记被认回，另一项保持 pending，最后由同一长期宿主登记。场景不执行扩展求值，也不虚构 observed。

这些场景只证明执行进程退出后的受控接续。Journal 宿主存活是前提。生产耐久、公开 resume、attach、detach、control、quiesce、submit、工具、扩展、真实 Context、HITL、授权与外部协调者适配均未验证。Agent stream 也未交付。非终端面，终端验收不适用。

## 维护

从仓库根先构建，再执行验收：

```sh
pnpm turbo run build --filter=@omne-harness/agent
pnpm --filter @omne-harness/agent acceptance
```

可选 `OMNE_QA_EVIDENCE_DIR` 指定机器证据目录。JSON 包含 PID、信号、退出回执、原快照、恢复后快照与 IPC 调用记录。Vitest 输出判据及通过或失败，退出码对应结果。条件等待由端口切点、进程消息和退出事件触发。每条场景超时 15 秒，不使用固定休眠。

场景或输入变化后重新运行受影响验收。节点表的阶段 1 用例另由成员测试核对，不把场景数量当作节点覆盖率。

## 本包事实

S1 包含一条公开旅程和四个进程切点，S2 包含一个终态后切点。没有新增产品恢复入口、调度器、存储提供者或第三方依赖。单次运行结论与证据归任务 tmp，验收通过不授予交付接受。
