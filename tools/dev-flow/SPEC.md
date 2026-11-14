# @omne-harness/dev-flow

## 总体架构

dev-flow 是开发流程工具，不发布。它由四部分组成：

| 部分 | 入口 | 做什么 |
| --- | --- | --- |
| 集成 | `src/integration/gate-cli.ts wait`、`src/integration/release-run-cli.ts`（根脚本 `pnpm run release-run`）、`src/integration/cli.ts contract-check` | 等待 gate 运行并代为确认，派发并跟踪一次工具包发行运行，在 `pnpm run check` 里核对契约快照与 `dist/` |
| 共用 | `src/shared/gh.ts`、`src/shared/input.ts` | 为集成命令运行 `gh`、判断 JSON 输入 |
| 公开导出核对 | `src/package-exports/cli.ts`（`omne-package-exports`） | 比较一个已构建成员的公开入口、机读导出清单与公开接口页 |
| 包模板 | `src/package-template/cli.ts`（根脚本 `pnpm package:template`）与 `templates/package/`、`templates/domain/` | 生成成员与组的草稿，扫描模板采用与完整结构 |

每个命令的参数与退出码见它的 `--help`。

## 领域边界

本成员拥有：

- gate 等待与代为确认的请求协议，发行运行的操作日志与恢复。
- 对钉住的 `omne-contract-api --check --json` 输出的判定：哪些状态让检查失败。
- 导出清单的形状与核对规则。
- 两份模板（`typescript-package`、`package-domain`）的当前版本、旧版本规则与扫描结果的形状。

本成员不拥有：

- gate 的派发、规则集与主干的发布：归 `github-gate` 分支的流程。什么时候可以代为确认、说明写什么：归 `omne-card` 技能的「进轨道」。
- 契约快照的生成与比较算法：归 repo-toolchain 的 `omne-contract-api`，见 [repo-toolchain 的契约 API 快照](../repo-toolchain/SPEC.md#契约-api-快照)。
- 组与组之间的依赖方向：归 `pnpm run lint:deps`，见 [repo-toolchain 的依赖方向](../repo-toolchain/SPEC.md#依赖方向)。
- 成员的公开接口、行为与接受：归各成员与它的包组规格。

消费者：

- 测试运行器的步骤表调 `contract-check`。
- 成员的测试以子进程运行 `package-exports`。
- `omne-card` 技能调 `gate-cli.ts wait` 与 `release-run`。
- 新建成员时调包模板。

## 心智模型

- 命令存在不授予项目 ref 或平台写权限。写平台的只有两处：`gate-cli.ts wait` 批准指定环境的待确认部署，`release-run` 在显式要求时批准 `npm-release`。
- 结果不知道就是不知道：发行运行没有精确的派发回执时保持 unknown，不照最新的一次运行去猜，也不重复派发。
- 模板扫描只证明结构。它不证明租户、事务、实际排空、恢复或形式性质，也不接受业务行为。

## 应然设计

### 交付配置

`parseConfig` 解析 `docs/engineering/github-delivery.json`，只读 gate 用到的字段：`schemaVersion` 为 3，`kind` 为 `github-delivery-config`，`repository` 为不含 `.` 或 `..` 段的 GitHub `owner/name`。其他字段不读。

### gate 等待

`gate-cli.ts wait` 等待一次 workflow 运行。

- 说明去掉首尾空白后，按 UTF-8 编码的字节数须在 1 到 1024 之间，否则在任何请求之前拒绝。按字节计数依据两次实测，不是 GitHub 文档的承诺：750 个字符、1220 字节的说明被拒，604 字节的说明被接受。
- `environments` 至少有一个环境名，缺省为 `publish`。仓库取交付配置的 `repository`，`--config` 可以指定另一份配置。
- 每轮先读运行。`status` 为 `completed` 时返回 `conclusion` 与每轮批准的环境 ID。否则读 `pending_deployments`，把 `current_user_can_approve` 为真且环境名在 `environments` 中的部署在一次 POST 中批准，评论为说明。
- 每轮按当时的待确认部署判断，不按此前批准过的环境 ID 跳过。然后等待一个间隔。到达时限时以 `unknown` 失败。
- 退出码：结论为 `success` 退出 0，其他结论退出 1，失败退出 2。选项重复、未知或缺值时，在读文件与发请求之前退出 2。
- 命令不判断当前身份是否获授权代为确认，也不派发 gate。

`gh` 命令经 `src/shared/gh.ts` 运行，标准输出按 JSON 解析。非零退出且标准输出为 JSON 时，错误带响应体，消息不含 API 输出。只有 GET 在传输失败、超时或 5xx 应答时重试，最多三次，间隔 0.5、1、2 秒。4xx 应答（含 429）、起不来的进程与其他命令不重试。

### 包发布运行

`release-run` 固定使用 `github-gate` 上的 `gate-release.yml`，支持 `repo-toolchain` 与 `repo-config` 两个包。

- 输入 JSON 先经 `strict-json.ts` 解析：重复键（含转义后相同的键）、超过 1 MiB 或嵌套超过 128 层时拒绝。再严格解析版本、仓库、UUID `operationId`、包名、完整提交号 `commit`、正整数 `issue`、布尔 `dryRun` 与完整提交号 `workflowHead`。输入被拒时，错误消息写出问题所在的路径，不写值。
- 派发前读取实际的 workflow ID 与 ref head，确认与输入一致。在一次 POST 之前持久保存意图。精确的派发回执绑定本次输入与运行。没有回执时返回 unknown，恢复不选择最新的运行，也不重复 POST。
- 每次观察核对同仓库、workflow ID 与路径、ref、head、`workflow_dispatch`、运行 ID 与 attempt 1，并读取精确的 attempt。重跑、身份变化、失败或取消都不能报告成功。观察超时只停止本地等待，远端运行可能继续。
- 相同输入与操作日志用于恢复。冲突的输入拒绝。日志不共用临时文件。
- 默认只观察。显式 `--approve --note <文件>` 才可能批准，且只处理 `npm-release`，要求平台的 `current_user_can_approve` 为真。审批前再次核对精确的运行，并先保存审批意图。结果不确定时不重发。实际的批准另行读回。GitHub 审批接口按运行定位，没有按 attempt 的比较并交换，工具不声明消除这个平台并发窗口。
- 退出码：精确的运行完成且 `conclusion` 为 `success` 退出 0，其他观察结果退出 1，输入或命令错误退出 2。输出包含操作身份、运行与 attempt 的链接、诊断与恢复状态。

### 契约快照核对

`contract-check` 让契约快照与 `dist/` 的不一致使 `pnpm run check` 失败。测试运行器的步骤表在构建与类型检查之后调用它。

- 它运行 dev-flow 依赖解析出的 `omne-contract-api --check --json --root <检出根>`，不运行工作区源码。超时 300 秒。
- 成员状态取钉住版本的六种：`match`、`differs`、`unreadable`、`missing`、`unbuilt`、`invalid`。`differs`、`unreadable`、`missing`、`invalid` 失败，每个成员一项，带成员、状态、说明与改法。`match` 通过。
- `unbuilt` 只报告：影响面计划没有选中的成员不构建。改了一个成员的快照或源码时，影响面选中它，它被构建并核对。本命令不核对没有 `dist/` 的成员是否真的没有变。
- `differs` 可能来自早于合并进来的快照的 `dist/`，所以改法先写重新构建。仍不一致时，公开面的改动是本卡要做的，就运行 `pnpm run contract:api --write` 并提交快照，否则改回声明。
- 标准输出是 JSON 报告：`typescript`、各状态的成员数 `counts`、`failures` 与 `unbuilt`。标准错误为每个失败的成员写一行 `contract-check: <状态> <成员>: <说明> 改法：<改法>`，最后写一行汇总。
- 退出码：没有失败的成员为 0，有为 1。找不到 `omne-contract-api`、进程出错或超时、退出码不为 0、输出形状不符时退出 2，错误以一行 JSON `{code, message}` 写到标准错误，标准输出为空。`cli.ts` 的其他子命令一律以 2 拒绝。
- `omne-contract-api --check` 对 `differs` 也退出 0，所以失败判断在本命令。

### 公开导出核对

清单缺省是成员的 `tests/fixtures/exports.json`，类型定义在 `src/package-exports/inventory.ts`。工具逐字段解码清单，未知字段与错误取值退出 2，不放宽比较。

- `entries` 的键等于 `package.json` 的 `exports` 子路径。每个入口按公开接口页的章节列出名字。
- `kind` 取 `type`、`value`、`class` 或 `both`。仅以 `export type` 重导出的值按 `type` 计。
- `sameAs` 表示本入口只重导出该名字，取值是本包的入口子路径或另一个包的模块说明符。工具核对两处是同一声明。
- `pending` 表示名字已在清单中而实现没有进入，`expectedPending` 必须等于标记数。
- `augmentations` 列出 `declare module` 增补。没有登记的增补也报告。

核对四件事：

1. 清单的入口集合等于 `package.json` 的导出子路径，章节不为空，同一入口内名字不重复。
2. 每个入口的构建导出恰好等于清单：没有缺失、没有未登记、种类一致、`sameAs` 指向同一声明。
3. 模块增补的成员恰好等于清单。
4. 公开接口页的每个清单章节链接声明这些名字的 `src/` 文件，页内代码块不再次声明清单里的名字，链接的文件存在。

公开入口的重导出链使用 `export type *` 时返回 `cannot-check` 并退出 2，不把这些名字误报为运行值。退出码：0 一致，1 有差异（每条一行，`--json` 时在 `report.problems`），2 无法核对。本工具只核对导出与导航，不判断行为与契约语义。

### 包模板

`templates/package/manifest.json` 是 `typescript-package` 唯一的当前版本源（4.0.0），并在 `previousVersions` 里精确保留 3.0.0、2.0.0 与 1.0.0 的必需文件、变体与完整布局。

创建：

- 默认预览，`--write` 才写。拒绝已有目标、软链接父目录与路径逃逸。先校验模板再写入，失败时只清理本次创建的文件与目录。不安装依赖、不运行包代码。
- 生成六个文件，绑定变体（`cordis-module`、`service-contract`、`service-provider`）另有 `src/cordis.ts` 与 `tests/cordis-entry.spec.ts`。不生成 Markdown，也不生成文档登记。
- 生成的 `package.json` 有先删除 `dist` 的 `build`、写在 `types` 前面的 `source` 条件、只发布 `dist` 的 `files`，以及 `test`、`test:fast`、`test:slow` 三个不构建的测试脚本。`tsconfig.build.json` 设 `erasableSyntaxOnly`。
- 草稿不写采用标识。`src/index.ts` 与 `src/cordis.ts` 带 `PACKAGE_TEMPLATE_DRAFT`，真实接口、已接受行为与有效验证完成后才删。不生成假 Service 或伪通过测试。

变体按实际责任选，不按目录名或一条抽取到的 provide 事实：

| 变体 | 职责 |
| --- | --- |
| `module` | 独立函数、类型与值的纯根，不加 Cordis 包装 |
| `cordis-module` | 纯根加集成 helper 或协调机制的绑定面 |
| `service-contract` | 纯公共定义与 `./cordis` 的 Service、唯一键与类型化事件 |
| `service-provider` | 独立工厂与 `./cordis` 的具体绑定，消费公共承诺而不复制它 |

私有 helper 不使协调包自动变成公开的 Service 提供者。目录名 `core` 不授予创建或扫描许可。

完整结构扫描：

- 成员发现先按 workspace 模式核对真实包目录与 manifest，再与源码成员清单对账。缺失或异常的 manifest、目录软链接或非目录节点使扫描退出 2，不把漏掉成员的空清单报告成通过。`docs` 是保留名，不能作成员。
- 结构判定遍历成员的全部文件、目录、空目录与节点种类，与 manifest 声明的变体布局核对完整节点集合。未声明路径、错位文件、空目录、软链接与其他节点都失败。Git ignore 不能隐藏源码文件。
- 只排除成员根下真实的 `node_modules`、`dist`、`generated`、`coverage`、`tmp`、`.turbo` 目录，并输出排除清单。同名文件或软链接不跳过，嵌套目录没有这项豁免。
- 4.0.0 只允许成员根的可选 `README.md`、`UPSTREAM.md` 与 `api/*.api.md` 这几份 Markdown。
- 验收配置跟随可执行场景：`acceptance/` 下（不含 `acceptance/fixtures/`）有 `*.acceptance.ts` 时，必须有 `vitest.acceptance.config.ts` 与 `acceptance` 脚本。有配置时必须有场景。违反时报 `acceptance`。
- 同时核对 ESM、导出源与条件、产物、发布、脚本与草稿占位。
- 集成结果另列：`deviation`、`unknown` 或 `static-pass`。事实来自现有的架构抽取器，覆盖限制保持明示。已知偏离禁止采用。`unknown` 须人工核对适用性与证据，不自动放行。

依赖诊断：`scan --json` 的每个成员的 `dependencies` 列出已判断的边，每行至少有 `rule`、`state`、`member`、`targetMember` 与 `sites`。

- 类型导入没有声明依赖时，`rule` 是 `undeclared-dependency`，`state` 是 `deviation`，`reason` 是「源码引用 workspace 包但未在 dependencies、peerDependencies 或 devDependencies 声明」。
- 经 `./cordis` 子路径与相对导入形成的环，`rule` 是 `member-cycle`，`state` 是 `deviation`，`reason` 以「成员之间成环」起头。
- 这两个规则名不是 `RuleId`，不出现在 `constraints.json` 里。`unknown` 保持 `unknown`。

标识与退出码：

- 完整结构与适用的集成责任都核对完之后，才在 `package.json` 写 `omneHarness.packageTemplate` 的 `id`、`version`、`variant`。扫描只读，不自动采用或升级。
- 扫描分别报告标识 `current`、`older`、`unmarked`、`invalid`、`unknown`，完整结构 `pass`、`fail`、`uncovered`，与集成结果。
- 普通盘点在报告完成后退出 0，含否定的结果。`--check` 的 0 表示当前标识、完整结构通过且没有已知的静态集成偏离。缺标识、旧版、结构失败或偏离退出 1。没有精确规则或输入错误退出 2。`unknown` 不让退出码变成 1，也不算通过。

版本规则：

- 已发布的模板义务变化时才改版本。已有成员保持已采用的版本，直到完整迁移核对通过。标着旧版本的成员按它自己版本的规则扫描，不自动增加新义务。
- 未知身份与未来版本不能用当前规则认证。缺精确规则时报 `uncovered`。
- 规则集：1.0.0 与 2.0.0 是 2（`acceptance/` 与 `vitest.acceptance.config.ts` 互相要求，2.0.0 另要求 `documentation.json`），3.0.0 是 3（完整文档骨架、专题二选一、按场景的验收配置），4.0.0 是 4（去掉文档骨架、专题与登记，保留验收规则）。

### 组模板

`templates/domain/manifest.json` 是 `package-domain` 的当前版本源（2.0.0）。

- `create-domain --group <名称>` 默认预览，`--write` 才写。写出的树只有 `SPEC.md`：一级标题是组名，一行 `DOMAIN_TEMPLATE_DRAFT`，六个二级标题依次是总体架构、领域边界、心智模型、应然设计、原则与约束、不变式，每节一行说明。不创建成员、源码、空专题或采用标识。
- 2.0.0 要求 `SPEC.md`，组根只允许 `SPEC.md`、`AGENTS.md` 与 `CLAUDE.md`。组里的成员交给成员自己的扫描。还含 `DOMAIN_TEMPLATE_DRAFT` 的 `SPEC.md` 报草稿占位。
- 组根有 `README.md`、`README_ZH.md` 或 `documentation.json` 的组按 `previousVersions` 里的 1.0.0 规则扫描。
- 不带选择器的扫描同时列组的读数，退出码仍按成员的规则。显式 `--group` 配合 `--check` 才断言组结构，与 `--member` 互斥。组的结果不认证组的采用。

## 原则与约束

- 工具不构造候选，不验证或发布候选。四条主干的进入由 `github-gate` 的流程发布。
- 说明长度按字节核，在任何请求之前核。
- 平台读失败只对 GET 重试。写请求不重试，结果不确定时保持不确定。
- 模板只提供草稿与诊断，不实现后续产品。应用不用本模板，CLI 放在 `apps/`。
- 不用手写结构或伪造采用标识绕过扫描。

## 不变式

- 说明超过 1024 字节时，`gate-cli.ts wait` 不发出任何请求。
- `release-run` 对同一份输入至多派发一次。
- `release-run` 只批准 `npm-release`，且只在给了 `--approve` 时。
- `contract-check` 在 `differs`、`unreadable`、`missing`、`invalid` 任一出现时不以 0 退出。
- 草稿不带采用标识。
- `--check` 不把 `unknown` 当成通过。
