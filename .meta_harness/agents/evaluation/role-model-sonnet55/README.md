# 角色模型对照：Sonnet 5.5 与 Fable 5.1 对 Opus 5.5（2026-09-29～30）

本记录保存一次换模型对照的计划、任务包、运行证据与采用结果。模型与档位的权威仍在各角色的
`claude.yaml` / `codex.toml` / `assembly.toml`；支持证据在
[宿主支持记录](../../skills/design-subagents/canonical/references/model-support.json)。
原始轨迹、改动补丁与判据输出在主检出 `tmp/role-model-sonnet55/runs/`（不入 Git）。

## 问什么

1. Sonnet 5.5 于 2026-09-28 发布。四个开发侧角色——application-developer、tui-developer、
   verification-developer、tui-qa——在提示、工具、档位不变的条件下换成 `claude-sonnet-5-5`，
   结果、关键约束与成本各有什么变化。
2. 订阅里 Fable 的用量单独计量而大多闲置。在实现类任务上 `claude-fable-5-1` 同档位是否不比 Opus 5.5 差，
   以决定能否把部分 Opus 角色改到 Fable 上。

## 方法

四份分析计划都在对应运行之前固定，hash 记在 `frozen*.sha256`：

| 计划 | 内容 |
|---|---|
| [原计划](analysis-plan.md) | 四角色、11 项留出任务、每任务每模型 2 次；判据、关键约束、退化上限、停止规则 |
| [修订 2](analysis-plan-r2-fable.md) | Fable 5.1 对 Opus 5.5，六个实现任务，档位 high |
| [修订 3](analysis-plan-r3-qa-serial.md) | 验收任务单路串行重跑、上限 90 分钟、更正 QA-2 的 C8 判据；原计划下的验收运行不用于结论 |
| [修订 3b](analysis-plan-r3b-qa-isolated.md) | 串行批次遭断网作废后，剩余 9 次在各自的 PID 命名空间里并行补跑 |

任务取材自 `apps/cli`，见[留出集](suites/role-tasks-heldout-v1.json)与各[简报](tasks/briefs/)：

| 形态 | 任务 | 判据 |
|---|---|---|
| 实现（移除模块实现体，只留公开签名） | AD-1～3、TD-1～3 | 原有测试（运行时不在检出内）全部通过且类型检查通过；依赖被移除模块的测试清单在 [target-tests.json](suites/target-tests.json) |
| 写测试（移除原有测试） | VD-1、VD-2 | 测试在当前实现上通过，且杀死全部预置变异体（10 个、8 个） |
| 验收（三份构建，含 0、2、1 处预置缺陷） | QA-1～3 | 判决与预期相符，逐条无漏报、无误报；[真值脚本](tooling/qa-ground-truth.sh) |

运行方式：`claude -p`，角色的完整定义经 `--agents` 传入并作为主会话运行，`--setting-sources project`，
禁网络与委派，接受编辑、Bash 放行、其余自动拒绝；每次一份仓库外的独立检出。
两组只有 `model` 字段不同；档位取角色默认（application-developer 为 medium，其余 high）。
运行脚本见 [tooling/](tooling/)。

**与协议的关系**：[协议](../developer-model/protocol.md)评的是防御辅助的去留（三臂），本次只跑 `retain` 对 `retain`，
辅助全部原样保留。结果不满足协议的 `evidence-ready`，也不符合 experiment Schema；不支持精简或移除任何辅助。

## 结果

每格「成功次数／运行次数」，部分得分为实现类的目标测试通过率、验证类的变异体杀死率、验收类判对的标准条数。
成本为宿主按标价折算的每次运行均值。所有有效运行中没有一次违反关键约束（写入范围、判据完整性、隔离）；
「如实报告」逐份阅读最终消息后判为满足——失败运行都把自选行为与未运行的验证写明了。

### Sonnet 5.5 对 Opus 5.5

| 角色 | 模型 | 成功 | 部分得分 | 成本 | 输出 token | 用时 |
|---|---|---|---|---|---|---|
| application-developer | Opus 5.5 | 4/6 | 98.8% | $1.53 | 25.8k | 5 分 |
| | Sonnet 5.5 | 3/6 | 96.2% | $0.45 | 12.5k | 2 分 |
| tui-developer | Opus 5.5 | 4/6 | 96.9% | $1.61 | 32.0k | 7 分 |
| | Sonnet 5.5 | 4/6 | 96.9% | $0.59 | 22.2k | 3 分 |
| verification-developer | Opus 5.5 | 4/4 | 100% | $2.30 | 49.4k | 14 分 |
| | Sonnet 5.5 | 4/4 | 100% | $1.22 | 49.4k | 14 分 |
| tui-qa（修订 3/3b） | Opus 5.5 | 5/6 | 76.7% | $4.02 | 69.9k | 51 分 |
| | Sonnet 5.5 | 6/6 | 93.3% | $2.09 | 60.3k | 54 分 |

逐任务：

| 任务 | Opus 5.5 | Sonnet 5.5 | 说明 |
|---|---|---|---|
| AD-1 输入取得 | 26/27、26/27 | 25/27、25/27 | 一条测试（解析结果原型须为 null）四组八次全挂，属规格未写明的实现细节；Sonnet 另把载荷含秘密成员的诊断码选成 `invalid-options`（原测试要 `secret-source`），两次一致并在报告里写明 |
| AD-2 参数解析 | 全过 ×2 | 全过 ×2 | |
| AD-3 装配与收场 | 全过 ×2 | 全过、12/13 | Sonnet 第二次未捕获版本读取的异常，报告里写明为自选行为 |
| TD-1 模式答复拆分 | 全过 ×2 | 全过 ×2 | |
| TD-2 屏幕与帧写入 | 全过 ×2 | 全过 ×2 | |
| TD-3 输入分帧 | 15/16、14/16 | 14/16、15/16 | 两条测试（OSC 内的 BEL 是否作取消键；单独 ESC 被 Ctrl+G 终止时是否另报 invalid）四组无人全过，规格未定 |
| VD-1 输入模块测试 | 10/10 ×2 | 10/10 ×2 | |
| VD-2 屏幕模块测试 | 8/8 ×2 | 8/8 ×2 | |
| QA-1 无缺陷 | Pass；**未交报告** | Pass；Unable to verify（C1–C9 对，C10 记未跑） | Opus 第二次跑 23 分钟后以进展汇报结束回合，没写报告——正是 Opus 5.5 官方指南点名的收尾形态 |
| QA-2 两处缺陷 | Fail，两处全抓 ×2 | Fail，两处全抓 ×2 | |
| QA-3 一处缺陷 | Fail，抓到 ×2 | Fail，抓到 ×2 | 四组里 C10 多记为未跑，两模型一致，不是区分项 |

按[原计划](analysis-plan.md)的四条规则逐角色判定：

| 角色 | 约束违反 | 成功不少于基线减一 | 部分得分差 ≤ 5 点 | 成本更低 | 结论 |
|---|---|---|---|---|---|
| application-developer | 无 | 3 ≥ 3 | −2.6 点 | 是 | 支持替换 |
| tui-developer | 无 | 4 ≥ 3 | 0 | 是 | 支持替换 |
| verification-developer | 无 | 4 ≥ 3 | 0 | 是 | 支持替换 |
| tui-qa | 无 | 6 ≥ 4 | +16.6 点 | 是 | 支持替换 |

### Fable 5.1 对 Opus 5.5（修订 2，六个实现任务，档位 high）

| 模型 | 成功 | 部分得分 | 成本 | 输出 token | 工具调用 |
|---|---|---|---|---|---|
| Opus 5.5 | 8/12 | 97.8% | $1.80 | 32.6k | 29.8 |
| Fable 5.1 | 7/12 | 97.7% | $2.86 | 22.2k | 16.2 |

Fable 少的一次是 AD-2 的一次运行把「全局选项之后出现 `machine`」判成无法确定命令（`invalid-command`），
报告里写明了这是自选行为。按修订 2 的三条规则：无约束违反、7 ≥ 7、−0.1 点，**支持替换**；
成本按计划不作判据（出发点是闲置额度）。

### Sonnet 5.5 的档位（修订 4，[frozen-r4.sha256](frozen-r4.sha256)）

原计划有意不动档位。换模型定下之后，按官方「各档位重新校准、不能沿用旧设置」的说法，
把唯一默认 medium 的 application-developer 的三个任务用 Sonnet 5.5 high 各补跑两次：

| 任务 | Sonnet medium | Sonnet high |
|---|---|---|
| AD-1 | 25/27、25/27，$0.49、$0.56 | 25/27、25/27，$0.76、$0.81 |
| AD-2 | 全过 ×2，$0.23、$0.33 | 全过 ×2，$0.44、$0.42 |
| AD-3 | 全过、12/13，$0.54、$0.58 | 全过 ×2，$1.24、$1.18 |

AD-3 在 medium 下漏掉的错误路径处理在 high 下没有再出现；AD-1 的两处差异在 high 下原样保留，
说明那是它对规格空白的一致选择，与档位无关。成本约翻倍，仍只有 Opus medium 的一半。
据此 application-developer 的默认档位改为 high；其余三个角色本来就是 high，不动。

## 采用

由用户裁定并已落到角色源（`claude.yaml`、`codex.toml`、`assembly.toml`），宿主产物重新生成、
`make agents-check` 与 `make docs-check` 通过，六个角色都在新进程里原生派发过一次，用量记在目标模型名下。
四个 Sonnet 角色的 `description`（两端逐字相同）补了升级指引：默认跑在宿主的经济档，什么情形该改派顶档
（Claude Opus 5.5、Codex GPT-6 Astra）、什么情形该调档，写在生成器要求的档位固定句之前。

| 角色 | 原模型 | 现模型 | 依据 |
|---|---|---|---|
| application-developer、tui-developer、verification-developer、tui-qa | Opus 5.5 | Sonnet 5.5 | 本次对照；application-developer 默认档位 medium → high（修订 4） |
| spec-drafter | Opus 5.5 | Fable 5.1 | 退回 2026-09-23 之前的配置（见[上一次复评](../role-model-reeval/README.md)），用闲置额度；改后与 Opus 上的 spec-reviewer 跨模型 |
| kernel-developer | Opus 5.5 | Fable 5.1 | 同上退回；修订 2 的实现任务证据佐证 |
| 其余（三个 drafter、spec-reviewer、capability/infrastructure-developer、tui-debugger） | Opus 5.5 | 不变 | drafter 的评审在 Fable 上，须保持跨模型；capability/infrastructure 是下一个 Fable 候选，先观察一两周额度水位再定 |
| 三个评审 | Fable 5.1 | 不变 | |

现在的分布：Opus 5.5 七个、Fable 5.1 五个、Sonnet 5.5 四个。Codex 一侧未动。

**回滚条件**：某角色出现只有旧模型抓得到的阻断，或评审收敛轮数比基线多一轮以上，退回该角色；
tui-qa 若再出现单次超过 90 分钟或不交报告，按同样方式处理。

## 局限与偏离

- 样本小：每任务每模型 2 次，结论是描述性的，不是统计结论。
- 任务只覆盖 CLI/TUI 的输入、输出、布局模块与非交互验收，不含存储、取消传播、恢复语义、真实终端。
- 修订 2 用 application/tui-developer 的提示评估 Fable，替换的却是 spec-drafter 与 kernel-developer；
  前者的依据只有历史配置。
- 留出集在修订 2、3 时对实验者已不是未见材料；期间没有据结果改过提示、辅助、档位或简报，判据只更正了 C8 一处。
- 原计划下的 12 次验收运行受并行干扰与 45 分钟上限影响，保留为记录、不用于结论；
  两个模型都会用按名字匹配的方式结束进程，PID 命名空间隔离后消失。
- 修订 3 遭断网作废 9 次（记录后缀 `-apierror`），一次进行到一半的 Opus 运行被断网掐断，
  另一次在切换到修订 3b 时被中止（`-killed`）；补跑按修订 3b 并行进行，用时不与串行记录直接比较。
- 档位由 `--effort` 与角色定义双重传入；轨迹只记录 `per_turn_effort_active`，未回显具体档位值。
- 本机没有沙箱；隔离靠仓库外检出、禁网、事后扫描轨迹。
- 全部运行的折算成本约 145 美元（含试跑、作废运行与派发验证）。

## 来源（2026-09-29 核对）

- Claude Code [模型配置](https://code.claude.com/docs/en/model-config)：Sonnet 5.5 最低 2.1.284、各模型 effort 档位
- [Introducing Claude Sonnet 5.5](https://www.anthropic.com/claude-sonnet-5-5)、[Prompting Claude Sonnet 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5)
- 第三方：[Artificial Analysis 各档位成本（经 explainx 转述）](https://www.explainx.ai/blog/claude-opus-5-5-vs-sonnet-5-5-comparison-2026)、[CodeRabbit 代码审查对照](https://www.coderabbit.ai/blog/sonnet-5-5-model-review)、[Vals AI](https://www.vals.ai/models/anthropic_claude-sonnet-5-5)
