# 外部命令式 hooks 兼容的验证范围

对象：[capability.external-hooks v1](v1/contract.md) 与其[规范场景](v1/scenarios.md)。

**本能力没有自己的形式模型。** `spec/capabilities/external-hooks/v1/` 只有 `contract.md` 与
`scenarios.md` 两个规范文件，[formal-tasks.json](../../formal-tasks.json) 中没有本能力的任务，
本轮也没有为它运行 TLC。来源[提案](../../../docs/proposals/hooks-compat/README.md)没有证据
目录，因此本页没有可引用的模型运行数字；下文区分"已由其它模型间接覆盖""只有规范场景""
仍是实现阶段义务"三种状态，不把其中任何一种表述为已验证。

## 为什么不建模型

本契约的承诺是**把外部事件翻译到既有扩展点**，它不引入新的状态机：队列项的关闭、工具门的
收紧、投影的排除、trigger 的入队与消费、请求的作答，其状态转移分别归 session v2、tools v2、
run-driver v3 与 human-decisions v2，并由那些契约的模型覆盖。为兼容层另建一个模型会重复它们
的状态空间而不增加新性质，因此本版不建。这是有意的取舍，不是覆盖缺口被遗漏；映射表与站点
义务的正确性由结构检查与提供者验收承担，见下面的性质表。

## 性质与证据义务

下表的性质编号 HK-1～HK-5 来自[提案的性质表](../../../docs/proposals/hooks-compat/README.md#性质与证据义务)，
与契约的条款编号 HK-01～HK-22 是两个不同的编号空间，不要互相替代。"保护点"是承担该性质的
契约条款，"证据"列出目前已有的和仍欠的。

| 性质 | 内容 | 保护点（条款） | 证据现状 |
|---|---|---|---|
| HK-1 | 权力上界：兼容层的效果只能是关闭队列项、收紧门（deny / ask）、排除模型投影、注入下一 Step 的 `system_reminder{hook_context}`、入队 trigger、有资格的程序化作答；没有改写耐久输入 / 参数 / 结果或阻止 Run 结算的路径 | HK-02、HK-04、HK-05 | 间接：run-driver v3 场景 S25（守卫只能关闭）与 tools v2 的参数冻结性质 T-6（[提案不变式](../../../docs/proposals/tool-execution/invariants.md#调用)）。欠：适配器只调用扩展点封闭 API 的结构检查；每站点一个"越权字段被记为 unsupported"的实现测试，至少含 S1 的 `suppressOriginalPrompt` 与 S8 的"阻止结算" |
| HK-2 | 逐项可查：上游两家的每个事件、决定字段、输入字段与配置字段在 HK-09、HK-10、HK-13、HK-14 中恰有一种状态；配置中出现不支持项时写 `hooks.config.unsupported`，不静默 | HK-03、HK-08～HK-14 | 欠：映射表对照上游目录快照的检查（Claude Agent SDK `0.3.270` 的 33 个事件与 `SyncHookJSONOutput` 字段、Codex `d77ebc7` 的 schema）；配置装载测试。快照出处见下节 |
| HK-3 | 失败不静默：每次 hook 运行恰写一条 `hooks.run.completed`；阻断理由对用户与模型都可见；命令级失败不阻断但可查；守卫提供者不可用时不 ready，不出现无守卫放行 | HK-05、HK-15、HK-17 | 规范场景 HS-05、HS-10。欠：崩溃、超时、非法 JSON 的单测；ready 条件的装配测试 |
| HK-4 | 刹车：同一 Session 连续由 `hook_continuation` 触发的 Run 数不超过上限；达到上限的那次 `stop_hook_active = true` 已给出；观察者重跑不产生第二个 trigger | HK-16 | 规范场景 HS-06、HS-09；去重与幂等依赖 session v2 的 `hook_continuation` 来源定义与 LC v2 的观察者幂等义务。欠：计数在归档与恢复之后由 fold 重建的测试 |
| HK-5 | 主体、来源与边界：hook 配置只从租户资产经资格发现，不读宿主 settings；执行主体是装配者且每次触发前重验；command handler 只在部署对该装配者类别授予宿主级执行信任时装载；进程环境不含供应方凭据与记录存储路径；跨租户配置不会被装载 | HK-18、HK-19、HK-20 | 规范场景 HS-07、HS-12。欠：装配准入测试、跨租户否定测试、环境变量白名单测试；程序化作答与确认模式交集的测试 |

## 其它契约承担的部分

| 本契约的条款 | 由谁的证据承担 |
|---|---|
| HK-04 各站点的权力上界 | [run-driver v3](../run-driver/v3/contract.md) 的 RD-17 与 [tools v2](../tools/v2/contract.md) 的 TL-13；模型覆盖见 [run-driver 验证范围](../run-driver/verification.md)与 [tools 验证范围](../tools/verification.md) |
| HK-07 关闭队列项与 arrival 的同门提交 | session v2 的 SE-04 / SE-12 词表与 Inbound 裁决证据 |
| HK-11 调用终态词表 | tools v2 的 TL-07 状态机与其 `ToolCall` 模型 |
| HK-16 `hook_continuation` 的受理、裁决、取用与计数 | session v2 的 SE-06 / SE-10 / SE-13 / SE-14 / SE-15；续跑 Run 的费用预留沿 budget-accounting v1 的 BG-03 |
| HK-20 程序化作答的合法性 | human-decisions v2 的 HD-01 / HD-05 / HD-07 与 action-authorization v1 的 AU-04 |
| HK-06 撤除顺序与保留事实 | live-agent v1 的 AR-16 与 LC v2 的观察者义务；实际清理由提供者设计验收 |

这些引用说明责任归属，不表示本契约的条款已被那些模型逐条检查过：上述模型都不建模 hook
进程、命令超时、配置装载与上游字段映射。

## 上游快照与对照义务

映射表的上游依据固定为 Claude Agent SDK `0.3.270`、Codex `d77ebc7` 与 DSH `c291e79`；原始观察
记录在[六系统循环、事件与 hooks 研究](../../../docs/research/agent-loop-events-and-hooks/README.md)
的 [Claude Code 笔记](../../../docs/research/agent-loop-events-and-hooks/notes/claude-code.md)、
[Codex 笔记](../../../docs/research/agent-loop-events-and-hooks/notes/codex.md)与
[DSH 笔记](../../../docs/research/agent-loop-events-and-hooks/notes/dsh.md)。研究笔记是事实来源，
不是规范依赖：上游演化时按 HK-03 重新对照，结论以新版本发布，不在 v1 内原地修改映射表。
研究笔记本身也没有被独立复核为上游源码的完整枚举，这一局限随笔记。

## 提供者映射的当前状态

提供者尚未开始，`packages/agent/hooks-compat` 还不存在。契约只写语言无关的扩展点义务，具体
服务键、登记形状与 command runner 的实现归提供者设计；候选映射见[能力入口](README.md#提供者映射提示非规范)。
[PF-025](../../../docs/requirements/product/agent/PF-025-external-hooks-compatibility.md) 的四个产品
场景在实现验收时逐条核对，本页不预先声称它们成立。契约接受、模型检查与实现验收分别记录，
覆盖表达沿[验证规范](../../../docs/maintenance/verification.md#覆盖的发现入口)。
