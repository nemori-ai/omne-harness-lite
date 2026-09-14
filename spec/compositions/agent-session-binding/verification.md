# v1 验证与发布记录

对象：[composition.agent-session-binding v1](v1/contract.md)。
[发布清单](evidence/v1/publication.json)记录四份规范来自受审 commit
`adafb2dc1bb8db19e2aac40567feb607aa97bdbe`，迁移后字节相同；既有八份冻结文件
未变。[独立评审](../../../docs/proposals/runtime-composition/review.md)与
[作者接受](../../../docs/proposals/runtime-composition/README.md#接受记录)分别记录。

## 形式模型

性质、条款/场景映射和有限边界归[验证映射](../../../docs/proposals/runtime-composition/verification.md)。
正常模型探索 10,748 个不同状态，无错误；八个故障配置均退出 12 并命中预期
不变量，包含当前权限、Session 资格及旧修订、必要依赖、租户、提前释放、旧
清理和未确认移交。完整日志、工具 JAR 哈希及执行参数见[结果清单](../../../docs/proposals/runtime-composition/evidence/model/results.json)。

原日志中的 `docs/proposals/runtime-composition/candidate/` 是受检时的路径；
按发布清单映射到当前 `v1/`，模型字节未变。正常配置已登记为
`agent-session-binding-v1-safety`，由 `make spec-check` 实际执行。
故障配置仍在原证据目录；可从仓库根重放，例如：

```sh
"$JAVA_BIN" -XX:+UseParallelGC -cp "$TLA2TOOLS_JAR" tlc2.TLC \
  -noGenerateSpecTE -workers 1 -metadir tmp/formal-runs/binding-revision \
  -config docs/proposals/runtime-composition/evidence/model/revision.cfg \
  spec/compositions/agent-session-binding/v1/Binding.tla
```

此故障必须报告 `PublicationSafe` 并退出 12，不能把语法失败或超时算预期反例。
模型抽象的是提供者须兑现的原子边界，未证明真实 Cordis/后端已经共同提交，
也不包含网络租约、持久事务、完整 IAM、所有工具/HITL 移交或无条件活性。

## 当前提供者映射的适用范围

`f98ac926` 的 [SR/CB 对应](../../../packages/session/session/design.md#13-装载效应撤除责任与依赖政策)
区分 Publish/StartWork 的共同检查、Invalidate/Restore 的旧修订边界，以及只
允许单向失联的 LoseDependency；重挂/单调关闭仍由真实提供者兑现。
[应用命题与场景](../../../apps/local-harness/design.md#运行映射的命题与前提)及
[独立判断原件](../../../apps/local-harness/evidence/runtime-mapping-applicability/README.md)
记录本次确定性 allow 基线的对应与输入身份。它们不外置新规范，也不是模型
新增运行或产品结果；AR 的计划退役模型不能补成完整 Cordis 失联—重挂证明。
实际共同门、原登记/资源保有与逐项释放的符合性仍未验证，接入要求保持。

## 交付检查

最终路径下的文档/冻结基线和五项形式任务检查结果见[交付记录](evidence/v1/delivery.json)。
未修改产品源码、工具实现或依赖，不重复执行未受影响的产品与 Python 工具测试。
本次模型/文档通过不能代替规范场景中明确要求的真实提供者符合性测试。
