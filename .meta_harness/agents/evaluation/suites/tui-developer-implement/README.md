# developer 以 terminal 补完一个终端模块

量的是：给 [developer](../../../roles/developer/role.md) 一份装好依赖的整仓检出，`implementation_kind` 为 `terminal`，其中一个终端界面模块的实现体被换成只留公开签名的桩、
针对它的原有测试被拿走，按一份完整的施工简报让它把模块补完——补完之后原有测试与类型检查是否全过，
它是否守住写入范围、没有动原有测试。判定由程序在收录运行时做，没有判官。

状态：版本2仅迁移派发输入和局部规则；尚未重新签字或运行模型基线，不沿用版本1的签字或声称性能等价。基线何时跑由 [遗留汇总L07](https://github.com/nemori-ai/omne-harness-lite/issues/193#legacy-agent-evaluations) 跟踪。

这个流与 [developer-implement](../developer-implement/README.md) 同属 `implement` 一类，副本、判定、指标与运行器代码完全相同，
只有角色、材料与目标测试不同；下文只写不同之处，相同的部分以那份说明为准。

## 材料

三项的基底、任务和目标测试由 [flow.json](flow.json) 定义，成员是 `apps/cli`。

| 材料 | 被换成桩的模块 | 隐藏的原有测试 | 写入范围 | 目标测试 |
|---|---|---|---|---|
| `TD-1` | `apps/cli/src/tui/mode-replies.ts`：终端字节入口的控制答复拆分 | `tui-mode-replies.spec.ts` | 该文件；`apps/cli/tests/` 下新增 | 7 条 |
| `TD-2` | `apps/cli/src/tui/screen.ts`：整帧布局与帧写入 | `tui-screen.spec.ts` | 同上 | 16 条 |
| `TD-3` | `apps/cli/src/tui/framer.ts`：终端输入分帧 | `tui-input.spec.ts`、`tui-mode-replies.spec.ts` | 同上 | 16 条 |

「目标测试」是桩在位时失败的那些测试（[target-tests.json](target-tests.json)），`verify` 每次重新核对。
TD-2 的目标测试里有 `tui-application.spec.ts`、`tui-dialog.spec.ts` 的条目：它们依赖 `screen.ts`，不是隐藏测试，留在副本里，角色看得到它们在桩上失败。

## 副本与判定

与 developer-implement 相同：同一个基底提交、同一份排除清单与装依赖步骤；删掉成员的 `dist/`、删掉隐藏测试、盖上桩，提交成唯一的基线提交。
`record` 在删副本之前判定，五个指标（`success`、`target_pass`、`write_scope`、
`tests_intact`、`only_allowed`）的得出方式见 [developer-implement](../developer-implement/README.md#副本与判定)。

`verify` 在真的副本上证明判定器判得出：桩在位时 `success` 为假且失败的测试正是存着的目标测试；把模板里的原文件放回桩的位置，`success` 为真、目标测试全过。

## 运行设置

模型、档位、工具清单、次数和判定阈值以 [flow.json](flow.json) 为准。
角色的默认配置归[角色源](../../../roles/developer/claude.yaml)。这次派发的实施种类是 `terminal`。
每次执行的输出与比较结果放本工作树 tmp，不在用例说明中追加运行流水。

## 量不出什么

- **完成声明是否属实。**程序判不了，要人对着 `oracle/oracle.json` 读 `final.md`。
- 副本代码、普通开发文档与工具钉住固定提交。中央 skills 和旧宿主指导不进入副本，角色定义取自当前源。
- 三项都是单模块的终端输入、输出与布局，不含跨模块的终端生命周期、真实终端里才出现的问题、取消传播与恢复语义——角色说明里点名要改派顶档的那几类，这个流都量不到。
- TD-3 有两条目标测试属规格没写明的行为，`target_pass` 在 TD-3 上很难到 1，`success` 很难为真。
- 依赖目录是从模板硬链接来的：角色若改了 `node_modules` 里的文件，会连模板一起改。
- 隔离只靠「从仓库之外派发」与事后扫描工具输入；这条前提与 registered 派发还没有对上，见[运行器说明](../../harness/README.md#整仓检出一类)。
