# 本批定向 fork 交付

设计先由 [D-008](../../../decisions/D-008-core-capabilities.md) 正式化；本批源码随后
按 [施工计划](plan.md)从固定官方修订导入。源基线供后续二次开发，尚未实现
D-008 的真实授权/HITL、Run、OpenRouter、耐久记录或独立执行提供者。

## 交付对象

- [agent](../../../../packages/agent/README.md)：保留原 agent 源基线，补齐 scope
  store 并公开 `scope-baseline`，所有本批模块共用这一份活动 scope 实现。
- [dsh-baseline](../../../../packages/dsh-baseline/README.md)：按责任切分模型/媒体、
  Session/投影/持久化、JSONL 文件原语、prompt/工具及 Loop 源算法，全部公开入口
  为 `baseline/*`，没有默认产品入口。
- [源行为与差异](source-baseline.md)：语言无关的状态、所有权、生命周期、失败边界，
  以及每组来源测试和未导入部分。完整上游入口需要保留时只作为不编译的原件。

原件、许可、修改映射与所消费的精确 commit 随本地源码保存；tarball 只携带
dist、许可、来源清单及包说明。固定上游为
`deepseek-ai/deepseek-harness@c291e7961a515f6d7af9304e7fd1d257929aef26`。
复核脚本 [check-sources.py](evidence/check-sources.py)重新读取官方 archive 并核对
每份选取原件，不靠当前上游分支或研究快照目录名称推断版本。

## 验证与接受

最终整合检查和独立复核完成后，在本节登记对应源码版本、命令、结果和覆盖范围。
此前的 [公共机制试验](pilot.json)只覆盖当时的 scope/helper 组合，不冒充整批结果。

产品实现仍须逐项满足 [正式组合场景](../../../../spec/compositions/core-work-coordination/v1/scenarios.md)。
源内存调用成功不等于外部效果已停止、耐久提交或人类批准；有限来源测试不取代真实
后端与产品符合性验证。本批未进行模型付费调用、npm 发布、远端推送或 main 合并。
