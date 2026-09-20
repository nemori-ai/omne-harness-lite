# 本批定向 fork 交付

> 本页记录首次导入的历史交付。后续已按用户要求拆成能力族/职责叶子包，
> 旧包路径和 scope-baseline 属于当时版本；当前布局与验证见[布局交付](package-layout-delivery.md)。

设计先由 [D-008](../../../decisions/D-008-core-capabilities.md) 正式化；本批源码随后
按 [施工计划](plan.md)从固定官方修订导入。源基线供后续二次开发，尚未实现
D-008 的真实授权/HITL、Run、OpenRouter、耐久记录或独立执行提供者。

## 交付对象

- [agent](../../../../packages/core/agent/README.md)：保留原 agent 源基线，补齐 scope
  store 并公开 `scope-baseline`，所有本批模块共用这一份活动 scope 实现。
- [dsh-baseline](../../../../packages/README.md)：按责任切分模型/媒体、
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

源码修订为 `f99c73cb2146f8679324c41921198401732bc7ec`；独立只读
[复核](review.md)的两项发现已处理，作者在用户设计后 fork 的授权内接受本批起点。

| 检查 | 实际结果与范围 |
|---|---|
| 完整 `make check BASELINE=c966da1` | 对 `60e42ef` 通过：348 份 Markdown、16 个 catalog 契约、12 项实际 TLA+ 任务、77 项 Python 工具测试及当时的两包检查；[完整输出](evidence/integration-check.log) |
| 修订后 `pnpm check` | 对 `f99c73c` 通过：agent 50 项、baseline 616 项测试，严格构建/类型，原件与声明检查；[完整输出](evidence/revision-product-check.log) |
| 独立双 tarball 消费 | 仓库外离线安装两份当前产物，12 个公开子路径全部 tsc/runtime 成功；实际验证共同 scope 路由/父链/撤回、LLM/Session/Loop/存储辅助与文件 I/O、prompt/工具贡献/调用/撤回 |
| 官方 archive 逐字节核对 | agent 12 项、baseline 70 项来源记录通过；42 个活动文件均有映射或本地装配说明；[输入、输出与目标哈希](evidence/source-check.json) |

完整检查后只修改 native 调用、对应测试/来源清单及说明文档；修订后的产品检查
和文档检查覆盖这些变化。规格、形式模型、Python 工具及其输入/依赖未改变，
其完整检查证据继续适用。[验证记录](evidence/checks.json)绑定版本、工具、命令和日志。
此前的 [公共机制试验](pilot.json)只覆盖当时的 scope/helper 组合，不冒充整批结果。

JSONL 已实测正常文件操作、部分追加后的截回、截回失败保留双错误与部分内容；
未注入 fsync 故障、close 复合失败或真实进程崩溃。范围只到源文件原语，不能据此
宣称已兑现目标写入权、耐久事务、损坏恢复或独立执行。

产品实现仍须逐项满足 [正式组合场景](../../../../spec/compositions/core-work-coordination/v1/scenarios.md)。
源内存调用成功不等于外部效果已停止、耐久提交或人类批准；有限来源测试不取代真实
后端与产品符合性验证。本批未进行模型付费调用、npm 发布、远端推送或 main 合并。
