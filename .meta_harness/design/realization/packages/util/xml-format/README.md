# xml-format

## 当前迁入与技术接受（2026-09-26）

- 源码 `packages/util/xml-format` 已实施；40份两包维护文件与迁入提交 `bf47e1e7` 精确一致。技术依据仍为 D-067 与 [design.md](design.md)，无新增领域契约、Cordis 服务或运行依赖。
- 当前实际回归 **170 项通过、零跳过**；严格公开类型及真实 tarball 消费通过。固定原 Python `6263fed5` 真正执行99输入，并由主调度在新目录独立重放；98相同、1个已接受日期拼写差异，11边界和两指定AssertionError负控另计。
- `XF-1`～`XF-7` 已由主调度按实际证据技术接受；[逐项要求与范围](../../../../record/evidence/2026-09-26-tests-core-final/U1-technical-acceptance.json)、[原件与复现](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。有限输入不证明所有跨语言行为相同；主动 toXml 合法性仍归调用者，不新增 core 业务格式选择。timeout／brand没有因本次需要而迁入；人的总体门仍待。

## 迁入前的依据与验证计划记录

下列“尚未建包／待实施／迁入后尚无”属于此前计划状态，由上面的实际运行与逐项接受取代；设计要求未改。

- kind：provider
- 对象与设计修订：项目自有格式化机制的迁入设计；用户2026-09-26明确选择此包和util位置，主调度负责技术评审与接受。
- 源码位置：`packages/util/xml-format`，尚未建包。
- 契约采用与边界依据：没有独立领域契约或数据交换坐标；用户选定的既有项目实现作为技术来源，[design.md](design.md)列实际采用行为、前提与调整，不凭旧分支spec获得接受。

## 分层状态

- 语义接受范围：包的需要与位置已由用户明确；本节点技术映射经独立评审，由主调度在用户委托内接受（[D-067](../../../../record/decisions/core-formatter-adoption/decision.md)），不表示用户已总体接受。
- 可实施范围：单独import可用的格式化函数和声明类型，不提供Cordis服务、不执行工具、不组上下文。
- 绑定与证据：[bindings.yaml](bindings.yaml)为空；没有可绑定契约条款或formal task。技术要求逐项沿[verification.md](verification.md)验证。
- 实际验证：迁入后尚无；旧分支的结果不升级本HUB的实现状态。

| 问题 | 入口 |
|---|---|
| 来源、公开面、前提与迁入调整 | [实现设计](design.md) |
| 需要实际跑什么、证据与未覆盖 | [验证](verification.md) |
