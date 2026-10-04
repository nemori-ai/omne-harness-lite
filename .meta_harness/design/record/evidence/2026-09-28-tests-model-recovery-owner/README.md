# 恢复任务留存与统一关闭的有限验收

2026-09-28，主线 HUB 集成执行。采用依据为 [D-105](../../decisions/model-recovery-timing-provider-adoption/decision.md)及[恢复 owner 补充](../../../realization/packages/model/model-request-runtime/v12-recovery-owner-supplement.md)。本次验证库级恢复任务所有权及统一工厂消费，真实宿主的停止证明由装配另验；不是完整十三操作签收。

## 结果与输入

产品源码 `d3b5cfdd` 的 runtime build、typecheck 和[43 文件634项测试](reconcile-final-tests.log)通过。随后 `927ca621` 只补双语文档和同 scope 断言，`544f39fd` 只加未知写入确认缺席的负例；最终[14 项恢复定向测试](reconcile-final-negative-tests.log)通过，没有将这次局部运行称为635项全包运行。精确提交、源码/测试/锁文件摘要、工具版本及命令见 [inputs](inputs.json)。

先前 `8deabc12` 的[43文件633项](reconcile-owner-tests.log)与同依赖状态下 demo [20文件85项](reconcile-owner-demo-tests.log)通过，demo build/typecheck原件并存。后续两次产品修复仅增加跨会话独立退出、跟踪已启动控制追加；最新demo真实宿主还未接入此恢复组件，因此这些正常回归不能冒称真实恢复端到端。

## 已实际覆盖

- 未知控制追加沿原 registration 认回，concurrent=1 不再申请第二配额；并发 close 单飞，原责任仅释放一次。
- 真实 JSONL 的 ended 已提交但回执未知：首次 unavailable，读回原记录后认回，零重复追加。另一个负例确认原追加实际缺席：不提前报告业务终结；后续同 scope 普通 reconcile 才按既有规则提交。
- 原响应批已提交但回执未知、权威前缀暂不可读时留存原 scope/coordinator；恢复读通后保留原 ResponseId、时间和账，原完整批优先。
- late enter、held actual stopped、scope.close 首次失败均不假释放；其他会话可独立退出。同一会话未决时不第二次 enter，后续来源恢复仍复用原 scope。
- close 与已经开始的响应/控制追加竞争：停止真实 task、等待其 stopped，保留未知责任；close 不启动第二次业务追加。相应 JSONL 测试观察实际提交次数。
- 冷 noRun 构造 sentAt:null、原 handle 的真实时刻/无损费用/headers保留，以及整体 unavailable 不返回部分成功，均在定向和完整包中执行。

具体故障注入与 oracle 在上述 inputs 所冻结的 `tests/service-reconcile.spec.ts`、`tests/service-calls.spec.ts`、`tests/service-control.spec.ts`、`tests/service-runtime.spec.ts`，不是新建一份实现同义模型。归档日志由 Vitest 默认 reporter 输出汇总；单项断言内容按对应源码读取。

## 原失败与边界

[初次 tracker 消费测试](unknown-tracker-tests.log)保留21通过/1失败：旧测试期待认回时第二次配额申请，与新单配额责任不符。后续测试使用真实容量1、只取得一次、unknown前零释放/认回后一次释放；[修正后的22项](unknown-tracker-tests-corrected.log)通过。跨会话 close 早退问题是主线代码审阅发现，后续两个真实 JSONL 场景通过；不编造未执行的红灯运行。

本次没有上游模型请求、费用变更或37模型认证；没有真实kill/reopen、L1永久撤除到L2的责任交接、withRun/G28或生产recovery.enter证明。真实JSONL日志不使受控恢复scope自动成为生产宿主。没有运行新的TLA+/Alloy，也没有证明所有交错。新增绑定0，完整纵线仍未交付。

按 inputs 对应提交检出，用锁文件安装依赖，顺序构建依赖及本包，再执行列出的命令。不同源码状态分别重跑，不把历史日志换上新提交标签。原件完整性见 [manifest](manifest.json)。
