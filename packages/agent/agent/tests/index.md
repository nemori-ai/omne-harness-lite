# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身、测试的组织
- [public-entry.spec.ts](public-entry.spec.ts)：入口导出名、导入图、清单依赖与 Cordis 路径
- [assembly.spec.ts](assembly.spec.ts)：测试装配的 17 项依赖，以及它交给工厂得到 idle 的 provider（C1）
- [factory.spec.ts](factory.spec.ts)：工厂的四种创建失败与成功的 idle（C1）
- [provider-access.spec.ts](provider-access.spec.ts)：四个面每个公开操作的租户核对与 `access.check`（C2）
- [loop-transitions.spec.ts](loop-transitions.spec.ts)：转移表逐行对节点表（C1）
- [loop-evaluator.spec.ts](loop-evaluator.spec.ts)：评估器的决定、种子属性测试与导入图纯性（C1）
- [loop-invoke.spec.ts](loop-invoke.spec.ts)：一条输入到 ended 的正常路径与骨架的临时简化（C2）
- [loop-terminal.spec.ts](loop-terminal.spec.ts)：完成竞争、原终结查询、非空观察台账、O0 原责任认回与 idle 复用
- [loop-reply-close.spec.ts](loop-reply-close.spec.ts)：I3 同 revision 准入、I4 空批、I8 三种去向与 ordinary limit/partial 边界
- [loop-main-call.spec.ts](loop-main-call.spec.ts)：主调用的一次提交、原身份认回、结果责任、最终失败、部分结果、窄接续与推理回放限制
- [loop-intake-prepare.spec.ts](loop-intake-prepare.spec.ts)：I0 完整输入批、新 step 与 I1 顺序准备、W0、真实不能装下和阶段压缩限制
- [loop-admission.spec.ts](loop-admission.spec.ts)：受理幂等、输入冲突、busy、commit-unknown 与 R0 重试路由
- [loop-wait-reconcile.spec.ts](loop-wait-reconcile.spec.ts)：W0 失通知、观察窗口、检查时刻、原操作对账、窄接续的未知保护、依赖重查与严格 Node 清理失败
- [loop-wait.spec.ts](loop-wait.spec.ts)：W0 对 query 的 rejected 视为已定、unknown 保持等待
- [loop-recovery.spec.ts](loop-recovery.spec.ts)：E1/E2 只读认回与挂接撤销、E4 恢复路由、R0 原提交切点的 committed/excluded 接续与 W0 保存等待
- [loop-coordinator.spec.ts](loop-coordinator.spec.ts)：E1 found-existing 正常结束协调
- [canonical.spec.ts](canonical.spec.ts)：输入等价性、元素边界与字节视图
- [loop-port-failures.spec.ts](loop-port-failures.spec.ts)：路径上每个节点的端口失败停在该节点
- [loop-slot.spec.ts](loop-slot.spec.ts)：单执行槽的释放、停止后的占用、observe 与登记投影
- [loop-support.ts](loop-support.ts)：Loop 测试共用的 `LoopFacts` 构造与装配
- [factory-support.ts](factory-support.ts)：工厂测试共用的选项、调用记录与登记句柄替身
- [fixtures.spec.ts](fixtures.spec.ts)：每个替身的编排接口
- [memory-journal.spec.ts](memory-journal.spec.ts)：内存 Journal 的同形清单各条、绑定的 coordination 模式与 `tryFinish` 的五类 blocked 次序
- [journal-core-conformance.spec.ts](journal-core-conformance.spec.ts)：内存 Journal 运行 agent-contract `./testing` 的 Journal 核心一致性套件（Q1、Q1b、Q3、Q11、Q13、R2、P、Ja、Rh，以及终结的候选投影、清单、blocked 次序、取消路线与六个结算变体）；三个只破坏一条规则的装饰器各使套件至少一例变红
- [journal-support.ts](journal-support.ts)：测试共用的契约值与步骤
- [module-graph.ts](module-graph.ts)：导入图遍历
- [fixtures/](fixtures/index.md)：测试固定输入
- [journal-received.spec.ts](journal-received.spec.ts)：同源提供者执行 required 接收共同提交套件
- [model-receiver.spec.ts](model-receiver.spec.ts)：资格、原交付校验、未知、容量、账目和重装配
