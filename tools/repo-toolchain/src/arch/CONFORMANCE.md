# 全局架构符合性报告

形状由 conformance-model.ts 拥有，输入校验由 constraints.ts 拥有。本页约束报告行为。
依据：已授权 N3、D-114 的有效 IC、[系统分层](../../../../docs/architecture/layers-and-dependencies.md)。

## 输入与责任

当前唯一输入为 `docs/architecture/constraints.json`。HEAD和BASE各自按本版坐标发现输入，历史版仍可读取旧 `.meta_harness/design/architecture/constraints.json`。同一版本存在两份输入时拒绝，即使字节相同。规则身份仅取公开RULE_IDS。
domains 和 roles/rules 的身份分别唯一。入口路径为仓库相对路径，只接受精确路径或末尾 /**。
角色匹配优先最精确路径；同精度冲突、candidate、unknown 与未映射都不能作采用的层次证据。
空规则列表合法且不同于文件缺失。缺失以INPUT unknown保留坐标和原因，不能声称整体符合。未知规则、坏JSON、越界路径和重复身份必须失败。

schemaVersion 2的source是仓库根相对Markdown路径，可附锚点。历史schemaVersion 1保留具名根前缀与同目录相对形式；不通过搜索哪个文件存在来选择基准。有效source的文件及锚点都从输入相同版本读取，坏引用拒绝。工作树中的符号链接不能让读取越出检出；历史版只读取该commit中的普通文件。

`rules` 接受以下四个精确 H1 身份，来源仍须通过同版本文件与锚点校验。

- `H1-SESSION-FACTS`
- `H1-AGENT-REASSEMBLY`
- `H1-MODEL-LIFETIME`
- `H1-OBSERVATION-CONTINUITY`

报告在 `coverage` 中将每个 H1 身份列为 `behavior`，明确标注本报告未执行。
实际契约、探针或测试负责提供 H1 行为证据。报告不为 H1 生成符合性行，也不据此声称静态收敛。
登记身份与来源不表示 H1 已采用或运行时符合。未知身份和近似拼写仍然拒绝。

## 方向行

表示（schemaVersion 3）：

- schema 3 在 schema 2 之上新增顶层数组 `directions`，可以缺省；给了就必须是数组，`null` 等别的值拒绝。schema 1、2 照旧解析，出现 `directions` 时按未知字段拒绝。
- 一行是 `{ "id", "from", "to", "source" }`，字段不多不少。`id` 匹配 `^DIR-[A-Z0-9]+(-[A-Z0-9]+)*$` 且在 `directions` 内唯一；`from`、`to` 非空、元素唯一、每个都是 `roles` 里声明的角色 id；`source` 按角色 `source` 的规则校验。
- 一行的源角色与目标角色不在同一个成员里，同一个角色也不能同时在两边。成员内部的依赖不进依赖图，这样的一对永远不会命中，所以拒绝。
- 方向行引用的角色：每条 `paths` 都落在同一个成员目录里（按依赖图的成员规则，`packages/<组>/<成员>` 或 `apps/<成员>`；`examples/` 不行），这个目录是该角色的成员；它的 `paths` 不与任何别的角色相同或互相包含（一个是另一个 `/**` 目录之下的），否则一个文件会同时属于两个角色。违反的都拒绝。
- 角色的 `status` 不影响方向行：方向行按角色 id 绑定，报告也不按退休过滤这些角色。`directions` 参与语义预期比较，增删改一行是语义变化。

判定（与 `omne-deps` 同一个函数、同一份输入）：

- 方向行与角色只从可信 runner 的 `constraints.json` 读，不从被检版本读；被检版本与基线版本都用这份方向行。runner 没有文件或没有方向行时报告没有这些行，也不取依赖图。
- 依赖事实只取 dependency-cruiser 的输出（`deps/graph.ts` 的 `modules` 与 `dependencies`，可信 runner 的预设），各版本取各自的图，不另走静态抽取。`modules` 只含解析到的文件，解析失败的导入不在其中。
- 源：依赖所在文件匹配某个 `from` 角色的 `paths`；不取最精确的角色。目标：解析后的文件所在成员等于某个 `to` 角色的成员，在 `src/`、`dist/` 或声明文件里都算。源角色与目标角色有没有文件按同一条 `paths` 规则对 `modules` 判。
- 不取图：方向行引用的角色在某个版本里都匹配不到文件时，报告不取这个版本的依赖图。这时角色有没有文件对该版本的文件清单判，不对 `modules` 判：工作树是 root 下磁盘上的文件，提交是 `git ls-tree` 列出的文件。清单覆盖 `modules`，所以每一行都是两边角色都没有文件的 unknown，与取图时逐字相同。只要有一个角色有文件，或者清单读不确定（读不了的目录、Git 失败、提交不在、链接或子模块挡在路径上），就照常取图。被检版本与基线版本各自判断，一个取图不要求另一个也取。
- 不取图时，取图才会遇到的失败一律看不到：runner 的预设坏了、图缓存坏了等读图错误都不出现，行写角色没有文件的原因。这是有意的：这时结果与图无关。

报告行：

- 按成员对展开：每条方向行 × 每个 `from` 角色 × 每个 `to` 角色一行。`rule` 为 `DIRECTION`，`key` 为 `<方向行 id> <源角色> → <目标角色>`，`member` 与 `targetMember` 是两个成员，`expected` 是方向行的 `source`。
- `DIRECTION` 是报告行的身份，不是 `RuleId`，不能写进 `constraints.json` 的 `rules`；省略规则列表也关不掉这些行。
- 没有命中为 converged；有命中为 deviation，`sites` 与 `reason` 逐处列源文件、目标文件与行号；源角色或目标角色在被检版本里匹配不到任何文件（包括上面不取图的情况），或取了图但依赖事实不可得（dependency-cruiser 或 Git 的已知失败，没有给出图）时为 unknown，`reason` 写明原因。别的异常照常失败，不记成 unknown。
- 给 BASE 时，偏离行对基线版本的图判新旧：基线上同一行也偏离为 stock，否则为 new；基线不取图时它没有偏离行，被检版本的偏离行都是 new。取了基线的图但图不可得时不判，`age` 留 unjudged，每一行的 `reason` 末尾写明基线依赖事实不可得及原因。
- 报告 exit 0 不表示符合：偏离与未知都只报告，硬线归 `omne-deps`。

当前输入拒绝来源位于 `packages.0.0.1.legacy/` 或 `apps.0.0.1.legacy/` 的登记，包括用 `--revision` 选择的当前版本。只在 BASE 比较中，工具可退休来源位于这两个根、且路径在该版本实际源码快照中全部零命中的角色。匹配沿用精确路径和末尾 `/**` 规则，快照沿用架构读取器的活动范围。历史角色仍命中源码时拒绝旧来源；domains、rules 和 importExceptions 没有退休豁免。

退休角色不参与机械判定、报告责任映射或来源读取。输入仍保留原始 `value`，并在同一输入的 `retiredRoleIds` 列出退休 ID，版本归 `source.commit`。原始值继续参与预期差分，因此删除登记仍是可见变化。有效来源继续核对正文、锚点和摘要；退休角色不能让另一条有效登记的来源免于校验。
全局输入与原有效 realization 例外分别保留拥有者，不复制插件绑定。

HEAD 与 BASE 分别读本版完整 workspace、源码、manifest 和解析配置。
抽取后的 Import occurrence 包含 resolvedPath；workspace 名称已识别但源码未解析不能作已解析入口。
规则结果身份包括规则、源入口、目标入口/未解析名称、符号和类型/引用形式，排除行号。
同包内两个入口不能共用一个违反规则身份。未知表达式继续携带位置和原因。

## 组环例外

表示（schemaVersion 3）：

- schema 3 另有顶层数组 `groupCycleExceptions`，可以缺省。给了就必须是数组，`null` 等别的值拒绝。schema 1、2 出现这个字段时按未知字段拒绝。
- 一条是 `{ "id", "edges", "ruling", "reason" }`，字段不多不少。
  - `id` 非空，在 `groupCycleExceptions` 内唯一。
  - `edges` 至少一条。一条边是 `{ "from", "to" }`，字段不多不少。`from`、`to` 是成员路径，与依赖图 `edges` 的 `from`、`to` 同一种键：`packages/<组>/<包>`、`apps/<应用>` 或 `examples/<示例>`，每一段只含字母、数字、`.`、`_`、`-`，以字母或数字开头。组键、成员内的子目录、通配符、空白与整段为 `..` 的路径拒绝。
  - 一条边的两端必须在不同的组。同组的边与组环无关，拒绝。
  - 一条边在全部例外里只能出现一次，同一条例外内重复也拒绝。反向的边是另一条边。
  - `ruling` 是裁定的 `https://` 链接。它不是 `source`，不按 Markdown 来源核对文件和锚点，也不进 `sources` 摘要。
  - `reason` 是一句非空理由。
- `groupCycleExceptions` 参与语义预期比较：增删改一条例外或其中一条边是语义变化。条目顺序与例外内边的书写顺序不是。

判定（`omne-deps` 与回路状态的硬线用同一个函数 `group-cycles.ts` 的 `judgeGroupCycles`、同一份输入）：

- 例外只从可信 runner 的 `constraints.json` 读，不从被检版本读。runner 没有文件或文件是 schema 1、2 时没有例外。
- 例外放行裁定过的成员边。一个组环（依赖图组间的强连通分量）由 `deps/graph.ts` 的 `group-cycle` 发现给出：`edges` 是环内全部跨组的成员边，`groups` 是环上的组。
- 一个组环放行，当且仅当它的每一条跨组成员边都登记在某条例外的 `edges` 里。放行不算失败，记下用到的每条例外与边。只要有一条边没登记，组环照常失败：发现的 `message` 末尾写「环上未登记为例外的边：…」（环上一条边都没登记时消息不变），机读的 `edges` 仍是环内全部边。所以两个组之间以后新增的任何未登记的成员边都会让组环失败。
- 登记的每一条边都必须出现在某个组环发现的 `edges` 里，不论那个组环最后是否放行。没出现的边（边被删、组环已消失、边不在环上）让这条例外产生一条 `unused-group-cycle-exception` 发现，`edges` 是没用上的边，`message` 列出它们，照常失败。
- 例外只作用于 `group-cycle`。成员环、文件环、规则违规和方向发现不受影响。
- 本报告的符合性行不读例外，结构度量的环也不读。

例：`packages/context` 与 `packages/tool` 之间有三条跨组成员边：`packages/context/a → packages/tool/b`、`packages/tool/b → packages/context/c`、`packages/tool/d → packages/context/c`。它们组成一个组环。

| 登记的边 | 结果 |
| --- | --- |
| 三条都登记 | 放行，记下用到的边 |
| 只登记前两条 | 失败，消息末尾写「环上未登记为例外的边：packages/tool/d → packages/context/c」 |
| 三条都登记，之后新增 `packages/context/e → packages/tool/b` | 失败，消息末尾写「环上未登记为例外的边：packages/context/e → packages/tool/b」 |
| 三条都登记，之后 `packages/tool/d → packages/context/c` 被删 | 组环由剩下两条边放行，但被删的边不在任何组环里：例外报 `unused-group-cycle-exception` 而失败 |

## 机械子集

机械规则沿[产品包组织](../../../../docs/package-organization.md)按采用责任、公开入口和源码闭包判断。core与util目录名不授予许可。存量candidate、unknown及未映射继续报告unknown，不因迁移提高采用状态。domains保留原机读分组投影，不代替完整领域清单，也不按目录数量重标。

| 身份        | 能判断的范围                                                                                       | 不能据此证明                                 |
| ----------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| LAYER-ENTRY | adopted 交互入口直接 import/export 业务存储契约或适配器，含类型引用                                | 函数内部授权与间接调用的业务语义             |
| LAYER-DIP   | adopted 策略入口引用 adopted 交互、存储适配或装配源码                                              | 外部库的所有语义与运行注入方向               |
| IC-1        | 同键多处定义；定义不属于已采用责任或未从真实exports公开                                            | 动态定义、运行提供者唯一性及完整契约拥有关系 |
| IC-2        | 已识别 ctx.provide 旧形状，不能替代 Service 子类规则                                               | 回收、并存及在途状态                         |
| IC-3        | 定义是 Context 增补，或缺少 contract/owner                                                         | 签名/行为与契约完全一致                      |
| IC-4        | manifest各根exports映射源码的闭包引入Cordis或本包集成入口；例外只保留封存 kernel-basis 路径与 apps | 声明、实际制品、安装闭包和动态非字面量       |
| IC-5        | 非装配消费者引用私有入口或已采用外侧实现；公开定义值闭包引入独立提供者；例外取BASE精确声明         | 声明、制品隔离、动态选择与同提交行为保证     |
| DIRECTION   | 源角色的源码经 dependency-cruiser 已解析的导入（含类型、重导出、动态、子路径、别名、相对路径）指向目标成员 | 解析失败的导入、发布产物与安装闭包、运行时授权；converged 不表示整体符合 |

IC-5的源或目标责任没有采用时是unknown。具体装配豁免只归已采用的源文件；目标同包公开服务定义可以消费，但其值闭包不得引入独立提供者。IC-3允许的定义自有登记逻辑不因此成为独立提供者。
尚不明确的例外不得当作符合。泛化存储契约即使满足 DIP，仍由 LAYER-ENTRY 判交互越界。
已接受 IC-5 例外与分层要求相冲突时，该分层结果为 unknown 并指出原例外出处，等待负责人裁定。
普通装配只豁免明确定位的源文件；没有 apps 通用分层豁免。
单条 converged 只表示该条有限静态检查没有发现违规，不表示成员或系统整体符合。

包扫描把上述符合性行原样投影到 `PackageScan.dependencies`。
同一数组再加上 `undeclared-dependency` 和 `member-cycle`。
这两个名字不是 `RuleId`。它们不能写入 `constraints.json`。省略规则列表也关不掉它们。
`undeclared-dependency` 表示源码引用了另一个 workspace 成员，而导入方的 `dependencies`、`peerDependencies` 或 `devDependencies` 没有该包名。类型导入同样要声明。
`member-cycle` 使用已经解析的 workspace 导入。这包括子路径 `cordis`，也包括解析到其他成员的相对导入。
`unknown` 保持 `unknown`，不会被写成 `converged`。
IC-4 仍在查看公开根闭包之前跳过 `apps/` 成员和 `packages/core/kernel-basis`。
这个跳过不覆盖目标路径 `packages/assembly/kernel-basis`。
这次改动不禁止应用里其他文件导入 Cordis。

IC-6/9/10/11/13/14/16/18/19 及 LSP 保留行为义务；IC-7、SRP/OCP/ISP 留人工判断；
IC-8和IC-12尚未接入机械规则。IC-15和IC-16的加载器已由实际成员交付，本静态规则尚未覆盖最终配置与来源，仍须核对实际组合证据。IC-17机制待设计。
这些状态须在 JSON、浏览器与 health 中保留。类型同形反例须显示无静态 LSP 证明。

## 比较与反馈

给出BASE时，当前实现对BASE规则及精确例外比较。BASE输入缺失时，依赖该输入的结果是unknown或no-data，不用HEAD或空规则替代。删除当前输入仍保留语义删除和INPUT unknown；开启的architecture传感器因此为no-data。独立实际事实差分仍可报告。
未给 BASE 时使用当前预期，comparedWith=current；结果的新旧分类为 unjudged，预期变化不比较。
BASE 实现对 BASE 预期构成存量；新违规与存量分别表示。无 BASE 时分类未判。
HEAD 和 BASE 的全局预期及原节点预期变化单列。删除最后规则或整个文件也保留变化。
JSON格式、行号和集合排序不造成预期变更；路径、角色状态、依据、规则或例外变化属于语义变化。
每版输入携带有效source文件的SHA256；退休角色的来源不读取，也不伪造摘要。sourceChanges独立报告有效依据路径及字节变化，不并入changes或architectureChanges语义计数；它不证明含义变化。JSON、HTML和hook显示两类变化，所有摘要仍保留未知范围。
成员筛选在完整两版解析、比较与分类之后投影，不改变规则或解析上下文。

actual.json 与默认实际 JSON API 不读取或包含意图。报告附加 conformance.json 与图的符合性字段。
CLI --conformance 输出该文档；--member 只用于符合性投影。未选此输出而使用 --member 必须失败。
stdout 与 --out 输出同一份已选择的文档：默认是实际 JSON，--conformance 是符合性 JSON。
--report 始终保留完整上下文的 HTML、graph.json、actual.json、conformance.json 和 summary.md。
--member 仅筛选 stdout/--out 的符合性行，不筛选报告或移除全局预期变化。
参数采用精确 workspace 成员路径（如 packages/core/storage），匹配行的 member 或 targetMember，保留出向与入向关系。
projection 记录参数和 matched。未在当前或 BASE 清单出现的成员返回空行及 matched=false，不报告成员符合。
--out 不得覆盖报告文件；默认实际输出可与报告的 actual.json 同名，因为内容相同。
没有全局预期时报告保留 unknown 和“输入缺失”，不把无规则写成整体符合。
统一评审页展示责任映射、规则出处、入口证据、存量/新增/未知和预期变更；选结果可以聚焦组件。
叠加及导出包含当前选择范围的符合性行，不把静态符合性颜色称为运行安全。

钩子同时反馈新增违规和预期改动。只改当前或历史预期路径、或预期所引用的Markdown源也须触发。已退出的手写bindings不是当前输入。
超时/解析失败沿原错误输出，不假成功；应产生 Finding 的真实验收场景须 ≤40 秒、有预期 Finding、未跳过且无 systemMessage。
普通无读数与已反馈去重保持静默；错误显示 systemMessage 并记录原因，不能算成功测量。
health 保持旧块与硬线，增加一行符合性摘要，总摘要 ≤15 行。
