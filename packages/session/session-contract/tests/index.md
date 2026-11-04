# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：两个入口的导出集合
- [decide-reduce.spec.ts](decide-reduce.spec.ts)：首条路径的判定与归约
- [run-advance-invariants.spec.ts](run-advance-invariants.spec.ts)：Run 与 attempt 层不变量的种子随机守卫，对照 RunAdvance 模型
- [transactions-conformance.spec.ts](transactions-conformance.spec.ts)：事务端口套件的自证与违例变体
- [delegated-conformance.spec.ts](delegated-conformance.spec.ts)：委派视图套件的自证与违例变体
- [dependency-direction.spec.ts](dependency-direction.spec.ts)：构建产物的依赖方向
- [log-conformance.spec.ts](log-conformance.spec.ts)：事件通道提交套件 `sessionLogConformance` 在内存替身上的自证与违例变体
- [adoption-verdict.spec.ts](adoption-verdict.spec.ts)：`startRun` 与 `reload` 的采用材料带 `verdict` 时判定为 `frozen` 且不生成条目
- [log-types.spec-d.ts](log-types.spec-d.ts)：可加契约的类型负控：提交输入的必填项不能省略，`create` 不带的槽不存在，旧实现仍满足已扩展的接口
- [conformance-harness.ts](conformance-harness.ts)：套件自证的运行器
- [module-graph.ts](module-graph.ts)：构建产物的导入图遍历
- [fixtures/](fixtures/index.md)：测试固定输入，现在为空

- [extended-behavior.spec.ts](extended-behavior.spec.ts)：冻结、执行历史、结果与作用域
- [context-scopes.spec.ts](context-scopes.spec.ts)：`contextScopesOf` 只从 SE27、SE28 得出与归约快照相同的作用域，与条目顺序无关；他会话的绑定、他种条目与解不开的载荷整体失败；`contextScopeOf` 与归约铸造同一引用
- [management-behavior.spec.ts](management-behavior.spec.ts)：管理命令、生产者事实与压缩
- [providers-conformance.spec.ts](providers-conformance.spec.ts)：提供者套件自证
- [scene.ts](scene.ts)：测试中的会话操作辅助

- [result-integrity.spec.ts](result-integrity.spec.ts)：原执行与位置、结果依据不变、迟到保管、后继隔离及归档提醒。

- [initialization-plan.spec.ts](initialization-plan.spec.ts)：原计划与注册身份编码
- [initialization-behavior.spec.ts](initialization-behavior.spec.ts)：来源义务、原子事实与重试
- [initialization-integrity.spec.ts](initialization-integrity.spec.ts)：来源绑定、篡改与解释隔离
- [protocol-release.spec.ts](protocol-release.spec.ts)：完整发布集合与摘要
- [initialization-scenario.ts](initialization-scenario.ts)、[initialization-fixture.ts](initialization-fixture.ts)：显式测试前提

- [frontier-behavior.spec.ts](frontier-behavior.spec.ts)：同根原事实、登记、控制及历史承接
- [frontier-release.spec.ts](frontier-release.spec.ts)：各冻结终态的完整解除与无额外准备门槛
- [work-entry-behavior.spec.ts](work-entry-behavior.spec.ts)：原控制引用与压缩下界

- [same-log-integrity.spec.ts](same-log-integrity.spec.ts)：原 Run 与 attempt、完整解释批次、空事件对账及迟到认回。
- [history-source-isolation.spec.ts](history-source-isolation.spec.ts)：显式租户与 Session 作用域、同文本身份及独立材料根。

- [access-check.spec.ts](access-check.spec.ts)：关联请求类型、显式逐次裁定、来源异常与脚本耗尽。
- [transactions-access.spec.ts](transactions-access.spec.ts)：事务工厂必需 `accessCheck`、commit 显式 access、每次公开读写各问一次、`readInput` 与 `queryOperation` 的 denied/unavailable 不披露答案、denied/unavailable/抛错无副作用、跨租户拒绝与裁定证据进同次提交。
- [cancelled-projection.spec.ts](cancelled-projection.spec.ts)：当前及历史 Run 取消依据、拒绝后的无部分投影与迟到认回。
- [deferred-facts.spec.ts](deferred-facts.spec.ts)：延后事实带后果、非延后事实带控制证据，两种观测都判 invalid。
- [control-normalization.spec.ts](control-normalization.spec.ts)：取消事件的控制归一：只在原执行上覆盖责任，advance 释放后才算资格撤销。
