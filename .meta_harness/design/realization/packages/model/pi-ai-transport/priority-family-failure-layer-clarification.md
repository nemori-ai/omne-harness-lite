# PF-N1：贡献失败与规划失败的层次澄清

2026-09-29，revision 1，candidate，待主线精确采用；不修改冻结契约、提供者 revision 5 或既有采用字节。前身为 D107 优先两家后继（HUB `96ae5241b935f7735051f2ffae452a6d978c383c`）及 [revision 5](priority-family-output-cache-candidate.md) 的 signed-prefix/PF-N1。原文“贡献 unavailable，不能 invalidInput”约束计量贡献，未清楚限定层次；本页补完整消费者路径，不改变既有 PlanFailure。

## 现行权威与统一结论

[RT11 S-74](../../../../spec/capabilities/model-request-runtime/v11/contract.md)定义 `input_size_unavailable` 为输入表示材料或适用计量依据不足，结果是 `invalidInput{reason: input_size_unavailable}` 并指出不可判指标。其校准规则明确：贡献不可得先全量，全量仍不可得按 S-74 失败；RT10 同条规则相同。必需构件不可取得才是规划 `unavailable`。本次没有新枚举、模型分支或公开接口。

| 层次/触发 | 必须结果 | 不得混淆 |
| --- | --- | --- |
| 输入来源已证合法；仅 effort/max_tokens 合法变化，原宽摘要不足证明 signed prefix | full/new/φ 的必要贡献 `unavailable`，不产生 token 值 | 不返回贡献 invalidInput，不声称签名损坏，不把原摘要反推成不存在的窄摘要 |
| new/φ 的上述贡献不足 | 统一 planner 按既有规则尝试 full | 不跳过 full；不按 Anthropic 分支改公开错误 |
| full 仍因同一依据不足不能计量 | `rejected: invalidInput, reason: input_size_unavailable, metrics: ['maxInputTokens']` | 这是限制检查不可完成，不是 malformed、签名非法或实际超限；不能因最外层名称 invalidInput 改成 unavailable |
| 真实构件缺席、不能取得所需 provider/meter | 既有规划 `unavailable` | 与取得构件后无法解释贡献分开 |
| 可判来源伪造、摘要矛盾或非法表示 | planner `invalidInput{malformed}`；独立 meter 各沿原闭合返回面 | 不借上面计量不足掩盖输入真实性失败 |

输入限制优先级仍由 S-74 决定：准确超限与估算超门优先于未判指标，所有适用 bytes/图片指标仍精确检查。本页不以 token 不可判授权跳过其他最终门，也不追认将任意内部异常一律吞成计量不可判；异常及来源拒绝仍按现有专属责任处理。

## 实施与验收

现有统一 `plan.ts` 的 calibrated 不可得→input_size_unavailable 映射本身与契约相符；不得为 PF-N1 增加厂商特判或新失败枚举。实施 owner 应区分该正常分支与任何另行发现的来源门/限制优先级缺陷，后者不能因本页混算通过。

PF-N1 必须分别断言：合法 effort-only、max_tokens-only 变化下，必要 full/new/φ 贡献 unavailable；new/φ 全量回退发生；full 仍不可判时 public plan/invoke 与 service 观察到既有 input_size_unavailable，reason 不是 malformed，不能发送请求或产生新响应/出门锚点；真实坏来源仍是 malformed。直接 meter 的 unavailable 与 public PlanFailure 不作同枚举比较。本页替代 review 附页对 PF-N1 可能产生的跨层误读，不修改 O/prefix/cache 选择，不新增形式模型或更改其性质。
