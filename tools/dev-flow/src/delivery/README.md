# 观察 GitHub 交付结构

检查器生成偏离、unknown、uncovered 与属性发现报告。报告帮助负责人定位下一项核对，不授予 Ready、认领或接受权限。公开行为及限制归[SPEC](SPEC.md)。

## 从离线采集读取

在仓库根运行以下命令。配置须为`github-delivery-config@2`、协议2，采集须为`github-delivery-capture@1`、协议2，包含原始正文和各层完整性。输出报告为`github-delivery-report@5`、协议2。TaskBinding 接受版本1与版本2。旧配置、协议1采集与版本1/2/3/4报告输入退出2，不转换。

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/cli.ts \
  --config docs/engineering/github-delivery.json \
  --capture tmp/<task>/capture.json \
  --report tmp/<task>/delivery-report.json
```

再次观察时，用 `--baseline tmp/<task>/previous-report.json` 比较。同仓库、Project与口径才能比较。读取不全时，工具不会把未读到的旧项计为已解决。

属性发现使用本检出中的 `docs/engineering/delivery-lines.json` 与 `docs/engineering/integration-policy.json`。用 `--lines <file>` 与 `--registry <file>` 指定其他文件。这两个文件读不到或不合格时退出2。

## 显式读取 GitHub

先在交互环境配置 `gh` 的仓库与 Projects 读取权限。工具不读取或打印 token。

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/cli.ts \
  --config docs/engineering/github-delivery.json \
  --live \
  --save-capture tmp/<task>/capture.json \
  --report tmp/<task>/delivery-report.json
```

输出父目录须已存在。采集与报告可能含私有项目内容，应留在获准任务目录。工具仅查询配置仓库，不执行正文引用的命令或查询其他仓库。

## 任务准入读取

integration 的 `start`、`register` 使用专用准入采集。它只读取任务依赖闭包、授权卡完整评论及目标任务的 Project 状态。最多 32 个 Issue、8 个边层级，独立授权卡计入总数。必需读取不完整时拒绝准入。Stage 字段已确认且完整读取后未设值时，Stage 为 `null`。

`start` 与 `register` 另要求卡有唯一的 `kind:` 标签、唯一的 `line:` 标签与里程碑，缺任一项时拒绝并逐项列出缺项。判断由 [protocol.ts](protocol.ts) 的 `dispatchFieldGaps` 给出，派发命令用同一判断。新建 context 时，属性发现也拒绝开工，见下文。

上述 `--live` 全库观察命令及报告范围不变。专用采集不用于离线报告、baseline 或发布检查。详细边界归 [SPEC](SPEC.md#任务准入采集)。

## 阅读结果

先看 `completeness` 和采集错误，再看 `stock`、`cards` 与 `findings`。`declaredDecisions` 是评论声明。`acceptance:unknown` 表示有权者仍需核对权限、结果范围和撤销链。

`graph.cycles` 给出已知阶段等待环。空数组只表示已读子图未发现环。`delta.notComparable` 表示口径改变或读取不足，不能计为改善。

正常观察退出0。错误输入退出2。偏离不自动阻断交付。`enabled:false` 可以预备读取，但不能派发日常任务。正式配置保持未启用。长期产品与场景由[产品模块](../../../repo-toolchain/src/product/SPEC.md)独立发现；普通任务沿共同交付协议独立维护本次身份、范围和结果。平台启用、默认分支模板和实际宿主执行仍未由离线检查覆盖。

## 预准入命令

在仓库根运行：

```sh
pnpm run pre-admission --worktree /absolute/worktree --journal /absolute/task/pre-admission
```

此入口迁移 `pre-admission.sh`。包内同名 script 与构建后的 `omne-pre-admission` 提供同一行为。省略 `--worktree` 时使用当前目录。每次运行生成新的 operation ID，也可用 `--operation-id UUID` 指定未使用的 ID；重复 ID 拒绝，防止覆盖证据。

命令依次执行接受锁、affected build、declarations、contract-api、lines、docs、design、deps、rules、oxlint 和 format。任一步失败即停止并返回该步退出码。标准输出包含已执行步骤、各步日志路径和失败日志末 20 行。详细顺序与绑定分支行为见 [SPEC](SPEC.md#预准入执行)。

## 属性发现

报告的 `attribute` 类别列出开放交付卡的属性发现。属性规则归[交付协议](../../../../docs/engineering/delivery.md#卡属性与合法组合)，线与轨道归[多层分支集成](../../../../docs/engineering/integration.md#交付线)。观察报告中的属性发现只报告，不计入 `deviation`。`stock.attribute` 是这一类的数量。

`start` 新建 context 与派发命令按 [attributes.ts](attributes.ts) 的 `attributeRefusals` 拒绝。它拒绝全部代码，有两个例外只报告：条款为 `binding.milestone` 的 `attribute-binding-drift`（carry 之后的预期状态），以及正文交付线为 `integration` 时的 `binding-v1`。每个代码的改法在 `ATTRIBUTE_REMEDIES` 中，拒绝消息逐项写出。已有同绑定的 context 时重跑 `start` 只报告。精确条款见[集成工具规格](../integration/SPEC.md#授权与开工)的 I16。

| 代码                      | 意义                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `attribute-missing`       | 「身份与责任」缺少交付线、性质或契约变更，或仍是占位。Issue 没有 milestone 时条款为 `milestone`          |
| `attribute-invalid`       | 属性取值不在允许值中，字段重复，组合不合法（条款以「合法组合:」开头），或 binding 的交付线不在线归属表中 |
| `attribute-binding-drift` | 版本2 binding 的属性与正文不同，或 binding 记录的里程碑与 Issue 现在的 milestone 不同                    |
| `nature-route-mismatch`   | route 的轨道不是本卡应进入的轨道，或 `integration` 卡的 route 不符合跨线写入的规则                       |
| `scope-outside-line`      | 线内的卡写其他线的路径，`contract` 卡写契约成员以外的路径，或 `baseline` 卡有仓库写范围                  |
| `scope-integration-path`  | 线内的卡写联调轨道拥有的路径，包括表中没有列出的路径                                                     |
| `condition-cross-line`    | 线内的卡的交付条件引用其他线的卡，或 `baseline` 卡的「交付条件」不是「无」                               |
| `label-drift`             | `line:`、`nature:` 或 `contract:` 标签与正文属性不同                                                     |
| `binding-v1`              | binding 为版本1，不含属性                                                                                |

正文的属性是判断的依据。route 与写范围的发现需要 binding。写范围中的 `tmp` 与线归属表的 `shared` 路径不计入归属。`integration` 卡不检查写范围归属。

## 线归属表校验

`pnpm run check:lines` 校验 `docs/engineering/delivery-lines.json`：线 ID 唯一且不为 `integration`，路径归属不重叠，每个工作区成员恰好属于一条线或 `integration.paths`，契约成员是本线路径下的工作区成员，线轨道已在 registry 登记、状态为 active 或 paused、上游是联调轨道。每处错误输出一行，带表中的 JSON 路径。有错误时退出1，输入读不到时退出2。`scripts/check.sh` 每次运行它。

## 标签同步

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/labels-cli.ts --issue <N> [--apply]
```

命令经 `gh api` 读一张卡，从正文的主工作类型及三个属性计算 `kind:`、`line:`、`nature:`、`contract:` 四族标签，向标准输出写增删差异。主工作类型须唯一且属于六类采用范围。契约变更为 `none` 时目标中没有 `contract:` 标签。不读 Project。

加 `--apply` 时只增删这四族标签，其他标签不变。然后命令再读一次卡，核对标签和正文推导出的目标集合均未漂移，结果写在 `readback` 与 `verified` 中。

- 正文主工作类型或属性缺失、重复或不合格时退出2，不改标签。
- 某次写入失败时退出2，消息给出失败的是第几次写入。之前的写入已生效，重试前先再读一次卡。
- 读回与目标不同时退出1。

`--config` 与 `--lines` 指定交付配置与线归属表，缺省为本检出中的文件。

## 写范围求交

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/scope-cli.ts <卡号、binding 文件或读集文件>...
```

命令读取每张卡的 binding 的 `writeScope`，两两求交，只读，不写平台。参数是纯数字或 `#` 加数字时按卡号经 `gh api` 读 Issue 正文中唯一的 binding 区块，其他参数按文件读。文件可以是一个 binding JSON 对象，也可以是只含一个 binding 区块的文本，例如保存下来的 Issue 正文。派发前还没有写进 Issue 的 binding 用文件传入。

- 两项写范围相同，或一项是另一项下面的路径，即为交集。`tools/dev` 与 `tools/dev-flow` 不相交。
- `tmp` 下的路径与线归属表 `shared` 中的路径不计入，规则与属性发现相同。
- 已关闭的卡不再写入，默认不参与求交，卡号列在 `excluded`。加 `--include-closed` 时关闭的卡也参与。文件参数没有 Issue 状态，总是参与。
- 标准输出是 JSON：每张卡计入与不计入的路径、`excluded`，以及冲突对 `conflicts`。每个冲突对另向标准错误写一行。
- 没有交集退出0，有交集退出1。卡没有 binding、文件不合格、同一张卡给了两次、读不到 GitHub 时退出2。

命令同时检查读写交叉：一张卡要写的路径落在另一张卡的读集里。卡的读集是它计入的写范围所在的 workspace 成员，加上这些成员按 `package.json` 声明的 `workspace:` 依赖传递到的成员，再加上读集文件列出的正文页。写范围路径不在任何成员下时不贡献成员。读集文件与 binding 文件一样按位置参数传入：

```json
{ "source": "#794", "reads": ["docs/engineering/integration.md"] }
```

- 含 `reads` 字段的 JSON 对象按读集文件读，其他文件按 binding 文件读。`source` 是同一次参数里的卡号（`#` 加数字）或 binding 文件路径，路径按当前目录解析后比较。`reads` 是仓库相对路径，可以为空。
- 每对不同的卡两个方向各比较一次，路径比较规则与写范围求交相同。同一张卡的写与读不比较。
- 每个读写交叉按写路径与读路径中较长的那条分类。规则表是 [read-set.ts](read-set.ts) 的 `FROZEN_READ_PATHS` 与 `REGISTERED_READ_PATTERNS`：

  | 类 | 路径 | 标准错误的行首 | JSON 字段 |
  | --- | --- | --- | --- |
  | 工程方法与验证正文 | 同时满足三项的文件：在 `.meta_harness/agents`、`docs/engineering`、`docs/development.md`、`docs/verification.md`、`tools`、`scripts` 上或下面；以 `.md` 结尾，或匹配 `.meta_harness/agents/skills/*/adapters/**/strategy.yaml`；不匹配 `tools/test-runner/test-runs.config.json` 中读者规则的 `paths` 与 `globalPaths` 的任何模式 | `read-overlap-frozen:` | `frozenReadConflicts` |
  | 产品语义正文 | 其他全部文件，包括 `tools`、`scripts` 下的源码与配置，以及被登记为代码读取的 `.md` 文件 | `read-overlap:` | `readConflicts` |

  较长的路径在 `HEAD` 上有被跟踪的文件在它下面时，它是目录，命令逐个判定这些文件。全部是第一类时交叉才是第一类，否则按第一个不是的文件归第二类。`HEAD` 上没有这个路径时，按路径本身判定。`affected.pythonPaths` 不算登记。

  登记的模式用 `node:path` 的 `matchesGlob` 匹配。匹配前，路径与模式中每段开头的 `.` 都换成同一个其他字符，所以 `*` 与 `**` 也匹配以 `.` 开头的段，与 test-runner 的匹配相同。其余语义仍可能不同：test-runner 把 `?`、`[`、`]`、`{`、`}` 当作普通字符，`matchesGlob` 把它们当作通配语法。现在的配置不含这些字符。这种不同会让登记过的 `.md` 被判为第一类，所以 dev-flow 与 test-runner 应当共用一个导出的匹配函数。这是尚未完成的剩余责任。规则与处置见[读写交叉的两类](../../../../docs/engineering/integration.md#读写交叉的两类)。
- 标准输出的 JSON 另有 `readSets`（每张卡的 `members` 与 `pages`）、`readBasis`、`readConflicts` 与 `frozenReadConflicts`。`readBasis` 写明分类所用的基础：`{ "commit": <HEAD 的提交号> }`，读不到时为 `{ "unknown": <原因> }`，没有读写交叉、不需要分类时为 `null`。`readConflicts` 的项另有 `reason`，写明停止的原因，知道是哪个文件时还有 `file`。每个读写交叉另向标准错误写一行 `<行首> <写方> <写路径> -> <读方> <读路径>`，`read-overlap` 行在末尾加 ` (<reason>)`。先写全部 `read-overlap` 行，再写全部 `read-overlap-frozen` 行。
- 写交集或产品语义读写交叉任一存在时退出1。只有工程方法与验证正文的读写交叉时退出0。命令读不到 `HEAD` 上的配置或文件清单时，每个读写交叉都归产品语义，`reason` 写明读不到的原因。读集文件的 `source` 不对应任何卡参数、同一张卡给了两份读集文件时退出2。

调度者在登记 attempt 前运行这个检查：

- 调度者从任务信息包引用的正文页整理每张卡的读集文件，与卡号或 binding 文件一起传入。读集用独立的 JSON 文件，不写进 binding，因为 binding 的字段集是严格的，增加字段要改 `parseTaskBinding` 与 `start`。
- 命令读运行它的检出的工作树来取成员清单与依赖，读这个检出的 `HEAD` 来取分类用的配置与文件清单。在收口点的检出上运行时，分类的基础就是收口点。命令不读 binding 中的 `taskBase`，也不核对 `HEAD` 是否等于它。线内的卡的 taskBase 可以是批次分支头，与收口点不同。所以调度者用 `readBasis.commit` 核对分类所用的提交。成员闭包只按 `package.json` 声明的 `workspace:` 依赖求，不做源码级 import 分析。
- 同一条线顺序推进的几张卡，把写范围之并与读集之并作为一张卡传入，与写范围求交的做法相同。
- 两条线写同一成员中不同的文件时，双方都读这个成员，所以总是报读写交叉。一方写的是 `tools`、`scripts` 下成员中没有登记的 `.md` 说明页时，这个方向的交叉归工程方法与验证正文。其他文件按 `WS(a) ∩ RS(b) = ∅` 判，这两张卡不能在同一波，调度者改分解。

`--config` 与 `--lines` 指定交付配置与线归属表，缺省为本检出中的文件。经 `pnpm --filter @omne-harness/dev-flow run scope-overlap` 运行时，文件参数相对 `tools/dev-flow` 解析。

## 改动的写范围与线归属

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/change-scope-cli.ts [--root PATH] [--lines FILE]
```

命令核对本卡实际改动的文件，只读。`pnpm run check` 每次都运行它，见[自动化入口](../../../../scripts/README.md)。

1. 命令读工作树的 task context。没有 context 时，标准输出写 `{"bound": false, …}`，标准错误写「未绑定」，退出0。
2. 本卡的改动从 binding 的 `taskBase` 算起，沿 HEAD 的第一父提交链逐个提交计算：
   - 只有一个父提交的提交，取它改动的全部文件。改名算作删除旧路径与新增新路径。
   - 合并提交取 `git diff-tree --cc` 列出的文件，即与每个父提交都不同的文件：冲突的解决、合并时另加的改动，以及两侧都改过的文件（没有冲突也算）。
   - 合并带进来的提交（其他父提交可达、第一父提交不可达的提交）中，在本卡以外的远端跟踪分支上的不计入：目标分支、批次分支与别的卡来自远端。其余按上面两条逐个计入，例如本卡的本地侧分支。
   - 再加上工作树中与 HEAD 不同的已跟踪文件，以及 Git 不忽略的未跟踪文件。
   - 不用 context 的 `targetBase`。它是远端目标分支头，可以早于批次头。
3. `tmp` 下的路径与线归属表 `shared` 中的路径不计入。其余每个文件：
   - 不在 binding 的 `writeScope` 任一项之下时，为 `change-outside-scope`。
   - binding 为版本2、交付线不是 `integration` 时，文件归属于别的线或联调轨道为 `change-outside-line`。归属按 [lines.ts](lines.ts) 的 `scopeOwners` 判断。交付线为 `integration` 的卡与版本1的 binding 不做这一项：版本1的 binding 没有交付线字段。
4. 线归属表取 `taskBase` 提交中的 `docs/engineering/delivery-lines.json`，即派发时的表，本卡对表的修改不改变结果。`--lines` 指定另一个表文件。
5. 契约核对只看本卡改了 `api` 目录的契约成员，契约成员取上一项的表与工作树中的表。没有这样的成员时不运行 `omne-contract-api`。有时运行钉住的 `omne-contract-api --diff <taskBase> --json`，比较 `taskBase` 上的快照与工作树的快照：
   - 差异为 additive 而 binding 的契约变更为 `none`，或差异为 review 而契约变更不是 `breaking`，为 `contract-exceeds-declared`。改法：撤回改动；或请调度者升卡的修订、改契约变更并重新派发；线内的卡需要破坏性改动时按[交付协议](../../../../docs/engineering/delivery.md#契约变更与里程碑类型)停下交裁定。
   - 成员的快照差异读不出时为 `contract-change-unknown`。
   - 合并进来的别的卡对其他成员的快照变化不计入。
   - 版本1的 binding 没有契约变更字段，只在 `contract` 中列出成员，不核对。

标准输出是 JSON：`issue`、`attempt`、`taskBase`、`head`、本卡改动的文件 `files`、契约核对 `contract`，以及 `findings`。`contract.kind` 为 `not-needed`、`skipped` 或 `checked`。文件发现有 `code`、`file`、`message` 与 `remedy`，契约发现有 `code`、`member`、`change`、`declared`、`message` 与 `remedy`。每项发现向标准错误写一行。没有发现退出0，有发现退出1。参数错误、context 不属于本工作树、`taskBase` 不是 HEAD 的祖先、读不到线归属表，或 `omne-contract-api` 运行失败时退出2。

下图是一张卡的提交图。`B` 是 taskBase，`o/target` 是目标分支的远端跟踪分支，别的卡的提交经它进入。

```text
  o/target:    B ── T1 ── T2
                            \
  本卡:        B ── C1 ── C2 ── M1 ── C3 ── M2    + 未提交改动
                     \                     /
  本地侧分支:          S1 ─────────────────
```

- 计入：第一父链上的 `C1`、`C2`、`C3`；`M1`、`M2` 与每个父提交都不同的文件；`M2` 带进来的 `S1`，它不在别的远端跟踪分支上；未提交改动。
- 不计入：`M1` 带进来的 `T1`、`T2`，它们在 `o/target` 上。

下列做法把别人的提交算成本卡的改动，检查因此失败。改法写在每项后面：

- 快进同步：卡还没有提交时，`git merge` 默认快进，目标分支的提交成为第一父链。改用 `git merge --no-ff`。
- rebase 同步：目标分支的提交成为第一父链。改用 `git merge --no-ff`。已经 rebase 的分支，从 taskBase 新建分支并 cherry-pick 本卡的提交。
- 合并只在本地的别的分支：它的提交不在远端跟踪分支上，按本卡的提交计入。先 `git fetch`，再合并远端跟踪分支。
- 两侧都改过同一文件的合并：没有冲突时 `--cc` 也列出这个文件。这个文件不在写范围内时，请调度者扩大写范围，或在合并前与那张卡的负责人协调。

## 契约基线的读取

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/baseline-cli.ts read <baseline 卡号> --out <文件> [--config <文件>]
```

命令读 baseline 卡的全部评论，找出登记者发的 `json omne-contract-baseline:v1` 区块，按评论时间合并，把合并后的区块写到 `--out`。`omne-contract-api --baseline <文件>` 读这个文件，核对里程碑内的累计变化。登记规则见[里程碑内的规则](../../../../docs/engineering/integration.md#里程碑内的规则)。命令只发 GET 请求，不写评论。

1. 登记者是 publish 环境的审批者：User 审批者的 login 与 node ID 都要相同，Team 审批者看 active 成员关系。别人发的区块不读，不改基线，也不加 `breakingCards`。标准错误为每条这样的评论写一行 `baseline: ignored`，JSON 的 `ignored` 列出它们。
2. 评论按创建时间从旧到新处理，同一时间按评论 ID。同一成员取最晚的区块。较晚的区块可以只写受影响的成员，也可以写基线之后加入的成员。
3. `breakingCards` 取各区块的并集。
4. 下列情况拒绝，不写文件，退出1。标准错误逐项写代码、评论与说明：
   - `baseline-missing`：卡上没有登记者发的区块。
   - `baseline-duplicate`：一条评论有两个以上区块。
   - `baseline-invalid`：区块没有结束的围栏、不是 JSON，或键与格式不合格。
   - `baseline-milestone-mismatch`：区块的 `milestone` 与最早的区块不同。用 `--baseline-write` 加 `--milestone` 重新生成。
5. 参数、交付配置或 GitHub 读取错误时退出2。有区块时命令要读 publish 环境；云端会话的代理不放行这个读取，所以在本地会话运行。

区块格式归 repo-toolchain 的 `omne-contract-api`。dev-flow 依赖的版本不导出这个格式的解析，所以本命令自带一份同形状的校验。精确条款见 [SPEC](SPEC.md#契约基线的读取)。

## 里程碑命令

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/milestone-cli.ts create <名称> --due <YYYY-MM-DD> [--description <文字>]
node --experimental-strip-types tools/dev-flow/src/delivery/milestone-cli.ts carry --from <A> --to <B> --reason <原因> <卡号>...
```

`create` 经 `gh api` 建一个开放的里程碑。截止日按 UTC 正午提交，所以 UTC-11 到 UTC+11 的时区看到的日期相同。命令读回截止日，与 `--due` 不同时退出1。同名里程碑已存在且截止日相同时直接返回，不写入。同名而截止日不同时退出2，命令不改已有里程碑的截止日。

`create` 不建 Project 视图。输出的 `manualSteps` 列出在网页上为新里程碑建 Board 视图的步骤：过滤为 `milestone:"<名称>"`，列字段选 Status，泳道选 Line。

`carry` 把每张卡从里程碑 A 移到 B，并在每张卡上发一条流转评论。评论第一行是 `<!-- omne-milestone-carry:v1 {"from":"A","to":"B"} -->`，然后写流转的两个里程碑、`--reason` 的原因，以及 binding 不变的说明。卡本来就在 B 时，评论写明本卡已在 B、本次运行未移动。补跑时会出现这种评论：上一次运行改里程碑（PATCH）成功、发评论失败，重跑只补发评论。只有第一行是这个标记的评论才算流转评论。选项的值不能以 `--` 开头。命令不改 binding，也不升交付修订。

- 第一次写入前读全部卡。有卡不在 A 也不在 B、是 PR、或 A 与 B 有一个不存在时退出2，不写入。
- 卡已在 B 时不再改里程碑。卡上已有同一 A 到 B 的流转评论时不再发。所以写入中途失败后，原样重跑同一命令即可补完。
- 某次写入失败时退出2，消息给出失败的是第几次写入，之前的写入保留。
- 写入后再读每张卡的里程碑，结果写在 `readback` 与 `verified` 中。有卡读回不是 B 时退出1。

版本2的 binding 记录派发时的里程碑。carry 之后，属性发现报告 `attribute-binding-drift`，流转评论说明原因。这条发现只报告，不拒绝 `start`。

## 看板字段写入

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/board-cli.ts <dispatched|delivered|integrating|accepted> --issue <N> [--date <YYYY-MM-DD>] [--dry-run]
```

命令在一张卡的 Project 条目上写一个事件的字段，再读回核对。字段 ID、选项 ID 与看板设置都只登记在[交付配置](../../../../docs/engineering/github-delivery.json)：`project.fields` 的看板字段、`project.options` 的 Stage 与 Line 选项，以及 `board` 项的时区与各事件启用的写入。代码只读键名。

| 事件          | 写入的字段                                    | 谁在何时运行                                                             |
| ------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| `dispatched`  | Dispatched at、Line、Kind、Wave               | `start` 新建 context 后自动写入。自动写入失败时调度者补写                |
| `delivered`   | Delivered at，Status 改为 In review           | 调度者在执行者交回候选 PR 时                                             |
| `integrating` | Status 改为 Integrating                       | 候选通过准入、经 gate 进入轨道时，在合入之前。一波并行的卡由集成节点运行 |
| `accepted`    | Accepted at、Cycle days，Status 改为 Accepted | 调度者在接受决定读回后                                                   |

- 日期缺省为运行时刻在 `board.timeZone` 时区中的日期，现为 UTC。`--date` 用于补写。
- Line 取版本2 binding 的交付线，没有时取正文「身份与责任」的交付线。Line 没有对应的选项时跳过这一项，写在 `skipped` 中。
- Kind 取卡上唯一的 `kind:` 标签。卡没有或有多个 `kind:` 标签、或 Kind 没有对应的选项时跳过。
- Wave 记录卡所属的波。交付配置的 `fields.iteration` 是这个字段，它在 Project 中是迭代类型，调度者在派发前把本波的迭代起止配成覆盖本波的派发时间。命令先读该字段的迭代表，取起止范围包含写入日期的迭代；几个迭代都包含这一天时取配置顺序中的第一个。没有这样的迭代时跳过，不猜测。Wave 与 Dispatched at 一样，已有值时不覆盖，所以同一张卡的新 attempt 不改 Wave。
- Dispatched at 已有值时不覆盖，这一项写在 `skipped` 中。同一 attempt 在新工作树重跑 `start` 不改开工日期。
- Cycle days 是 Accepted at 减 Dispatched at 的天数。Dispatched at 为空、不是合法日期或晚于接受日时跳过。
- `board.events` 列出每个事件启用的写入。从列表删掉一项即关闭它。删掉整个 `board` 项即关闭全部看板写入，`start` 也不再写。
- 运行一个没有启用写入的事件（或没有 `board` 项）时，命令不读平台，退出2。
- 每个字段一次 `updateProjectV2ItemFieldValue` 请求。某次写入失败时退出2，消息给出失败的序号，标准错误的 JSON 同时带 `skipped`，之前的写入保留。读回与写入值不同时退出1。
- `--dry-run` 读条目并输出计划写入，不写。输出的 `applied` 为 false，没有 `verified`，退出0。
- 卡不在配置的 Project 中时退出2。命令不把卡加入 Project。
- 云端会话的代理拦截 GraphQL，命令在云端直接退出2。云端的判断与 `start` 相同：`OMNE_DELIVERY_FACTS=workflow`，或没有设置它而 `CCR_AGENT_PROXY_ENABLED=1`。云端改 Stage 用 `delivery-stage`，日期字段留待本地会话补写。

`gh` 需要 Projects 的读写权限（`gh auth refresh -s project`）。Status 是 Stage 字段，只由本卡的调度者写入，规则见[交付操作](../../../../docs/engineering/agent-delivery.md#4-推进和更新状态)。命令不判断接受是否有效。

## 派发命令

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/dispatch-cli.ts post --spec <spec.json> --text <prose.md> [--out <binding.json>] [--root <检出>] [--dry-run] [--force]
node --experimental-strip-types tools/dev-flow/src/delivery/dispatch-cli.ts bind --binding <binding.json> [--worktree <路径>] [--dry-run]
```

调度者用这两个命令派发一张卡的一个 attempt。`post` 发派发评论，`bind` 把 binding 写进卡的正文。两步之间不改卡。

`post` 在任何平台调用之前拒绝空或只含空白的 `--text`，退出2。

`spec.json` 只写调度者的决定，字段全部必填，多余字段拒绝：

| 字段                                                                                      | 内容                                                                       |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `issue`                                                                                   | 卡号                                                                       |
| `attempt`、`responsible`、`branch`、`taskBase`、`writeScope`、`route`、`completionTarget` | binding 的同名字段                                                         |
| `basis`                                                                                   | 授权依据 URL，写进评论的 `basis` 与 binding 的 `authorization`             |
| `confirmations`                                                                           | 每个 start 条件一项：`{"condition": "<条件ID>", "evidence": "<确认依据>"}` |

交付修订、交付线、性质、契约变更、里程碑与条件 ID 由命令从卡上读取，不由 spec 给出。每个 start 条件的摘要由命令按卡上现行的条件行计算。所以条件行改过之后重跑 `post`，摘要随之更新。

`post` 在写平台之前完成下列核对，任一不满足时退出2，不写入：

1. 在 `--root` 检出（缺省为当前目录）中读 taskBase 提交里的 policy、交付配置与线归属表。这些就是 `start` 将读的文件。taskBase 须已在本地，否则先 fetch。taskBase 的 dev-flow 不能读版本2 binding 时拒绝。
2. `gh api user` 的登录名须等于 `responsible`，因为 `start` 要求派发评论的作者等于 `responsible`。
3. 卡须开放，有唯一的 `kind:` 标签、唯一的 `line:` 标签与里程碑，与 `start` 的拒绝条件相同。
4. 卡的准入采集没有协议偏离。采集与 `start` 相同，也确认卡在配置的 Project 中。
5. 正文属性与交付修订合格。每个 start 条件都有 `confirmations` 一项，`confirmations` 不引用卡上没有的条件。
6. 卡上没有派发同一修订与 attempt 的评论。有时拒绝并给出那条评论，避免重跑时重复派发；确需重发时加 `--force`。
7. 拟写的 binding 没有 `attributeRefusals` 选出的属性发现，规则与 `start` 相同：路线、写范围归属、跨线条件与 `line:`、`nature:`、`contract:` 标签都与正文一致。标签不一致时先用标签同步命令改正。

核对通过后，`post` 先发一条占位评论，再把它改成正式派发评论。正式评论是 `--text` 的文字加上 `omne-integration-authority:v1` 区块，区块中 binding 的 `dispatch` 是这条评论自己的 URL。改写成功后，命令先向标准错误写一行 `{"kind":"dispatch-posted","dispatch":…}`，再按 `--out` 把 binding 写进文件，供 `bind` 使用；写文件失败时退出2，消息给出派发评论 URL。然后读回评论。读回与写入不同时退出1。读回失败时退出2，消息给出已发的派发评论 URL，不要再派发一次。改写占位评论失败时，错误消息给出占位评论的 URL。调度者改写或删除它，再重新派发，命令不重试。`--dry-run` 完成全部核对，输出拟写的 binding 与评论正文，`dispatch` 为占位 URL，不写平台。

`bind` 读卡，把「分支、基线与task context」小节整体换成一行派发说明与 binding 区块。说明中的 revision、attempt 与 taskBase 取自 binding，不手写。只在「认领与派发」小节内，「派发情况」一行改为指向派发评论，给出 `--worktree` 时「工作树」一行改为该路径；其他位置的同名行不改。binding 的 `dispatch` 仍是占位 URL、正文没有唯一的这一小节、或新正文的唯一 binding 读回与输入不同时退出2，不写入。写入后命令再读一次卡核对 binding，结果写在 `verified` 中，不符时退出1。`--dry-run` 输出新正文，不写入。`bind` 只写版本2 binding。

## 事件等待

线会话与集成节点用这组命令阻塞在 GitHub 事件上。命令不轮询 API。

频道模式适用于多机。每台机器使用独立频道与 hook，并显式指定业务仓库和事件文件。先初始化，再用宿主的 shell 工具把 serve 作为后台进程启动。

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/events-receiver-cli.ts init --repo <owner/name> --file <事件文件>
node --experimental-strip-types tools/dev-flow/src/delivery/events-receiver-cli.ts serve --repo <owner/name> --file <事件文件>
node --experimental-strip-types tools/dev-flow/src/delivery/events-receiver-cli.ts health --repo <owner/name> --file <事件文件>
```

init 创建频道并保存本地配置，serve 建立或恢复精确 hook。配置、进程身份和健康记录保存在事件文件同目录。频道地址属于秘密，只保存在权限受限的配置中，不放进卡片、日志或错误文本。在 POSIX 上，组或其他用户可访问的配置和频道地址文件被拒绝。在 Windows 上这项检查不适用：文件模式位不反映 ACL，工具不检查模式位，私有性取决于事件目录所在位置的 ACL。一个事件目录只有一个写者，频道与 legacy 共用本地排他守卫。健康检查每 5 秒检查本机进程身份、连接和日志，不扫描 GitHub 业务状态。

借用已有频道时，由拥有者提供权限受限的频道地址文件及 hook ID。运行 init 时同时传入 `--channel-file <文件> --hook <ID>`。借用实例不创建或删除 hook。受限云端可用这种模式。借用实例也运行端到端自检。自检结果只报告事实，不阻止 Line 开工。

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/events-receiver-cli.ts check --repo <owner/name> --file <事件文件> --delivery <真实投递guid> --issue <已关闭Issue>
node --experimental-strip-types tools/dev-flow/src/delivery/events-receiver-cli.ts recover --repo <owner/name> --file <事件文件>
node --experimental-strip-types tools/dev-flow/src/delivery/events-receiver-cli.ts clean --repo <owner/name> --file <事件文件>
```

check 核对进程、连接、精确 hook、真实事件落盘及等待对账。借用实例用 `--hook-evidence <拥有者证据文件>` 提供 hook 事实；仅有 pid 不算自检通过。创建响应丢失时，recover 只按持久 instance/channel 身份恢复，不重复创建。clean 只处理本机已停止实例持有的精确 hook；归属无法证明就失败，不扫描删除全仓 hook。

SIGINT、SIGTERM 或 SIGHUP 请求停止。自建实例只删除已确认归属的 hook，借用实例只退订。停止、失败及恢复状态写回本地记录。连接恢复触发权威对账；频道没有可靠重放承诺，覆盖缺口不能当成没有业务变化。

legacy 单机选项仍可显式运行：

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/events-receiver-cli.ts serve --mode legacy --port <端口> --repo <owner/name> --file <事件文件> [--secret <s>]
```

legacy 只监听 loopback，并持有 `gh webhook forward` 子进程。给出 secret 时校验原始签名。停止时结束自己的子进程、释放本地写者，但不从列表差分猜 hook 归属。无法证明远端清理时保留 `recovery-needed`，退出 2。422 返回 `legacy-hook-conflict`。原来扫删其他接收器 hook 的 clean 行为已退出。

再用四条命令等待。命令一直阻塞到匹配事件出现，打印匹配的那一行 JSON，退出0。输入、对账或读文件出错时退出2，标准错误写一行 `{"kind":"wait-error",…}`，错误带系统错误码时多一个 `code` 字段。

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/wait-cli.ts issue-closed --issue <号> [公共参数]
node --experimental-strip-types tools/dev-flow/src/delivery/wait-cli.ts pr-ready --base <分支> [--ignore <pr>@<head> ...] [公共参数]
node --experimental-strip-types tools/dev-flow/src/delivery/wait-cli.ts comment --issue <号> --marker <标记名> [公共参数]
node --experimental-strip-types tools/dev-flow/src/delivery/wait-cli.ts any [--issue-closed <号> ...] [--comment <issue>:<标记名> ...] [公共参数]
```

- `--file <事件文件>`，缺省同接收器。
- `--timeout <秒>`，缺省不超时。超时退出3，标准错误写说明。超时不表示条件不成立。
- `--since <ISO 时间或 delivery id>`，只认之后的事件。缺省认文件里已有的全部行。
- `--repo <owner/name>`，对账用，缺省取 `origin`。
- 输出多一个 `source` 字段。`event` 表示可信事件文件里的行，`reconcile` 表示权威对账命中。
- `comment` 的标记名是评论第一行 `<!-- 标记名 -->` 里的词。`<!-- line-delta -->` 的标记名是 `line-delta`。
- `pr-ready` 认非草稿 PR 的 `ready_for_review`、`opened` 与 `synchronize`。`synchronize` 表示 head 变了。
- `--ignore <pr>@<head>` 可重复。号与 head 都相同的 PR 被跳过，事件与对账都一样。head 前进后同一个 PR 会再次命中。head 写完整的 sha（40 或 64 位十六进制），大小写不分。短 sha 退出2。
- 集成节点处理完一个批次后，再等时带上 `--ignore <pr>@<它处理时的 head>`，就不会立刻拿到同一个 PR。
- `pr-ready` 的输出带 `number` 与 `head`。
- `any` 接受可重复的 `--issue-closed` 与 `--comment`，任一命中就返回那一行。输出多一个 `matched` 字段，值是 `issue-closed` 或 `comment`。三个单项命令的输出不带 `matched`。
- 这些是低层事件谓词。Issue 关闭或普通评论命中不代表整波已接受。
- 命令先读文件里已有的行，再监听文件所在目录。不起进程逐行读。文件不存在时等它出现。监听之外每5秒再读一次本地事件文件，补上丢失的监听通知，这不调用 GitHub API。文件被换成另一个（inode 变了）时从头重读。

接收器不在时，GitHub 不补发事件。所以每条等待命令启动时对账一次。`issue-closed` 用 `gh issue view` 看卡是否已关闭。`pr-ready` 用 `gh pr list --limit 200` 看目标分支上是否已有开放、非草稿且不在 `--ignore` 里的 PR，只看前200个开放 PR。`comment` 用 `gh api` 取 `--since` 之后的评论。`any` 对每个条件各对账一次。已满足就立即返回，标 `source: "reconcile"`。对账读不到时命令退出2，不继续等。旧格式事件此后不再调用 GitHub API。

带 `receiver.mode=channel` 的事件只作提示。匹配事件和 connected/reconnected 诊断触发有界权威对账，频道提示本身不能放行。库调用必须同时提供明确 repository 与 reconcile，CLI 自动传入所选仓库。不匹配的仓库或缺失对账函数会失败。

频道模式需要可访问频道服务和 GitHub REST。自建 hook 需要相应仓库权限；借用模式不需要消费者管理 hook。legacy 另需 cli/gh-webhook 扩展。真实多机、宿主续接与采用结论按本次候选验收记录，不以单元测试或旧探路延迟代替。条款见 [SPEC](SPEC.md#事件等待)。

## 运行模块检查

```sh
pnpm --filter @omne-harness/dev-flow exec vitest run \
  tests/delivery-observe.spec.ts tests/delivery-github-read.spec.ts \
  tests/delivery-attributes.spec.ts tests/delivery-binding.spec.ts tests/delivery-lines.spec.ts \
  tests/delivery-labels.spec.ts tests/delivery-scope-overlap.spec.ts tests/delivery-milestone.spec.ts \
  tests/delivery-board.spec.ts tests/delivery-dispatch.spec.ts \
  tests/delivery-events.spec.ts tests/delivery-events-cli.spec.ts \
  tests/delivery-change-scope.spec.ts tests/delivery-baseline.spec.ts
pnpm --filter @omne-harness/dev-flow typecheck
```

平台边界依据 GitHub 官方的[Issue依赖API](https://docs.github.com/en/rest/issues/issue-dependencies)、[Issue API](https://docs.github.com/en/rest/issues/issues)及[GraphQL对象](https://docs.github.com/en/graphql/reference/objects)。实际远端读回仍以采集结果为准。

可选任务绑定和条件目标 scope 由 [binding.ts](binding.ts) 解析，供[集成工具](../integration/README.md)消费。旧六列表 scope 为 all；七列表最后一列是适用目标。阶段等待图尚未完整验证目标层细化，报告保留 uncovered。观察不检查 Git 是否真的达到 completionTarget，也不授发布权限。

## 首次派发临时消息

Reduce 从 binding、线包、里程碑计划、宿主策略和目标机配置填写输入。`pnpm initial-dispatch fields` 列出模板的全部字段名。输入 JSON 含 schemaVersion=1、milestone、line、revision 和 fields。line 只允许小写字母、数字和连字符。fields 是全部字段的非空字符串映射。

```sh
pnpm initial-dispatch render --input tmp/<task>/initial-dispatch.json --root <目标检出>
pnpm initial-dispatch validate --input tmp/<task>/initial-dispatch.json --rehearsal-evidence tmp/<task>/rehearsal.json --root <目标检出>
```

render 把消息写到输出检出的 `tmp/milestone-<id>/dispatch/<line>-r<revision>.md`，并返回消息的 sha256。同一修订、相同内容时复用文件。内容不同时拒绝覆盖，需要新修订。工具不执行填写的命令，不开窗口，不转发消息，不认领任务。

render 之后、validate 之前，reduce 在本机同布局运行消息里的每条命令。演练证据是 validate 的必需输入，用 `--rehearsal-evidence` 传入：

```json
{
  "schemaVersion": 1,
  "messageSha256": "<render 返回的 sha256>",
  "commands": [
    {
      "command": "<消息里的命令原文，含占位符>",
      "executed": "<可选：替换占位符后实际运行的命令>",
      "exitCode": 0,
      "outputSummary": "<输出摘要>"
    }
  ]
}
```

每条命令只写一个证据项。`command` 合并连续空白后相同的两项被拒绝。`executed` 只作记录，validate 用 `command` 匹配。

validate 按下列规则检查，任一项不满足就退出 2，不输出 STRUCTURE_CHECKED：

- 缺 `--rehearsal-evidence`，或证据文件格式不符。schemaVersion 先读，只接受 1。messageSha256 是 64 位十六进制摘要。exitCode 是 0 到 255 的整数。不认识的字段被拒绝。JSON 错误以文件路径开头，例如 `tmp/<task>/rehearsal.json: json-invalid`。
- 消息文件与按输入重新生成的内容不同。
- `messageSha256` 与消息文件的 sha256 不同。证据必须针对这一份消息。
- 消息里有未闭合的代码块（`initial-dispatch-fence-unclosed`），或有不是 shell 的代码块（`initial-dispatch-non-shell-block`）。没有语言标签的块也不是 shell 块。字段值带入的代码块同样检查。
- 消息里有命令没有证据条目（`initial-dispatch-rehearsal-missing`）。命令指 shell 代码块里的每一行。空行和 `#` 注释行跳过，行尾反斜杠连接下一行，比较前合并连续空白。行内代码不算命令。

代码块边界按 CommonMark 识别：

- 开始行缩进不超过 3 个空格，以 3 个以上反引号或 3 个以上 `~` 开头。缩进 4 个空格的行不是边界。
- 信息串的第一个词转成小写后是语言。`sh title=x` 和 `Bash` 都是 shell 块。shell 块的语言是 `sh`、`bash`、`shell` 或 `zsh`。
- 结束行用开始行的字符，长度不短于开始行，不带信息串。块内的 `` ```bash `` 这类带信息串的行仍是块内容，也算命令。

证据里多出的条目（例如线包里的命令）不报错。结果的 `matchedCommands` 是消息里不同命令的条数，`extraEntries` 按原文列出与消息命令都不匹配的证据项。非 0 退出码不使 validate 失败，结果的 `nonZeroExits` 逐条列出。例如带 `--timeout` 的等待命令演练时退出 3。Reduce 逐条说明这些退出码。

GENERATED 只证明文件已生成。STRUCTURE_CHECKED 只证明字段、修订、常见敏感模式、字节和演练证据的覆盖通过。它不证明命令输出正确。Reduce 按返回的 remainingGuards 逐项核对后，才能记录 VALIDATED。常见格式扫描不能证明没有其他秘密。之后通过宿主侧边栏或 IDE 打开 path，分别记录打开结果和人的转发声明。queued 不算已打开。完整阶段规则归[负责人状态](../../../../docs/engineering/map-reduce-states.md#6-初始派发消息的生成与人工转发)。
