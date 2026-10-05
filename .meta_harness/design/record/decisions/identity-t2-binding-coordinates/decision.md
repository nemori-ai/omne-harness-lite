# T2 管理绑定坐标及入口提供者改名的限定采用

状态：补充设计已采用，产品实现及 M05 验收基线门尚未完成。

负责人 panqiwei 授权主会话继续架构整改。主会话在此委托内于 2026-10-04T18:39:50.249551+00:00 采用本补充。
输入 BASE 为 `67eecc1ae53be30efec473206e5d1926dd5d500f`，精确正文与散列见[inputs.json](inputs.json)。
本记录不表示负责人逐条亲审，也不将独立审阅意见当作接受权限。

依据是[原 D0 采用](../identity-integration-design/decision.md)及其
[架构判断来源](../../../../research/architecture-judgment-aids/research.md)。
本次新观察可以从 BASE 的 `packages/tenancy/governance-center-entry/package.json` 与已接受设计复现：
旧提供者占用 `@omne-harness-lite/governance-center-entry`，而 T2 须建立同名 core 定义，原计划到 T4 才改名提供者。
同时，M05 要求冻结可执行加载入口，但原正文未指定八个管理绑定的导出名。

## 采用范围

- 采用 [retirement 绑定表](../../../architecture/identity-integration/retirement.md#t2-绑定的精确装载坐标)
  的八组独立/管理导出、插件 name 和包子入口。管理版必需注入 assemblyLifetime，缺席不得退回独立模式。
  独立版仍要求调用方先排空消费者。两张网络面都必需同一 EntryOpening，管理版声明 assemblyLifecycle: 1。
- 把治理入口提供者的物理改名及全部包路径消费者、发布/部署路径改接提前到 T2。
  新 core 定义取得原公共包名，具体提供者使用 governance-center-entry-node，不保留旧包别名。
- T4 仍完成服务端独立工厂分面、其余事件/运行资源和数据树；物理改名不表示这些行为已经兑现。

公共业务语义、关闭算法、唯一关闭者、停止资格、事务边界、数据身份和替换保证均沿原 D0。
这次不新增动态模式切换、局部无停机替换或任意强制卸载保证。
只补精确坐标并取代原 D0 中“entry 提供者到 T4 才改名”的施工安排，原历史 inputs 不改写。

## 独立审阅及后续门

identity_d0_expression 的限定 Expression、remediation_plan_review 的限定 Plan 均无本轮阻断。
Expression 的 E7“在 T2 接受后”已明确为本补充设计采用；T4-S2 的残余改名措辞同步改为已改名服务端分面。
旧冻结副本、审阅归属、机械输出及这两处修正保留在任务证据，未改写首次稿件。
机械 design-review 仍报告 OG2/AR2 两份 formal README 漏登记，归原 N5/N6 责任，不在此关闭。

QA 须把本次精确入口纳入 M05 的输入与断言冻结，并完成原 BASE 的实际行为观察后，才能释放 T2-S1。
随后按 S1→S2→S3→S4 实施，完整 T2 经 L3 实施审阅及干净检出 QA 后才接受合入。
实际包消费、运行装载、停机组合和部署可运行性均未由这次设计补充验证。
