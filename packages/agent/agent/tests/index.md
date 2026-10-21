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
- [loop-admission.spec.ts](loop-admission.spec.ts)：受理幂等、输入冲突、busy、commit-unknown 与 R0 重试路由
- [loop-coordinator.spec.ts](loop-coordinator.spec.ts)：E1 found-existing 正常结束协调
- [canonical.spec.ts](canonical.spec.ts)：输入等价性、元素边界与字节视图
- [loop-port-failures.spec.ts](loop-port-failures.spec.ts)：路径上每个节点的端口失败停在该节点
- [loop-slot.spec.ts](loop-slot.spec.ts)：单执行槽的释放、停止后的占用、observe 与登记投影
- [loop-support.ts](loop-support.ts)：Loop 测试共用的 `LoopFacts` 构造与装配
- [factory-support.ts](factory-support.ts)：工厂测试共用的选项、调用记录与登记句柄替身
- [fixtures.spec.ts](fixtures.spec.ts)：每个替身的编排接口
- [memory-journal.spec.ts](memory-journal.spec.ts)：内存 Journal 的同形清单第 1 至 15 条与三项临时做法
- [journal-support.ts](journal-support.ts)：测试共用的契约值与步骤
- [module-graph.ts](module-graph.ts)：导入图遍历
- [fixtures/](fixtures/index.md)：测试固定输入
