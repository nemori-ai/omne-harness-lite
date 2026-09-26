# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：未开始。**`data.skill-package` v2 是 `candidate`，未接受、未冻结；尚无提供者设计、尚无源码、尚无装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。
> 2026-09-24 第一轮独立评审（基线 HUB `765b01dc`）的处置见[独立评审](#独立评审)。
> 起草时只做了手核；**整批对齐与修复波 1b 终稿（都在 2026-09-24）各跑过一次 V-1 的本地自检**（只判 Schema 通过与否，见[结果与反例](#结果与反例)）。
> 六条规范场景、八条消费者核对场景、四条静态检查**一条都未执行**——文件存在不代替结果。
> 唯一跑过的是 `make design-check`：它解析了本包 Schema 的 JSON、核对了 `$id` 与全部 `$ref`／JSON Pointer 指得到、核对了 Markdown 链接与锚点——**它不校验任何实例**。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v2/examples.md) 第 1～5、7～9 节逐行（含变体行，按「在 X 上改动 Y」构造）过 Schema，比对「Schema」一列。第 6、10 节不参与 | Draft 2020-12 校验器（能按 `$id` 解析到 `data.content-blocks/v2`、`data.asset-model/v2`、`data.tool-definition/v2` 及它们各自引用的 Schema）＋ 按节绑定的 `$defs` | [S-2](v2/contract.md#s-2-技能名的词法)～[S-15](v2/contract.md#s-15-设置项声明)、[S-18](v2/contract.md#s-18-常驻不在包里)、[S-32](v2/contract.md#s-32-执行环境要求) 的**形状那一面** | **本地自检已跑两次**（整批对齐 2026-09-24：113 处 0 不符；修复波 1b 终稿：122 处 0 不符）；拒绝值是哪一个未机检 |
| V-2 | **拒绝值的具名与优先级**：对每个拒绝行，接收边界给出的拒绝值等于「拒绝值」一列（含 M 编号）；第 7 节八行各验一个值，第 8 节十一行专验优先级 | 接收边界的一致性用例（同一份输入跨实现比对） | [S-24](v2/contract.md#s-24-表示层拒绝值与判定次序)、[S-25](v2/contract.md#s-25-表示层拒绝不是判定也不修补) | **未开始。**需要一个实现了接收边界校验的提供者。**只验 Schema 通过与否不够**——两个实现可以都拒绝、却报不同的名字 |
| V-3 | **Schema 管不到的约束**：[`examples.md` 第 9 节](v2/examples.md#9-schema-挡不住但同样非法的)逐行——资源路径重复与前缀冲突、设置项项名重复、`default` 不合取值域、名字与所属能力标识不一致 | 接收边界的校验 ＋ 第 9 节 | [S-6](v2/contract.md#s-6-名字与所属能力标识一致)、[S-9](v2/contract.md#s-9-资源条目与包内路径)、[S-15](v2/contract.md#s-15-设置项声明) | **未开始。**名字一致性落在知道能力标识的那一方（资产写面、工作区读入、导入器） |
| V-4 | **文本形式的读法**：[`examples.md` 第 6 节](v2/examples.md#6-skillmd-的文本形式)十五行，比对读出的 `manifest`、`body` 与拒绝值；**比对读出的值本身**，不只看解析成功与否 | 读入方的单元用例（同一份 `SKILL.md` 跨实现读出同一个值） | [S-5](v2/contract.md#s-5-键的四类处置)、[S-8](v2/contract.md#s-8-正文逐字不展开不执行)、[S-20](v2/contract.md#s-20-skillmd-的文本形式与定界) | **未开始。**`name: no` 那一行是解析器版本的回归用例，`see a---b here` 那一行是定界的回归用例——**两条缺一不可** |
| V-5 | **目录形式的读法**：[`examples.md` 第 10 节](v2/examples.md#10-包的目录形式)八行，在真实文件系统上构造目录（含执行位、符号链接、成环链接） | 读目录一方的集成用例 | [S-21](v2/contract.md#s-21-包的目录形式)、[S-10](v2/contract.md#s-10-资源只被读取不因读取而运行) | **未开始。**符号链接那两行**必须在真实文件系统上跑**——只在内存里模拟路径，看不出解析之后落在哪 |
| V-6 | **规范场景** [S-26](v2/contract.md#s-26-名字对不上即拒)～[S-31](v2/contract.md#s-31-常驻与预批准不从内容生效)：每条一个正例一个反例 | 规范场景演练：真实接收边界、真实读入方、真实放行判断 | [S-6](v2/contract.md#s-6-名字与所属能力标识一致)、[S-8](v2/contract.md#s-8-正文逐字不展开不执行)、[S-9](v2/contract.md#s-9-资源条目与包内路径)、[S-12](v2/contract.md#s-12-定义记录)、[S-13](v2/contract.md#s-13-组合的工具清单)、[S-18](v2/contract.md#s-18-常驻不在包里)、[S-20](v2/contract.md#s-20-skillmd-的文本形式与定界)、[S-21](v2/contract.md#s-21-包的目录形式) | **未执行。**S-27 的两个反例**必须观察读出的值**；S-31 的正例**必须观察放行判断的实际结果**——只看包被收下，看不出 `allowed-tools` 有没有被当成预批准 |
| V-7 | **消费者路径走查**（[CS-1～CS-8](v2/contract.md#消费者核对场景)） | 结构化走查（评审对象）；有提供者之后升级为真实演练 | [S-3](v2/contract.md#s-3-技能包的四个部分)、[S-6](v2/contract.md#s-6-名字与所属能力标识一致)～[S-17](v2/contract.md#s-17-属性项投影规则)、[S-19](v2/contract.md#s-19-包是版本内容的一个整体)～[S-21](v2/contract.md#s-21-包的目录形式) | **未开始。**走查**不需要提供者**，现在就做得了；**CS-2、CS-4 的执行环境要求停在 `data.tool-definition` 的 G-5（「满足」的判定）、CS-8 停在 G-6**（CS-4 的 `self` 与 CS-7 的生效值交出已由第一轮评审处置走通）——停在缺口不算走不通，如实记为「本版到此为止」 |
| V-8 | **跨进程**：[第五节](v2/contract.md#五装配给与协议给)右列逐行演练 | 规范场景演练 | [S-8](v2/contract.md#s-8-正文逐字不展开不执行)、[S-19](v2/contract.md#s-19-包是版本内容的一个整体)、[S-21](v2/contract.md#s-21-包的目录形式)、[S-24](v2/contract.md#s-24-表示层拒绝值与判定次序) | **未开始，且本版装配下无法演练**——单机同进程不构成接收边界。**这不是免除**：跨进程演化启动时必须补做，登记在[变化的影响](#变化的影响) |
| V-9 | **静态检查**（[SC-1～SC-4](#静态检查义务)） | 实现语言的静态检查（具体形式归 realization） | 见下表 | **未开始；检查器尚不存在** |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。本版全部状态为「未开始」，**不得以「已列出」充当「已通过」**。

| # | 检查什么 | 对应条款 | 状态 |
|---|---|---|---|
| SC-1 | 读正文、送正文的代码路径上不存在对 `body` 的替换、裁剪或插值；不存在把正文交给任何 shell 或求值器的调用 | [S-8](v2/contract.md#s-8-正文逐字不展开不执行) | 未开始 |
| SC-2 | 运行技能脚本的入口只接受脚本集合里的路径；不存在按文件系统执行位或任何「可执行」标记决定能不能跑的分支 | [S-10](v2/contract.md#s-10-资源只被读取不因读取而运行)、[S-11](v2/contract.md#s-11-脚本集合) | 未开始 |
| SC-3 | 放行判断、可用性解析与装配的输入里不出现清单头的 `allowed-tools`、`compatibility`、`metadata`；列举资源的读面不读定义记录 | [S-5](v2/contract.md#s-5-键的四类处置)、[S-12](v2/contract.md#s-12-定义记录)、[S-16](v2/contract.md#s-16-由包得出的依赖声明) | 未开始 |
| SC-4 | 属性项推出规则只读包本身（不读持有方、所在格、时间、环境）；不产出 `disabled`、`usableBy` 与治理类的项 | [S-17](v2/contract.md#s-17-属性项投影规则) | 未开始 |

## 独立评审

| 项 | 值 |
|---|---|
| reviewer | spec-reviewer（只读） |
| 日期 | 2026-09-24 |
| 基线 | HUB `765b01dc`（批 R2a） |
| 处置 | 2026-09-24 修复波 1，候选期内原地改；标「主线处置裁定」的是主线在修复简报里的裁定，已收进 [D-060 §五](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)（K1～K50） |

| 发现 | 处置 | 落点 |
|---|---|---|
| X-1 产品依据 rev 落后（PF-002 16→20、PF-006 17→19、PF-003 4→5、PF-007 16→18） | **改**。逐 rev 复核：PF-002 rev 17 `usableBy` 八类共用（S-17 原已如此，G-2 措辞改「八类」）；**rev 19 删去 Skill 的「正文变体」「资源的取用方式」、写明系统不为这一类另规定设置项** ⇒ G-3 闭合、S-15 与设计依据改写；rev 18、20 无涉。PF-006 rev 18/19（多命令 flat、前台上限）与本契约所引 §4、§6.1、§6.4、§6.13 无涉。PF-003 rev 5（落在哪一层、血缘按层）不改「内容覆盖、配置不动」，S-19 不变。**PF-007 rev 17 §9.3 定了作者声明设置的生效值交给谁** ⇒ G-4 闭合、S-15 与 CS-4、CS-7 改写；rev 18 无涉 | 抬头、设计依据、S-15、S-17、CS-4、CS-7、G-2～G-4 |
| X-2 「设置项类别未知」报 `malformed`，工具侧报另一个值 | **改**（主线处置裁定）：新增 `setting_category_unknown`，与 `data.tool-definition` 同名同义；M12 删去「不在四值里」 | S-24（表、次序、说明三处）；examples 第 4、7、8 节各一行 |
| X-4 「目标环境」列在非词条清单（UL-target-environment 已存在）；「链接待合流后补」 | **改**：移出非词条清单，token 表链词条；删去那条对齐义务 | 二（token 表与非词条清单）；[对齐义务](#对齐义务) |
| X-5 CS-4 与 G-2 停在 asset-evaluation G-15（已关，答案在 S-39） | **改**：改指 `capability.asset-evaluation/v2#S-39`；CS-4 写成走得通 | CS-4、G-2 |
| X-6 依据只在任务区账本 | **改**：S18-a～e 改链 D-060（S9-c 只在 S18-e 里出现，一并引 S18-e）；「起草简报的账本」一律改写为「主线起草时所给的形状」 | 设计依据注表、S-2、S-3、S-10、S-12、S-17、S-18、S-21、S-25、G-1、G-2、G-5、G-6 |
| X-7 | 不适用：本契约没有「与哪几类共用」的说法 | — |
| K-1 `targetEnvironment`「默认是一个 TargetEnvironment」与 Schema 不要求 `default` 不一致，S-16 无定义 | **改**（主线处置裁定）：`default` 明写可选；没有默认且各层没配时，S-16 按没声明处理；Schema 不加 `required`。**本行处置已作废**：K12 随 [D-060 §四](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#四被推翻或被覆盖的项追加登记) 的 L3′ 作废，执行环境要求改为定义记录的固定成员 `environmentRequirement`、不是设置项（见[变化的影响](#变化的影响)修复波 1b） | S-15、S-16、第八节；examples 第 4 节一行 |

### 第二轮

| 项 | 值 |
|---|---|
| reviewer | spec-reviewer（只读），发现表 `tmp/assets-runtimes/reviews/r2-R2a.md` |
| 日期 | 2026-09-25 |
| 基线 | HUB `8ad37c50` |
| 处置 | 修复波 2，候选期内原地改；主线裁定见 [D-060 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)（M1～M29） |

| 编号 | 发现 | 处置 | 落点 |
|---|---|---|---|
| SP-1 | 「固定声明成员」各处引 D-060 §六 L3，而那一行原文是「删掉该保留项」；真正生效的 §四 L3′、§六 N-13 一处未引；成员名仍写「已报主线」 | **改**：设计依据注表、S-15、S-32、P-7、G-8、Schema 根 `$comment`、examples 第 4 节一行一律改引 [D-060 §四 L3′](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#四被推翻或被覆盖的项追加登记) 与 [§六 N-13](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)；成员名注「N-13 接受」、删「已报主线」；本文件修复波 1b 那一段改称 L3′ 并注明 §六 L3 已被取代。covers 的 PF-002 `#skill`、PF-006 `#64` 两条 note 同改 | 设计依据注表；[S-15](v2/contract.md#s-15-设置项声明)、[S-32](v2/contract.md#s-32-执行环境要求)、P-7、G-8；Schema；examples；`registry/covers.json` |
| SP-2 | S-11「第一段恰为 `scripts`」与 Schema `^scripts/` 对包根下一个叫 `scripts` 的文件给出不同答案 | **改**：S-11 写成「`path` 以 `scripts/` 开头（至少两段）」，明写只有一段的 `scripts` 不是脚本；examples 5.3 加一行变体 | [S-11](v2/contract.md#s-11-脚本集合)；examples 5.3 变体表 |
| SP-3 | 定义记录内容的几处列举漏了 `environmentRequirement`；K-1 行未注作废；examples 残留「账本 S18-d」 | **改**：§一、README、Schema `SkillPackage.description`、第八节 `definition` 行补上；K-1 行注「已作废（K12 随 L3′ 作废）」；账本标签改链 D-060 §S18 S18-d | §一；README；Schema；[第八节](v2/contract.md#八缺席怎么收)；上表 K-1 行；examples 第 3 节 |
| （M20，范围外 2） | `Skills()` 跑技能脚本时，工具自身 `targetEnvironment` 与技能 `environmentRequirement` 怎样合并 | **立缺口** [G-9](v2/contract.md#九已知缺口)（[D-060 §七 M20](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)，owner `Skills()` 契约那一程／PF-007）；CS-4 改为「技能这一侧走得通、落点的合成停在 G-9」；对齐义务那一行补指 | G-9；[CS-4](v2/contract.md#cs-4-skillsexec_script-跑一个脚本)；[对齐义务](#对齐义务) |

## 对齐义务

**这些是本契约与同批或上游契约之间要在整批对齐时处理的事**，不是本契约自己的证据义务；列在这里，免得散在各处被漏掉。

| 对齐什么 | 涉及 | 现状 |
|---|---|---|
| **技能名的词法** | `data.asset-model` v2 的 S-2（`CapabilityName`、`CapabilityId`） | **已落**（2026-09-24 整批对齐）：`SkillName` 与组合清单改为 `$ref` 那边 |
| **skill 类正文的外壳** | `data.asset-model` v2 的 S-10、S-12 | **已落**：那边的壳 `$ref` 本契约 `SkillPackage` |
| **设置项类别不认得报同一个值 `setting_category_unknown`** | `data.tool-definition` v2 S-26 | **已落**（2026-09-24 第一轮评审处置，两边同轮改） |
| **作者自声明设置的生效值交给谁**（PF-007 §9.3） | `Skills()` 的契约（尚未建立） | 本契约已写规则（[S-15](v2/contract.md#s-15-设置项声明)）；兑现待那份契约建立 |
| **同一违例两个名字**：正文里的名字与能力标识不一致 | `data.asset-model` v2 的 S-27 | **已统一**：那边原名携带本契约的 `name_mismatch` |
| **同一违例两个名字**：绑定层不在四值里 | `data.tool-definition` v2 的 S-26 | **已统一**：本契约原名携带那边的 `binding_layer_unknown`（修复波 1b 起落在 `environmentRequirement` 上，[S-24](v2/contract.md#s-24-表示层拒绝值与判定次序)） |
| **执行环境要求的形状与落地**：值取 `data.tool-definition` 的 `TargetEnvironment`；落地由跑它的那个工具按这份声明做 | `data.tool-definition` v2 S-11（形状）；`Skills()` 的契约（尚未建立）；工具执行运行时 | **已落**（[S-32](v2/contract.md#s-32-执行环境要求)，原 G-8 闭合）。那边改 `TargetEnvironment` 的形状，本契约同轮复核。**`Skills()` 自己的 `targetEnvironment` 与技能的 `environmentRequirement` 怎样合成 `exec_script` 的落点**，立为 [G-9](v2/contract.md#九已知缺口)（[D-060 §七 M20](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)），`Skills()` 契约起草时回答 |
| **「谁可以使用它」的共用定义** | `data.asset-model` v2 的 S-36；`data.mcp-endpoint`、`data.slash-command` | **已落**：八类共用 `usableBy`（主线裁定 2026-09-24，原为三类），本契约不再产出它；连接件的「能不能安装」即此项（`data.connector` 的 `install` 待主线收口改名） |
| **② 型展开的正文** | 斜杠命令的数据契约（第四波并行）、`data.content-blocks` v2 的 S-8 | 展开的就是 [S-8](v2/contract.md#s-8-正文逐字不展开不执行) 的 `body`，逐字、不展开；那边若另定「展开时替换占位」之类的规则，与本契约第 2 条相抵 |
| **工作区承载清单里指向技能包的 `source`** | `data.asset-model` v2 的 S-24、`capability.asset-evaluation` | 那个目录按本契约 [S-21](v2/contract.md#s-21-包的目录形式) 读；读入方留痕的形状归 asset-evaluation |

## 结果与反例

### 本地自检：Schema 正反实例（修复波 1b，2026-09-24）

**工具**：`jsonschema` 4.26.0（`Draft202012Validator` ＋ `referencing`，锁定 uv 环境），设计根下全部 `*.schema.json` 按 `$id` 登表；脚本在会话暂存区，不入库。
**输入**：执行环境要求改为定义记录固定成员 `environmentRequirement` 之后的 [`examples.md`](v2/examples.md) 第 1～5、7～9 节——第 1～4 节表格行按节绑定的 `$defs`（第 4 节设置项那张表包进 `{"format": 1, "settings": [...]}`）；`<1025 个 a>` 生成 1025 与 1024 两个真实的串；5.1～5.3 三个块与它们的全部变体行、第 7～9 节按行文逐条构造成 `$defs/SkillPackage` 实例（第 7 节 `name_mismatch`、第 8 节「不知道所属能力标识」两行需要上下文，按 5.1 本身过 Schema）。

| 预期通过 | 预期拒绝 | 不符 |
|---|---|---|
| 38 | 84 | **0** |

与上一次的 113 处不是同一份输入：设置项表里目标环境的五行换成一行普通设置、第 4 节加六行 `environmentRequirement`、5.3 与它的变体改写、第 7 节 `binding_layer_unknown` 一行改指新成员、第 8 节补一行（工具引用不合法先于类别不认得），构造口径也由本次脚本重定。
（同一轮里先按「删去执行环境要求」的中间稿跑过一次，112 处 0 不符；那份中间稿已被主线改判取代，结果不再适用。）**只判通过与拒绝**，同上一次一样不是 V-2 以后任何一条义务的证据。

### 本地自检：Schema 正反实例（整批对齐，2026-09-24）

**工具**：Draft 2020-12 校验器（`jsonschema`，按仓库 `uv.lock`），以对齐后整棵设计树的全部 Schema 建 registry；脚本在任务暂存区，不入库。
**输入**：[`examples.md`](v2/examples.md) 第 1～5、7～9 节——内联实例按节绑定的 `$defs`（第 4 节设置项那张表包进 `{"format": 1, "settings": [...]}`）；5.1～5.3 三个块；「在 X 上改动 Y」的变体行与第 7～9 节按行文构造；`"$ref": "TE"` 换成完整的串；`<1025 个 a>` 生成真实的串，另加 1024 个那一条（应通过）。

| 预期通过 | 预期拒绝 | 不符 |
|---|---|---|
| 34 | 79 | **0** |

**只判通过与拒绝**：给出的是不是「拒绝值」一列那个值（含 M 编号），校验器不回答。第 6、10 节不是 JSON 实例，不参与。**这不是 V-2 以后任何一条义务的证据。**

### 尚无的记录

V-2～V-9 **一条执行记录也没有**。手核只保证 `examples.md` 的实例与它们的标注在起草者眼里不互相矛盾，
**不支持**任何一条规范场景、任何一条跨成员约束的实现、任何一条消费者走查。

首次执行时在此记录工具与版本、环境、配置、输入范围、可复现步骤与原始结果位置；原始产物归 [record/evidence/](../../../record/evidence/README.md)。
记录时分开陈述：Schema 校验的结果、接收边界的拒绝值、文本与目录两种读法的结果、规范场景演练的结果、真实组合的符合性。

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建。**理由在[契约的性质一节](v2/contract.md#性质)末尾：
没有状态转移；结构约束由 Schema 的条件与条款直接表达；唯一的跨对象结构性质（组合图不得成环）要看别的资产，归装配。
**这不是把义务省掉**：它们被改写成了 V-1～V-9。本契约**不拥有任何进展性质**；`formal-tasks.json` 里没有、也不应有本契约的任务——**「未运行」如实登记**。

## 变化的影响

- **起草（2026-09-23）**：首版候选，建在 PF-002 rev 16、PF-006 rev 17、PF-003 rev 4 上（PF-007 rev 16 只引）；起点 D-034；开放格式钉 `69ef37e`。
  **依赖 `data.identity-values` v1**（已接受、已冻结）的 S-31——那一版不可原地改，**这条引用的目标不会漂移**。
  **依赖 `data.asset-model` v2、`data.content-blocks` v2、`data.tool-definition` v2**（都是 `candidate`，未冻结）：
  它们在评审或对齐中若改 `AttributeDeclaration`、`CapabilityId`、`MediaType`、`DependencyName`、`TargetEnvironment` 的形状，本契约随之变，须同轮复核 V-1 与 `examples.md` 第 11 节的手核。
  **偏离起草简报账本的五处**（不收 `resident?`、不收 `permissions?`、加 `body`、目标环境走 `settings` 里的保留项、定义记录的保留路径名留缺口）已报主线；主线改判任一处，本契约原地改并重跑 V-1、V-2。
- **2026-09-24 整批对齐（候选，未冻结，原地改）**：依据行写「主线裁定 2026-09-23，待产品负责人确认」的，出处在主线的裁定清单（账本 S18-a～S18-e、S9-c）。
  - **偏离账本的五处全采纳**（S18-a）；**G-1 闭合**：定义记录的保留路径 `.omne/skill.json`（S18-b，[S-12](v2/contract.md#s-12-定义记录)、[S-21](v2/contract.md#s-21-包的目录形式)、[S-9](v2/contract.md#s-9-资源条目与包内路径) 第 5 条）；**G-2 闭合**：「谁可以使用它」是 `data.asset-model` 保留的 `usableBy`，[S-17](v2/contract.md#s-17-属性项投影规则) 不再产出 `W`（S18-c）；**G-5 闭合**：作者自定义权限项不收（S18-a）。
  - **`ResourceEntry.executable` 删掉**（S18-d）：[S-10](v2/contract.md#s-10-资源只被读取不因读取而运行) 改成「资源只读」；带这一位即 `malformed`（M3）。**表示改变**：旧实例里每一条 `"executable": false` 都不再合法，已改写。
  - **`SkillName` 改为 `$ref` `data.asset-model` 的 `CapabilityName`**，组合清单每一项改为 `$ref` 那边的 `CapabilityId`；对 `data.identity-values` S-31 与 `data.content-blocks` S-20 的直接依赖随之去掉（经 asset-model 间接取得）。
  - **同一违例两个名字统一**：`name_mismatch` 由 `data.asset-model` S-27 原名携带；`targetEnvironment` 里绑定层不认得改报 `data.tool-definition` 的 `binding_layer_unknown`（本契约的集合由六个变七个，M13 随之收窄）。
  - **对证据的影响**：V-1 首次有了本地自检；V-5 的目录形式多了定义记录那一行；CS-4、CS-5、CS-7 走通（`self` 指谁停在 `capability.asset-evaluation` 的 G-15）。
- **2026-09-24 第一轮独立评审的处置（候选，未冻结，原地改）**：逐条见[独立评审](#独立评审)。
  **表示改变**：拒绝值七个变八个——新增 `setting_category_unknown`（与 `data.tool-definition` 同名同义），排在 `binding_layer_unknown` 之后、`malformed` 之前，M12 随之收窄；此前「设置项类别不在四值里」报 `malformed`，现在报新值。
  **语义改变**：`targetEnvironment` 的 `default` 明写可选，没有默认且各层没配时 S-16 按没声明处理；G-3、G-4 由产品正文闭合（PF-002 rev 19 删去两项设置；PF-007 rev 17 §9.3 定生效值交给谁），S-15 与 CS-4、CS-7 改写；「目标环境」链词条。
  **对消费者**：没有已采用的消费者，无迁移；`Skills()` 的契约建立时照 S-15 兑现生效值的交出。
  **证据**：新增的两行设置项实例（类别不认得、`targetEnvironment` 不带默认）已按 Draft 2020-12（`jsonschema` 4.26.0 按仓库 `uv.lock`，整棵设计树的 Schema 建 registry，脚本在任务暂存区、不入库）单独过 `$defs/SkillDefinitionRecord`：前者拒、后者过，与「Schema」一列一致；其余实例未改、未重跑。
- **[G-6](v2/contract.md#九已知缺口) 被裁决**（资源字节的摘要）：**表示改变**——接受前闭合则原地改并重跑 V-1～V-4，接受后闭合则**出 v2**。
- **[G-7](v2/contract.md#九已知缺口) 被裁决**：若收进内容，表示改变，同上。
- **开放格式出新快照**（研究列出的 issue #514、#350、#485 若合入）：本契约不自动跟随；要进来就出新版，V-1、V-4 重建。
- **跨进程演化启动**：V-8 从「无法演练」转为**必须演练**；[第五节](v2/contract.md#五装配给与协议给)右列从「待兑现」转为「须由协议兑现」，其中资源字节随版本走那一行离不开 G-6。
  **本版的全部证据只保留其单机范围，不得外推。**
- **（2026-09-24 整批对齐收尾，不改语义）**：「不拥有」与消费者表里「第四波并行」「同程并行」「下一版」的旧说法换成候选坐标（注册表、治理、求值、斜杠命令、资产模型），删去「此刻不在本工作树、不链接」那条注。
- **2026-09-24 同日稍后（不改语义）**：K 裁定收进 [D-060 §五](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) 之后，正文里标「第一轮独立评审的处置」的几处改链 D-060 §五（K6、K12）。

- **2026-09-24 修复波 1b（主线裁定 [D-060 §六](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加) L1，与 [§四](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#四被推翻或被覆盖的项追加登记) L3′、§六 N-13；候选未冻结，原地改）**：
  - **L3′（主线对 §六 L3 的改判，即本轮终态；§六 L3 那一行原文是「删掉该保留项」，已被 L3′ 取代）：执行环境要求由设置保留项 `targetEnvironment` 改为定义记录里的固定声明成员 `environmentRequirement`**（S18-a「作设置保留项」那一处被覆盖、K12 作废）。
    这一轮先按简报原文把保留项整个删掉，报回「与 PF-006 §6.4、PF-007 §6.2 原话冲突」后，主线改判为「恢复执行环境要求，但作为定义记录的固定声明、不是 PF-002 意义上的设置项」；下面只记终态。
    - 新 [S-32](v2/contract.md#s-32-执行环境要求)（号排在 S-31 之后，不重排）：值 `$ref` `data.tool-definition` 的 `TargetEnvironment`；不是设置项、各层配不了、推出规则不产出它、随内容覆盖；缺席即没有特殊要求；没有脚本不得声明（M14）；原样进依赖声明；落地由跑它的那个工具按它做，「满足」的判定沿 tool-definition G-5。**G-8 闭合。**
    - [S-15](v2/contract.md#s-15-设置项声明) 改名「设置项声明」（锚点随之变，包外没有链接指向旧锚点——已全树核过），写明没有保留项名、一项叫 `targetEnvironment` 的作者设置只是普通设置；S-12 成员由四个变五个；S-16 的执行环境那一项改读 `environmentRequirement` 的声明值（不再求值），依赖声明成为包的确定函数；P-7、P-8、CS-2、CS-4、CS-7、第八节、第十节同步。
    - 拒绝值仍是八个，`binding_layer_unknown` 改落在 `environmentRequirement` 上；M13、M14 编号沿用、改指新成员（不新发号）。对 `data.tool-definition` 的依赖仍是 S-9、S-11、S-18、S-26。
    **表示改变**：设置项里带定死形状的 `targetEnvironment` 那一项不再有特殊约束（它成了普通设置：旧 Schema 拒的「类别不是落点与身份」等写法现在收）；定义记录多一个可选成员 `environmentRequirement`（旧 Schema 拒、新 Schema 收），没有脚本却带它即拒。**语义改变**：执行环境要求各层不再能配值——原先的 `placement_identity` 设置可以由组织、租户改，现在只能随内容改（发新版）；依赖声明读声明值而不是求值结果。
    **消费者影响**：`capability.asset-registry` 按本契约 S-16 算技能可用性，执行环境一项改读声明值（它的正文只写「技能按 `data.skill-package` 的依赖声明」，不用改）；`capability.asset-evaluation`／`capability.asset-governance` 没有引用技能的目标环境（全树核过）；技能推出的属性项里不再有这一项（原先它是一项落点与身份类设置），它们按推出规则的产出求值、不按项名特判，正文不用改；`Skills()` 的契约尚未建立。
    **名字**：`environmentRequirement` 是规格层名字（无词条；[目标环境](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-target-environment--目标环境--target-environment)词条指工具的那项设置，不是它）；名字已由 [D-060 §六 N-13](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加) 接受。
    实例：第 4 节加六行 `environmentRequirement`（两通过、四拒绝），设置项表的目标环境五行换成一行普通设置；5.3 带上 `environmentRequirement`，四行变体改写；第 7 节 `binding_layer_unknown` 一行改指新成员；第 8 节两行改指新成员、补一行；第 11 节改写。**证据**：V-1 重跑，见[上文](#本地自检schema-正反实例修复波-1b2026-09-24)。
  - **L1**：S-8 与消费者表里指向 `data.content-blocks` S-8 的锚点改为 `#s-8-文本块与来路标记`；「`skill_body` 来源标记」改称「来路标记」（UL-origin-tag）并链词条。
  - catalog 的 tool-definition 依赖 clauses 仍是 `S-9`、`S-11`、`S-18`、`S-26`（中间稿曾去掉 `S-11`，改判后恢复）；covers：PF-002 `#skill` 补 `S-15`，PF-006 `#64-依赖声明与解析`、`#六项可选声明` 与 PF-007 `#62-skills通向任意技能` 改指 `S-32`。

- **2026-09-25 第二轮独立评审的处置（修复波 2；候选未冻结，原地改）**：逐条见[第二轮](#第二轮)。
  **表示不变**：Schema 只改两处描述文字；S-11 的措辞收到与 Schema 同一判据——原措辞「第一段恰为 `scripts`」会把包根下一个叫 `scripts` 的文件算成脚本，Schema 从来不算，**两个实现从此给同一个答案**（语义收紧到 Schema 已有的那一种）。
  **新缺口 G-9**（M20）：`Skills()` 跑脚本时两份执行环境声明的合成；CS-4 改为停在 G-9。**依据改链**：L3 → L3′、N-13（SP-1）。
  **对消费者**：没有已采用的消费者，无迁移；`Skills()` 的契约起草时须回答 G-9。
  **证据**：`jsonschema` 4.26.0（锁定 uv 环境，设计根下全部 Schema 按 `$id` 登表，脚本在会话暂存区、不入库）核了 5.3 与新加的一行变体——5.3 通过，把脚本换成包根下一个叫 `scripts` 的文件被拒（`contains` 那一条）；其余实例未改、未重跑。

结果不改写规范。发现语义问题回到来源设计（PF-002／PF-006／PF-003／PF-007、D-034），不在这里改契约。
