# 2026-10-03 · Moonshot 混合数组空文本段的有限验收

[D-115](../../decisions/moonshot-empty-text-adoption/README.md) 与 [pi-ai-transport 节点](../../../realization/packages/model/pi-ai-transport/README.md)的两条当前 Moonshot 完整绑定修复。独立 QA 为 **Pass with issues，10 条标准均通过**；主会话的有限技术签收见 [接受记录](acceptance.md)，QA 判决本身不产生接受。

最终源码候选 `eb2b5bf00dca8facc67d5c082418d09e4a0fbdc0`，集成基线 `dfa3eb92e292dddb1bb47cf122212362d095c143`，交付 [PR #87](https://github.com/nemori-ai/omne-harness-lite/pull/87)。PI、构建／类型、公开场景及付费记录的原执行头为 `56c446ab842e2e2e69a120755019e2ad553e09e1`；34 个构建成员和根执行输入逐路径无差异，复用依据见 [独立对账](final-reuse-audit.json)。仓库内容读者及共同检查在最终源码候选执行。旧运行坐标没有改写。

## 实际覆盖

| 范围 | 结果 |
|---|---|
| 计划 | 两成员测试／类型、34 成员构建；Python 与无成员验收明确跳过 |
| PI | 快层 1366、慢层 1185 通过 |
| ts-checks | 快层 861、慢层 19 通过 |
| 独立公开场景 | 42/42；真实 planner、官方 meter、Sharp 与 loopback TLS；固定 body 相等 |
| 共同检查 | agents/docs/design/format/facility/shell/lint/严格硬线退出 0 |
| 来源 | 97 原请求、3 汇总、脱敏／hash 映射及离线 probe／重算／核价入口实际核对 |
| 当前上游确认 | Kimi K3 当前 mp4-19 一次实际 send，complete，新增 0.001179 USD；累计 0.2332056／5 USD |

108 个原始分层 skip 中，107 个在另一层实际通过；唯一两层均未执行的是既有、对 Pro 不适用的 DeepSeek 图像增量案例。TLC／Alloy 仅 registered，没有执行。没有占用或排队申请全机检查名额；本轮 CPU／成员／worker／构建并发均为 1。

## 读数与局限

`planRequest` CC 86→92，改动文件一端命中四处重复片段。全仓当前 21 红成员／470 个超 alert 函数／2 个超预算成员，因无基线快照不判整体变化。单 CPU 的 test-slot 快层文件约 11 秒，PI 慢层另有 9 份很快的文件；不把这些读数藏成全局全绿，也不盲改分层。

TLS 用量和四条旧校准 observation 明确 synthetic；真实上游确认仅上述一条 Kimi 样本。该范围不提升另一叶、所有历史位置／全空串或 37 模型整体认证。原探针与新生产请求的范围见 [研究](../../../../research/empty-text-part-acceptance/README.md)。一分钟目标未在常规并发下验证。

## 原件与复现

[QA 报告原件](qa-report.txt)按原任务区相对路径阅读，其字节未修改；[机读报告](qa-report.json)、[覆盖对账](coverage-account.json)、[命令](final-commands.json)、[计划](final-plan.json)、[设施失败](facility-failures.json)、[回路读数](loop-status.json)为逐字节副本。[provenance.json](provenance.json)逐件记录原路径、长度和 SHA-256。

全部原始日志、独立场景和失败记录保留在主检出的 `tmp/test-tiers-mutation/qa50-r1/`，任务保全清单另逐文件核 hash。归档报告不冒充原始日志已全部进入 Git；QA 设施失败没有改成通过或产品 flaky。重跑按报告的两个冻结源码头、固定工具链与实际命令；不得用旧 97 次探针代替修后当前调用。


## 差分变异与实际反控

源码候选eb2b5bf、基线dfa3eb92e，直接执行低并发差分入口，只变异PI本次3文件／6段：45个，工具报告Killed23／Survived22／Timeout0／NoCoverage0、报告分数51.1%，入口退出0。原[报告](mutation-report.json)及[摘要](mutation-summary.txt)完整保留。

其中mutant43将content.filter改为content，工具报告Survived；主会话在同一冻结干净副本中临时注入该等价改动，现有38条直接回归实际20失败／18通过（vitest exit1），随后逐字节恢复，tracked clean。见[反控结果](mutation-counter.json)与[原始Vitest结果](mutation-counter-vitest.json)。该条不是已确认的真实测试存活，说明此运行存在变异设施读数失真；确切设施原因尚未判。其余状态未逐项复跑，不用原51.1%宣称真实守护能力。存活清单按负责人要求只归档，不另开清理issue。
