# 可复核的来源与观察

本页分三类记录：调研稿与文献（来源与核实程度）、工具试用（本机实际跑过）、本仓库读数（命令与输出）。
仓库读数以主线 `6f3cefa391abc1420123b14c1e2f77237ab57364` 为准；`a68f1558b` 与它在 `packages/`、`apps/` 下无差
（`git diff --stat 6f3cefa39 a68f1558b -- packages apps` 输出为空），读数相同。

## E1　两份原始调研稿

- 消费对象：[research.md](research.md) 全部结论的文献侧来源。
- 来源与精确修订：[reports/2026-10-02-methods.md](reports/2026-10-02-methods.md)（原件 sha256 `af2162e89c3521e18cd711f1287b38d07835ae42acd1064b4a5d79166cde2d31`）、
  [reports/2026-10-02-tools.md](reports/2026-10-02-tools.md)（原件 sha256 `3fe6e356646f9e292da78ec31fb1def2a9bf137bfa2be0dd57520f0d07defbf8`）；
  入库时只在文件头加了一段入库说明，正文未改。
- 来源立场：两份都是 2026-10-02 派出的只读调研 subagent 的产出，**是模型输出，不是证据**。
  方法稿的 97 条文献（R1～R97）逐条标了核实方式：〔原文〕读了全文或摘要原文、〔元数据〕只核了题名作者年份与主要结论、〔二手〕经转述、未核实。
  入库时由主线另行抽核的，见 E2；其余文献性陈述在本 topic 里按稿中标记的级别使用，没有升级。
- 取得方式：调研 subagent 用 WebSearch／WebFetch、`npm view`、`gh api`、PyPI JSON 取证；工具在本机试用（见 E3）。
- 实际观察：方法稿自定证据级别 A～D（A 多团队或大样本实证一致；B 有实证但多出自方法提出团队或厂商、或只是横截面相关；
  C 案例与经验报告；D 理论或从业者经验、检索未发现实证）。research.md 沿用这套口径。
- 支持范围：只支持「这些文献说了什么、核到了哪一层」；**不**支持稿中关于本仓库的事实陈述——
  方法稿 §1 自述「关于仓库的事实只取自任务背景，没有读仓库」，工具稿的仓库读数是正则原型。仓库事实以 E4～E7 为准。
- 后续核对：稿中两处与本仓库不符的陈述，见 E4。

## E2　主线对关键文献的抽核

- 消费对象：research.md「度量变成目标就失真」「历史侧挖掘的前提」两条结论。
- 来源与精确修订：调研 subagent 下载的论文原文，转存在主检出 `tmp/arch-aids-research/papers/`（被 Git 忽略的本机副本，
  校验值在同目录 `SHA256SUMS`）：`ase2018.pdf`／`.txt`（R26，Mo 等 ASE 2018，ABB 经验）、`ecsa2018.pdf`／`.txt`（R27，Wu 等 ECSA 2018，华为 SAI）、
  `icse2015-seip.pdf`（按文件名对应 R23，未抽文本核对）。
- 来源立场：R26、R27 都出自方法提出团队与合作企业（Cai、Kazman 一脉），属作者自述的经验报告。
- 取得方式：`grep -n` 抽文本。
- 实际观察：
  - R26 `ase2018.txt` 第 854～858 行：「found that some roots are caused by high-impact utility files … the high-impact utility files should be excluded」；
    第 875～880 行：已知良好的分支「very few actual developer commits (they were mostly merges)」，需跨分支收集历史。
  - R27 `ecsa2018.txt` 第 23～25 行：「it is critical to guide development teams to focus on the underlying problems behind each measure within SAI, rather than on the score itself」。
- 支持范围：这两句原话与方法稿 §2.4、§2.14 的转述一致；不支持把它们推广成独立第三方的结论。

## E3　工具试用（本机，只读）

- 消费对象：research.md「现成工具都不理解 Cordis 装配」「成员内文件级环」两条结论。
- 来源与精确修订：dependency-cruiser 18.5.0、skott 0.35.12、archunit（ArchUnitTS）2.5.4、code-maat v1.0.4、LikeC4 1.59.4；
  Node v24.21.0、Java 21；对象是 2026-10-02 当天的主检出。各工具的版本、许可与维护状态见 [tools 稿](reports/2026-10-02-tools.md) §2～§6 的表，
  取自 `npm view`、`gh api repos/...`、PyPI JSON 与官方文档页（2026-10-02）。
- 来源立场：试用由调研 subagent 执行；主线没有重跑，只核了产物存在与哈希。
- 取得方式：试用产物转存在主检出 `tmp/arch-aids-research/tool-trials/`（被 Git 忽略；不含 `node_modules/` 与 `code-maat.jar`，
  依 `package-lock.json` 可重装，jar 的 sha256 记在同目录 `EXCLUDED.txt`），全部文件的校验值在 `tmp/arch-aids-research/SHA256SUMS`，
  `sha256sum -c SHA256SUMS` 通过（2026-10-02）。
- 实际观察（摘自 tools 稿 §1）：dependency-cruiser 在成员的 `exports` 只有 `types`／`import` 两个条件时，需显式给 `exportsFields` 与 `conditionNames` 才能解析跨成员 import；
  配好后 1017 个模块、2978 条依赖、5.3 s；`no-circular` 文件级 34 条，去掉 type-only 剩 10 条，落在 `core/tool-definition` 与 `model/pi-ai-transport`；
  skott 找到的 10 条运行时环与之一致。ArchUnitTS 的跨成员 import 经 pnpm 软链落到 `dist/*.d.ts`，切片核对结果不可信。
  code-maat 默认 `--max-changeset-size 30` 会整体丢弃本仓库的大 squash 提交。
- 支持范围：只支持这些版本在当天这棵树上的行为；文件级环的条数会随代码变化，不支持当作当前读数引用。

## E4　Cordis 注入边与 import 边的重叠（更正原稿）

- 消费对象：research.md「Cordis 装配边一部分也出现在 import 图里」。
- 来源与精确修订：主线 `6f3cefa39`（同 `a68f1558b`）。
- 来源立场：主线自己的复现。
- 取得方式：[probes/inject-import-overlap.mjs](probes/inject-import-overlap.mjs)（正则粗读，不是解析器；范围是 `packages/*/*/src` 与 `apps/*/src` 的非测试 `.ts`；
  服务名常量按名字在全 workspace 还原，还原不出的打印出来）。在仓库根运行：

  ```
  node .meta_harness/research/architecture-judgment-aids/probes/inject-import-overlap.mjs . --list
  grep -rn "STORAGE_SERVICE *=" packages/*/*/src
  ```

- 实际观察：`provided service keys: 24`、`inject entries: 42`、`injection member pairs: 32`、`of which also an import edge: 14`、
  `injected keys with no provider in src: 0`、`unresolved names: 0`。14 对重叠的例子：`tenancy/account-registration → tenancy/account-identity`、
  `tools/asset-registry → assets/assembly-manifest-store`、`agent-loop/loop-extension-runner → session/session-log-jsonl`。
  其余 18 对里 15 对指向 `infra/storage-sql` 或 `infra/clock`。`STORAGE_SERVICE = 'storage'` 在 `infra/storage-sql/src/plugin.ts:9`、
  `model/model-profile-directory/src/plugin.ts:25`、`tenancy/organization-governance/src/plugin.ts:33` 各定义一份。
  服务接口类型与服务键常量都定义在提供者包里，消费者为取它们而 import 提供者，例如 `account-registration` 从 `account-identity` 取 `ACCOUNTS_SERVICE` 与 `AccountsService`。
- 支持范围：支持「原稿两处陈述与本仓库不符」——tools 稿 §0 第 1 条「这 32 对没有一对在 import 图里出现」，
  methods 稿 §0「消费者在编译期 import 的是 `core` 里的契约，不是提供者」。tools 稿的「0 对」源于它的 import 图因部分成员没构建 `dist/` 而缺边（稿中自述）。
  不支持把 24／32／14 当作精确值：正则会漏掉多行以外的写法与动态拼出的服务名，精确值以语法树抽取为准。
- 后续核对：成员源码变动后重跑同一命令。

## E5　`og-s42` 规则的性质

- 消费对象：research.md「本仓库现有工具里没有装配图抽取器」。
- 来源与精确修订：`tools/ts-checks/src/rules/og-s42-dynamic-resolve.ts`（主线 `a68f1558b`）。
- 取得方式：`sed -n 1,40p tools/ts-checks/src/rules/og-s42-dynamic-resolve.ts`。
- 实际观察：规则在词法视图（`viewsOf`、`codeMatches`）上跑正则，只认 `organization-purge` 这一个服务键（`PURGE_KEY`），
  检查它是否只在 `account-registration` 里经 `ctx.get`／`resolveOptional`／`inject` 解析，产出只有违规列表。
- 支持范围：它不产出服务图，不能当抽取器；能复用的是词法视图工具与 `tools/ts-checks/src/syntax.ts` 的语法树入口。

## E6　`ctx.provide(` 的分布与运行期读 `inject`

- 消费对象：research.md「本仓库现有工具里没有装配图抽取器」。
- 取得方式与实际观察：

  ```
  grep -rn --include=*.ts "ctx\.provide(" packages/*/*/src | grep -vE '\.(spec|test)\.ts:' | wc -l   # 25
  grep -rn --include=*.ts "ctx\.provide(" apps/*/src | wc -l                                       # 0
  sed -n 175,182p apps/tenancy-host/src/boot.ts                                                    # 177 行运行期读 plugin.inject
  ```

- 支持范围：只说明装配点在成员 `src/` 里、应用层没有 `provide`；不说明哪些插件实际被装上——那要读应用的装配清单。

## E7　历史侧数据量

- 消费对象：research.md「历史侧挖掘撑不起」。
- 取得方式与实际观察（2026-10-02）：

  ```
  git log --first-parent --format=%h 6f3cefa39 -- packages apps | wc -l   # 20
  git log --format=%h 6f3cefa39 | wc -l                                   # 941（含被合并分支的提交）
  git ls-remote origin 'refs/pull/*/head' | wc -l                         # 48
  ```

- 支持范围：首父链上碰过产品代码的事务只有 20 个；squash 前按 `Agent-Role` 区分的提交可从 `refs/pull/N/head` 取回，条数随 PR 增长。
  不支持任何共变强度的结论——本 topic 没有跑共变分析。

## E8　实现映射节点作为「意图」的现状

- 消费对象：research.md「本仓库的意图侧写在正文里，没有机读字段」。
- 来源与精确修订：`.meta_harness/design/realization/`（主线 `a68f1558b`）。
- 取得方式：[probes/realization-node-facts.py](probes/realization-node-facts.py)，在仓库根运行
  `uv run --locked python .meta_harness/research/architecture-judgment-aids/probes/realization-node-facts.py`。
- 实际观察：节点 52 个（`packages/<组>/<名>/` 50 个、`apps/<名>/` 2 个）；全部 `bindings.yaml` 的顶层键只有 `bindings`、`kind`、`node`、`version`；
  9 个节点没有对应的包；25 个有包节点的 README 仍含「尚未建包」字样（其中部分在别处加注说明那是此前状态，但「源码位置」一行没改，例如
  `session/session-tenancy-table/README.md:8`、`core/messages/README.md:87`）。
  装配意图（Cordis 插件、`provide`、`inject`、事件）写在各节点 `design.md` 的表里，表头各节点不统一；
  `tooling/src/realization_nodes.py` 当机读字段读的只有 README 的 `- kind：`、`- 源码位置：`、`- 交付面：`（仅装配节点，第 216～264 行）
  与 `bindings.yaml` 的 `node`、`kind`、`bindings`。
- 支持范围：说明意图侧「有内容、无机读形状」；「尚未建包」是子串匹配，不区分该字样出现在现行状态行还是历史注记里。
