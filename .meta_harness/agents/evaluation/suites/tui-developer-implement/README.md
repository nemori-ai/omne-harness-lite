# tui-developer 补完一个终端模块

量的是：给 [tui-developer](../../../roles/tui-developer/role.md) 一份装好依赖的整仓检出，其中一个终端界面模块的实现体被换成只留公开签名的桩、
针对它的原有测试被拿走，按一份完整的施工简报让它把模块补完——补完之后原有测试与类型检查是否全过，
它是否守住写入范围、没有动原有测试。判定由程序在收录运行时做，没有判官。

状态：**第 1 版，两次签字已齐（2026-10-02），还没有基线。**基线何时跑由 [#72](https://github.com/nemori-ai/omne-harness-lite/issues/72) 跟踪。

这个流与 [developer-implement](../developer-implement/README.md) 同属 `implement` 一类，副本、判定、指标与运行器代码完全相同，
只有角色、材料与目标测试不同；下文只写不同之处，相同的部分以那份说明为准。

## 材料

三项都取自[角色模型对照（Sonnet 5.5）](../../role-model-sonnet55/README.md)留出集里属于 tui-developer 的任务
（[留出集](../../role-model-sonnet55/suites/role-tasks-heldout-v1.json)的 `TD-1`～`TD-3`），钉在提交 `003561900`，成员 `apps/cli`。

| 材料 | 被换成桩的模块 | 隐藏的原有测试 | 写入范围 | 目标测试 |
|---|---|---|---|---|
| `TD-1` | `apps/cli/src/tui/mode-replies.ts`：终端字节入口的控制答复拆分 | `tui-mode-replies.spec.ts` | 该文件；`apps/cli/tests/` 下新增 | 7 条 |
| `TD-2` | `apps/cli/src/tui/screen.ts`：整帧布局与帧写入 | `tui-screen.spec.ts` | 同上 | 16 条 |
| `TD-3` | `apps/cli/src/tui/framer.ts`：终端输入分帧 | `tui-input.spec.ts`、`tui-mode-replies.spec.ts` | 同上 | 16 条 |

「目标测试」是桩在位时失败的那些测试（[target-tests.json](target-tests.json)），由原对照的 `verify-suite` 生成，`verify` 每次重新核对。
TD-2 的目标测试里有 `tui-application.spec.ts`、`tui-dialog.spec.ts` 的条目：它们依赖 `screen.ts`，不是隐藏测试，留在副本里，角色看得到它们在桩上失败。

## 副本与判定

与 developer-implement 相同：同一个基底提交、同一份排除清单与装依赖步骤；删掉成员的 `dist/`、删掉隐藏测试、盖上桩，提交成唯一的基线提交。
`record` 在删副本之前判定，规则照搬原对照的 `oracle_implement` 与 `judge_scope`，五个指标（`success`、`target_pass`、`write_scope`、
`tests_intact`、`only_allowed`）的得出方式见 [developer-implement](../developer-implement/README.md#副本与判定)。

`verify` 在真的副本上证明判定器判得出：桩在位时 `success` 为假且失败的测试正是存着的目标测试；把模板里的原文件放回桩的位置，`success` 为真、目标测试全过。

## 运行设置

Claude Sonnet 5.5，high，放行 Read、Glob、Grep、Edit、Write、Bash，每份材料 2 次。出处：

- 模型：原对照里 tui-developer 跑过 Opus 5.5 与 Sonnet 5.5 两组，结论是换成 Sonnet 5.5，并已落到角色源
  （[对照的采用表](../../role-model-sonnet55/README.md#采用)；[角色源](../../../roles/tui-developer/claude.yaml)现钉 `claude-sonnet-5-5`）。这里取 Sonnet 5.5 那一组。
- 档位：原对照「档位取角色默认（application-developer 为 medium，其余 high）」，tui-developer 两组都是 high（同一份 README 的「方法」）。
- 工具：原运行脚本 `tooling/evalrun.py` 的 `run` 放行 `Bash`、`Read`、`Edit`、`Write`、`Glob`、`Grep`，禁 `WebFetch`、`WebSearch`、`Agent`。
  角色定义里另有 WebFetch、WebSearch；registered 派发拿不走它们，用了就体现在 `only_allowed` 上。

## 复制时改了什么

用例的内容（简报框架、三份任务简报、桩、隐藏测试清单、写入范围、目标测试清单）逐字取自原对照，只有：

- 清单字段按 `flow.json` 的形状改写：`stub`、`hidden_tests`、`allowed_write` 放进每份材料的 `task`，目标测试放进独立文件由 `oracle.target_tests` 指过去
  （[target-tests.json](target-tests.json) 是原文件里 `TD-1`～`TD-3` 三项，条目与顺序不变）。
- 简报框架 `briefs/_implement.md` 与原对照的同名文件、与 developer-implement 的那份逐字相同；`{ROLE}` 填的是 `tui-developer`，与原对照相同。
- `target`、`tags` 是新写的说明，不进简报。

判定标准没有改。

## 基线数字与噪声范围

还没有基线。

原对照里这三项的结果（`claude -p` 无界面运行、角色定义作为主会话、每任务每模型 2 次，是旧的结果，**不是这个用例集的基线**）：
TD-1、TD-2 两个模型都全过 ×2；TD-3 Opus 5.5 为 15/16、14/16，Sonnet 5.5 为 14/16、15/16——两条目标测试（OSC 内的 BEL 是否作取消键；
单独 ESC 被 Ctrl+G 终止时是否另报 invalid）四组八次无人全过，原对照判为规格未定。见[原对照的逐任务表](../../role-model-sonnet55/README.md#sonnet-55-对-opus-55)。

## 量不出什么

- **完成声明是否属实。**程序判不了，要人对着 `oracle/oracle.json` 读 `final.md`。
- 副本里的 skills、文档与工具是钉住那个提交的版本，不是工作树的；只有角色定义取自当前的源。
- 三项都是单模块的终端输入、输出与布局，不含跨模块的终端生命周期、真实终端里才出现的问题、取消传播与恢复语义——角色说明里点名要改派顶档的那几类，这个流都量不到。
- TD-3 有两条目标测试属规格没写明的行为，`target_pass` 在 TD-3 上很难到 1，`success` 很难为真。
- 依赖目录是从模板硬链接来的：角色若改了 `node_modules` 里的文件，会连模板一起改。
- 隔离只靠「从仓库之外派发」与事后扫描工具输入；这条前提与 registered 派发还没有对上，见[运行器说明](../../harness/README.md#整仓检出一类)。
