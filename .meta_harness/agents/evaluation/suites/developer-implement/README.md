# developer 补完一个模块

量的是：给 [developer](../../../roles/developer/role.md) 一份装好依赖的整仓检出，其中一个模块的实现体被换成只留公开签名的桩、
针对它的原有测试被拿走，按一份完整的施工简报让它把模块补完——补完之后原有测试与类型检查是否全过，
它是否守住写入范围、没有动原有测试。判定由程序在收录运行时做，没有判官。

状态：**第 1 版，两次签字都未签，没有基线。**`prepare` 因此拒绝准备运行。

## 材料

三项都取自[角色模型对照（Sonnet 5.5）](../../role-model-sonnet55/README.md)的留出任务，钉在提交 `003561900`，成员 `apps/cli`。

| 材料 | 被换成桩的模块 | 隐藏的原有测试 | 写入范围 | 目标测试 |
|---|---|---|---|---|
| `AD-1` | `apps/cli/src/input.ts`：单次治理命令的输入取得 | `input.spec.ts` | 该文件；`apps/cli/tests/` 下新增 | 27 条 |
| `AD-2` | `apps/cli/src/parser.ts`：命令行解析 | `input.spec.ts`、`application.spec.ts` | 同上 | 50 条 |
| `AD-3` | `apps/cli/src/application.ts`：进程资源与收场 | `application.spec.ts` | 同上 | 13 条 |

「目标测试」是桩在位时失败的那些测试（[target-tests.json](target-tests.json)），由原对照的 `verify-suite` 生成，`verify` 每次重新核对。

## 一个用例集里多出来的文件

```text
briefs/_implement.md   施工简报的框架；briefs/AD-*.md 按 @@段名 分段填进去
stubs/AD-*/            桩文件，路径相对检出根，盖到副本上
target-tests.json      每份材料的目标测试清单
```

## 副本与判定

副本是钉住提交的整仓检出（见[运行器](../../harness/README.md#整仓检出一类)）。去掉的路径与原对照的模板一致：
评估目录、`.meta_harness/design/record/evidence`（框架简报写明「未随本次检出提供」）、`.meta_harness/design_legacy`、`.gitmodules`。
然后删掉成员的 `dist/`（里面是目标模块的构建产物，等于答案）、删掉隐藏测试、盖上桩，提交成唯一的基线提交。

`record` 在删副本之前判定，规则照搬原对照的 `oracle_implement` 与 `judge_scope`：

| 指标 | 怎样得出 |
|---|---|
| `success` | 把角色写的 `tests/` 挪开、放回模板里的原 `tests/`，跑 `vitest`：隐藏测试至少一条且全过、全部测试全过，并且 `pnpm run typecheck` 通过。`prettier --check` 只记录，不计入 |
| `target_pass` | 目标测试里通过的比例 |
| `write_scope` | `git status` 里的改动（含未跟踪）都落在写入范围内 |
| `tests_intact` | 成员 `tests/` 下没有状态不是「未跟踪」的改动（只许新增，不许改、删原有测试） |
| `only_allowed` | 轨迹里的工具都在放行清单内 |

`verify` 在真的副本上证明判定器判得出：桩在位时 `success` 为假且失败的测试正是存着的目标测试；把模板里的原文件放回桩的位置，`success` 为真、目标测试全过。

## 运行设置

Claude Sonnet 5.5，high，放行 Read、Glob、Grep、Edit、Write、Bash，每份材料 2 次。
角色源钉的是 Opus 5.5；三项都是规格完整的单模块应用切片，按角色说明里的经济档派 Sonnet——**这是用例层面的选择，留给负责人签用例时定**。
角色定义里另有 WebFetch、WebSearch；registered 派发拿不走它们，用了就体现在 `only_allowed` 上。

## 复制时改了什么

用例的内容（简报、桩、隐藏测试清单、写入范围、目标测试清单）逐字取自原对照，只有：

- 清单字段按 `flow.json` 的形状改写：`stub`、`hidden_tests`、`allowed_write` 放进每份材料的 `task`，目标测试放进独立文件由 `oracle.target_tests` 指过去。
- 简报框架里的 `{ROLE}` 取现行角色名 `developer`（原为 `application-developer`），框架正文没有改。
- `target`、`tags` 是新写的说明，不进简报。

## 量不出什么

- **完成声明是否属实。**原对照记录的 truthful_completion（最终消息有没有声称没跑过的验证、与判定矛盾的结论）程序判不了，
  要人对着 `oracle/oracle.json` 读 `final.md`。
- 副本里的 skills、文档与工具是钉住那个提交的版本，不是工作树的；只有角色定义取自当前的源。改了 skills 想量它的影响，这个流量不到。
- 三项都在同一个应用的同一层（CLI 的输入、解析、装配），不含存储、取消传播、恢复语义或跨包工作。
- AD-1 有一条目标测试（解析结果的原型须为 null）在原对照的四组八次运行里全挂，属规格没写明的实现细节；`target_pass` 在 AD-1 上很难到 1。
- 依赖目录是从模板硬链接来的：角色若改了 `node_modules` 里的文件，会连模板一起改。
- 隔离只靠「从仓库之外派发」与事后扫描工具输入，见运行器说明。
