# 代码分解的形式理论：分解能否算对

**状态：调研材料。**本文是 [Map-Reduce 式交付推进](../README.md) 的依据，不是规则。标「未核」的结论使用前要复核。文中的「我们」指写作时采用这种交付做法的项目，文中的数值是当时的粗估或示例，不是阈值。

调研日期：2026-10-26。标「未核」的条目只取到摘要或二手转述，没有读到原文中的对应段落。

## 结论先行

分解的正确性分成两层，第一层能算，第二层只能部分算。

| 层 | 问的是什么 | 能否机器判定 | 依据 |
| --- | --- | --- | --- |
| 结构独立 | 两条线的写集是否相交；依赖图里有没有跨分区的边；契约改动在类型层面是不是只增不减 | **能**，而且可以在派发前算 | DSM 分区与 design rule hierarchy（[Wong et al. 2009](https://www.cs.drexel.edu/~yc349/papers/2009/ASE2009_drh.pdf)）；API diff 判定 semver 级别（[Elm](https://www.oreilly.com/library/view/why-elm/9781491990728/ch05.html)、[NoRegrets](https://cs.au.dk/~amoeller/papers/noregrets)、[cargo-semver-checks](https://github.com/obi1kenobi/cargo-semver-checks)） |
| 语义不干扰 | 合并后的程序会不会出现两条线单独都没有的行为 | **没有完备的机器判定**：现有方法要么保守（会误报冲突），要么 sound 但不完备；行为兼容还受 Hyrum's Law 限制 | [Horwitz, Prins, Reps 1989](https://research.cs.wisc.edu/wpis/abstracts/toplas89.abs.html)；[Sousa, Dillig, Lahiri 2018](https://www.microsoft.com/en-us/research/publication/verified-three-way-program-merge/)；[Hyrum's Law](https://www.hyrumslaw.com/) |

所以「合并冲突 = 分解错误」这个判据**既不必要也不充分**：

- 不充分：文本冲突常落在共享的登记文件上（barrel `index.ts`、lockfile、包清单），与语义边界无关。
- 不必要：[CodeCRDT](https://arxiv.org/abs/2510.18893) 让多个 LLM agent 在 CRDT 上并行写代码，600 次试验文本合并零失败，但作者初步估计仍有 5–10% 的语义冲突（未核）。[Brun et al. 2011](https://homes.cs.washington.edu/~mernst/pubs/vc-conflicts-fse2011.pdf) 也报告冲突不只表现为重叠的文本编辑，还表现为之后的 build 与 test 失败。

更好的判据是：**派发前把结构独立算出来作为准入条件，reduce 时按冲突类别计数，只有 build、test 与语义类冲突才归为分解错误。**

---

## 1. 模块化理论：什么样的分解让并行不冲突

| 理论 | 核心主张 | 对「并行不冲突」的含义 | 来源 |
| --- | --- | --- | --- |
| Parnas 信息隐藏 | 先列出「difficult design decisions or design decisions which are likely to change」，每个模块对其余模块隐藏其中一个。module 是「responsibility assignment rather than a subprogram」 | 模块边界按**变化的秘密**划，不按处理步骤划。Parnas 列出的第一条收益是「separate groups would work on each module with little need for communication」 | [Parnas 1972, CACM 15(12)](https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html) |
| Baldwin & Clark 的 design rules | 设计决策分成两类：visible design rules（接口、架构）和 hidden modules（模块内部决策，不影响别的模块） | **先冻结 visible rules，hidden modules 才能并行**。这正是我们「冻结共享契约 → 各线并行」的理论原型 | [Baldwin & Clark 2000 概述（BYU）](https://scholarsarchive.byu.edu/facpub/8944)；[realoptions.org 论文](https://www.realoptions.org/papers2009/8.pdf) |
| 六个 modular operators | splitting、substituting、augmenting、excluding、inverting、porting | 我们的「增量非破坏」大致落在 augmenting（新增模块或能力）；breaking 重构对应 splitting、inverting（把共用部分上提为 design rule） | [operators 综述（Clemson 讲义）](https://people.computing.clemson.edu/~johnmc/courses/cpsc875/resources/slides/c9.pdf)；inverting 与 porting 的原书定义未核 |
| Net option value（NOV） | 模块价值取决于 technical potential（σ）、独立试验的成本和该模块的 visibility；系统价值约等于各模块 NOV 之和减去建立模块化架构的成本 | （本文推论）visibility 高的模块（被很多模块依赖的契约）改动代价高，应当少改、先冻结 | [BYU 摘要](https://scholarsarchive.byu.edu/facpub/8944)；把 NOV 用到 Parnas KWIC 并与其结论一致：[Sullivan et al. FSE 2001](https://libraopen.lib.virginia.edu/public_view/q237hr920) |
| Conway 定律 | 设计系统的组织会产出复制其沟通结构的设计 | 分解与派发结构会互相塑造 | [Conway 1968, Datamation](https://en.wikipedia.org/wiki/Melvin_Conway) |
| Mirroring 实证 | 在所有配对产品中（配对数未核），松耦合组织做出的产品都明显更模块化；工作论文版报告变更传播潜力最多相差约 8 倍 | 组织（派发）结构会被代码结构复制 | [MacCormack, Baldwin, Rusnak 2012, Research Policy 41(8)](https://dash.harvard.edu/handle/1/34403525)（8 倍数字来自工作论文，未核是否与正式版一致） |
| Mirroring 综述 | 142 项研究：企业与行业层面普遍成立，但不是普适规律；开放协作项目（多为软件）大多不支持 | 开源项目能在高技术耦合下靠共享代码库和透明度协作，说明「零通信」不是唯一解 | [Colfer & Baldwin 2016, ICC 25(5)](https://dash.harvard.edu/bitstream/1/33785675/1/colfer,baldwin_mirroring-hypothesis.pdf)（具体百分比未核） |
| Socio-technical congruence | 用技术依赖算出的「应当协调」与实际协调的吻合度；吻合度高，开发更快 | 可以从依赖矩阵在派发前算出「哪两条线需要沟通」 | [Cataldo 等的综述引用](https://arxiv.org/pdf/2105.08198)（原文的效应数字未核） |

**小结**：理论上不冲突的分解满足三点：（a）共享决策全部提升为冻结的 design rule；（b）每条线只拥有 hidden 决策；（c）线与线之间在依赖图上没有边，只经由 design rule 相连。

## 2. 依赖与变更传播的形式

| 工具 | 形式 | 能算出什么 | 来源 |
| --- | --- | --- | --- |
| DSM 分区（partitioning）与 clustering | 依赖矩阵经强连通分量收缩后做拓扑排序，矩阵变成块下三角 | 对角块 = 必须同一人（同一线）做的耦合簇；块之间的序 = 必须串行的顺序 | [Sangal et al. OOPSLA 2005](https://groups.csail.mit.edu/sdg/pubs/2005/oopsla05-dsm.pdf)；DSM 分区算法源于 Steward 1981（未核） |
| Design Rule Hierarchy（DRH） | 从设计决策之间的 assumption 关系算出分层；同一层内的模块互相独立 | **同一层的模块可以并行**；跨层或模块内部的依赖要协调。Apache Ant 实证：同层不同模块的开发者沟通明显少于跨层的开发者 | [Wong, Cai, Valetto, Simeonov, Sethi, ASE 2009](https://researchdiscovery.drexel.edu/esploro/outputs/conferenceProceeding/Design-Rule-Hierarchies-and-Parallelism-in/991019167535304721)（全文抓取失败，细节以摘要为准） |
| Propagation cost | 改一个元素时平均受影响元素的比例（DSM 的传递闭包密度） | 衡量全局耦合；Mozilla 重构后低于 Linux | [MacCormack, Rusnak, Baldwin 2006, Mgmt Sci 52(7)](https://ideas.repec.org/a/inm/ormnsc/v52y2006i7p1015-1030.html)（该文是否用了「propagation cost」这个词未核，二手资料称 change cost） |
| Decoupling Level（DL） | 按 option theory 衡量系统能被分成多少小的、可独立替换的模块；不像 propagation cost 那样依赖文件数 | 在 108 个开源项目和 21 个工业项目上，DL 越高，缺陷和变更越局部 | [Mo, Cai, Kazman, Xiao, Feng, ICSE 2016](https://www.cs.drexel.edu/~yc349/papers/2016/icse2016-DL.pdf) |
| Build Systems à la Carte | 构建系统 = scheduler（按什么顺序执行）× rebuilder（是否要重建）。Minimality 的定义：「executes tasks at most once per build, and only if they transitively depend on inputs that changed」。Early cutoff：任务重算后结果不变，就不必再执行依赖它的任务 | 对 reduce 的启示：**reduce 是一次增量构建**。只重验传递依赖于本波变更的包（minimality）；契约包重新生成后 `api/` 快照字节不变，就截断下游重验（early cutoff）。静态依赖（Applicative）可以事先排序；动态依赖（Monad）只能边做边发现，所以写范围事先声明本质上是把依赖强制成静态 | [Mokhov, Mitchell, Peyton Jones, JFP 2020](https://www.microsoft.com/en-us/research/publication/build-systems-a-la-carte/)（定义引自 JFP 版第 2.1 节，非 ICFP'18 原文） |
| Impact analysis | 用源码依赖分析与可追溯性分析估计一次改动的受影响集合 | 与 DSM 传递闭包是同一问题；本次只核到书目与目录，正文未读 | [Bohner & Arnold 1996, IEEE CS Press](https://gov.wiley.com/WileyCDA/WileyTitle/productCd-0818673842.html) |

## 3. 合并的代数：什么条件下并行改动能无冲突合并

| 模型 | 合并的定义 | 无冲突的充分条件 | 局限 | 来源 |
| --- | --- | --- | --- | --- |
| 三路文本合并（diff3） | 对齐 base 与两个版本后逐块取改动 | 直觉上是「改动区域相隔足够远」 | 作者称其良好性质「rather delicate」，多个看似自然的直觉「incorrect in general」；主要结果是分析「well-separated 区域的编辑一定不冲突」这一直觉。成立的精确条件未核 | [Khanna, Kunal, Pierce, FSTTCS 2007](https://www.cis.upenn.edu/~bcpierce/papers/diff3-short.pdf) |
| Semistructured merge | 按语法树节点合并，顺序无关的声明自动合并 | 节点级不相交 | 24 个项目 180 个场景中，60% 的场景冲突减少，平均减少约 34%（数字取自书评，未对照原文） | [Apel et al. FSE 2011](https://www.se.cs.uni-saarland.de/publications/docs/FSE2011.pdf)；[书评](https://neverworkintheory.org/2011/10/22/three-empirical-studies-from-esecfse11.html) |
| Darcs patch theory | 补丁之间可以 commute（交换次序）就能合并；仓库是补丁的偏序集 | 两个补丁可交换 | Roundy 自述证明是「physicist」式的；早期版本在部分冲突上合并是指数级 | [Roundy 的理论文档](https://darcs.net/Theory/MergersDocumentation)；形式化：[Jacobson 2009, inverse semigroups](https://ww3.math.ucla.edu/camreport/cam09-83.pdf) |
| 范畴论补丁（Pijul） | 合并 = 两个共源补丁的 pushout；pushout 不一定存在，于是把文件空间补全为有限余极限，冲突本身成为合法状态 | 总能合并，冲突变成可以继续编辑的一等对象 | 只解决「合并成什么」，不判断语义 | [Mimram & Di Giusto 2013](https://arxiv.org/abs/1311.3903)；[Pijul 模型](https://pijul.com/model)；同伦类型论表述：[Angiuli et al. ICFP 2014](https://homotopytypetheory.org/2014/09/01/homotopical-patch-theory) |
| CRDT | 操作可交换或状态构成半格（join 满足交换、结合、幂等），副本收敛（strong eventual consistency） | 操作满足交换律 | 收敛 ≠ 正确，见 CodeCRDT | [Shapiro et al. SSS 2011](https://hal.sorbonne-universite.fr/inria-00609399v1) |
| 语义合并（program integration） | base 与两个变体的行为改动互不干扰时产出合并程序 | 两个变体改变行为的程序切片不相交 | 保守：会把部分可合并的改动判为干扰（后续算法改进了这一点） | [Horwitz, Prins, Reps 1989, TOPLAS 11(3)](https://research.cs.wisc.edu/wpis/abstracts/toplas89.abs.html) |
| 验证式合并 | 定义 semantic conflict-freedom：合并结果不引入新的不想要的行为；用关系推理验证 | 验证通过 | sound 但不完备，在 52 个真实场景上评估 | [Sousa, Dillig, Lahiri, OOPSLA 2018](https://www.microsoft.com/en-us/research/publication/verified-three-way-program-merge/) |
| 冲突最少的任务排期 | 把潜在冲突编码为约束，求解冲突最少的开发顺序 | 排期避开冲突 | 在 4 个开源项目上可避免多数冲突（冲突率数字两处来源不一致，未核） | [Kasi & Sarma, ICSE 2013](https://digitalcommons.unl.edu/cseconfwork/275) |

关于需求里的「Jónsson 等」：本次没有检索到这位作者的补丁理论论文。与 Darcs commutation 最接近的形式化工作是上表的 Jacobson 2009。需求所指是否就是它，未核。

**与我们规矩的对应**

| 我们的规矩 | 对应的代数条件 | 差距 |
| --- | --- | --- |
| 写范围两两不相交 | 写集不交 ⇒ 补丁平凡可交换，文本合并必然成功 | 只保证文本层面。读集与写集相交（A 读 B 写的符号）就可能产生语义干扰，这正是 Horwitz 等用切片判断的部分 |
| 契约只做增量非破坏改动 | 契约构成单调格：多条线各自加字段、加导出，其 join 仍是各自版本的上界，满足交换、结合、幂等，类似 state-based CRDT | 两条线新增**同名**导出或同名可选字段（但类型不同）时 join 不存在，需要命名空间所有权 |
| 冻结基线、reduce 串行合并 | 所有补丁共源（相同 base），合并顺序无关 | 共享登记文件（barrel、`package.json`、`pnpm-lock.yaml`）是所有线的写集交点，按目录划写范围时它们必然冲突。可以用生成或按语法节点合并消掉 |

## 4. 契约演进的类型论视角

| 概念 | 形式 | 对可加性判定的含义 | 来源 |
| --- | --- | --- | --- |
| Behavioral subtyping | 子类型必须保持对父类型证明过的性质：前置条件不加强，后置条件不减弱，不变式保持 | 「新版契约 <: 旧版契约」就是非破坏。类型层面：输入逆变（可以放宽），输出协变（可以收窄） | [Liskov & Wing 1994, TOPLAS 16(6)](https://www.cs.columbia.edu/~wing/publications/LiskovWing94.pdf) |
| TypeScript 的 variance | `strictFunctionTypes` 下函数参数逆变，但**方法签名的参数仍是双变**（bivariant），以保持 `Array<T>` 等类型大致协变；4.7 起可以用 `in`/`out` 标注 | TS 编译器本身判断不出方法参数的收窄。用 `tsc` 的可赋值性检查新旧 API 时，方法参数方向要另外处理 | [TS 2.6 发布说明](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-6.html)；[PR #48240](https://github.com/microsoft/TypeScript/pull/48240)（`in`/`out` 的 4.7 版本号取自 PR 与第三方教程，未核官方发布说明） |
| Semver 的形式语义 | 「MUST declare a public API」；minor =「new, backward compatible functionality」；major =「backward incompatible changes」 | semver 只对**声明的** public API 有意义；兼容是关于子类型的命题，不是关于字节的命题 | [semver.org](https://semver.org/) |
| Hyrum's Law | 「With a sufficient number of users of an API, it does not matter what you promise in the contract: all observable behaviors of your system will be depended on by somebody.」 | 行为兼容没有机器 oracle；可观察行为都有可能成为隐性契约 | [hyrumslaw.com](https://www.hyrumslaw.com/) |
| 强制 semver（Elm） | 编译器比较新旧公开 API 的类型：不变 → patch，只加 → minor，改或删 → major | 类型层面可以完全自动；但签名不变的行为改动会被判为 patch | [Why Elm 第 5 章](https://www.oreilly.com/library/view/why-elm/9781491990728/ch05.html)；[Elm Discourse](https://discourse.elm-lang.org/t/semver-enforcement/9263) |
| 实测 | Maven Central：20.1% 的非 major 版本含 breaking change，但只有 7.9% 的客户端真的受影响 | 「破坏」应按真实消费者衡量，不只看 API diff | [Ochoa et al. EMSE 2021](https://arxiv.org/abs/2110.07889) |
| 基于客户端的判定 | 用客户端测试学习库 API 的类型模型，比较前后版本；12 个库上至少 90% 的更新分类正确，并在 minor/patch 更新里找到 26 个 breaking change | 动态类型下也能半自动判断，但依赖客户端覆盖 | [Mezzetti, Møller, Torp, ECOOP 2018](https://cs.au.dk/~amoeller/papers/noregrets) |
| 工具盲区 | cargo-semver-checks 看不到 manifest 级改动和跨 crate 再导出的条目；超过 90% 的误报来自跨 crate 条目 | 快照必须覆盖再导出与包清单，否则既有误报也有漏报 | [Rust 项目目标页](https://rust-lang.github.io/goals/2025h1/cargo-semver-checks.html) |

**可判定边界**（以 TypeScript `api/` 快照为对象）：

| 改动 | 机器能判吗 | 判定方式 |
| --- | --- | --- |
| 新增导出、新增类型、新增可选输入字段、新增输出字段 | 能，判为可加 | 快照 diff 只有新增；新旧声明可赋值性检查 |
| 输入类型放宽（联合类型加成员，作为函数参数） | 能 | 参数逆变检查；注意方法签名双变 |
| 输出类型收窄 | 能 | 返回值协变检查 |
| 删除导出、新增必填输入字段、输入收窄、输出放宽 | 能，判为 breaking 并拒绝 | 可赋值性检查失败 |
| 枚举或判别联合在**输出**位置增加成员 | 类型上像「放宽输出」，判为 breaking；但常被当作可加 | 需要政策决定：消费方的穷尽 `switch` 会坏 |
| 签名不变、行为改变（默认值、错误语义、顺序、时序） | 不能 | 只能靠行为测试、消费者测试和人工判断（Hyrum） |
| 同一波内两条线新增的符号重名 | 能 | 合并前对各线的快照新增集求交集 |

## 5. 工作切分的粒度

| 发现 | 含义 | 来源 |
| --- | --- | --- |
| 分布式工作项完成时间约为同址工作项的 2.5 倍，主要因为涉及的人更多 | 跨线协调本身有乘数级成本，零通信并行的收益是真实的 | [Herbsleb & Mockus 2003, IEEE TSE](https://www.st.cs.uni-saarland.de/edu/empirical-se/2006/PDFs/herbsleb03.pdf)（卷期未核） |
| 远程协作成败取决于 common ground、coupling of work、collaboration readiness、technology readiness；紧耦合工作难以远程完成 | 线与线之间应当只有松耦合（经冻结契约），紧耦合部分放进同一条线 | [Olson & Olson 2000 "Distance Matters"](https://en.wikipedia.org/wiki/Judith_S._Olson)（期刊卷期与 coupling 的原文定义未核） |
| 案例研究：意外的协调问题来自分工边界；好设计的本质是便于开发者之间的协调 | 分工边界应当与设计边界重合 | [Herbsleb & Grinter, ICSE 1999](https://flosshub.org/node/108)（只取到二手摘要） |
| 前沿 agent 能以 50% 成功率完成的任务长度（按人类耗时计）约每 7 个月翻倍；o3 发布时约 110 分钟；不到 4 分钟的任务接近全部成功，超过 4 小时的任务成功率低于 10%（二手转述） | agent 实施者的切片应当落在其可靠时间范围内；超出时成功率陡降 | [Kwa et al. 2025 (METR)](https://arxiv.org/abs/2503.14499)（作者自己提示了外部效度的限制） |
| 多 agent 在 CRDT 共享工作区并行：有的任务快 21%，有的慢 39%；后续工作认为收益来自显式协调（文件认领、广播），不来自并行本身 | 写集不交 + 认领机制比无协调并行更关键 | [CodeCRDT 2025](https://arxiv.org/abs/2510.18893)；[AgentRoom 2026](https://www.alphaxiv.org/abs/2608.23740)（未核） |

「可独立验证的最小单元」没有统一的学术定义。可操作的判据是：**单元能在只依赖冻结基线的条件下独立通过自己的 gate**。这与 DRH「同层模块只依赖上层 design rule」是同一个条件。

## 6. 对我们怎么用、量什么

| # | 建议 | 可测指标 | 依据 |
| --- | --- | --- | --- |
| 1.1 | 派发前在冻结基线上算 DSM 或 DRH，把写范围从「目录」改为「DRH 同层的模块集合」。目录只是写范围的表示，分区由依赖图决定 | 派发时各线之间的依赖边数（同一波内必须为 0，只允许经由冻结契约包）；同层判定与人工分解不一致的次数 | Wong et al. 2009；Baldwin & Clark |
| 1.2 | 把「visible」模块（入度高的契约包）列为本波冻结项，按 NOV 思路少改 | 契约包入度排名；每个里程碑 breaking 改动落在高入度包上的次数 | Baldwin & Clark NOV |
| 1.3 | 按里程碑跟踪全局耦合 | Decoupling Level 或 propagation cost 的里程碑趋势（应当不降或不升） | Mo et al. 2016；MacCormack 2006 |
| 2.1 | 派发前用 socio-technical congruence 预测冲突：协调需求 = (线 × 文件) · DSM · (文件 × 线)ᵀ，非对角元非零即预测需要协调 | 预测冲突与 reduce 实测冲突的 precision、recall | Cataldo 等（该矩阵公式出自 Cataldo 2006 CSCW，未核） |
| 2.2 | reduce 当作增量构建：只重验传递依赖于本波变更的包；`api/` 快照字节不变就截断下游 | reduce 重验的包数 ÷ 全量包数；early cutoff 命中率 | Build Systems à la Carte |
| 3.1 | reduce 时把冲突分成四类：文本、build、test、语义潜伏（合并后行为测试才暴露）。只有后三类算分解错误；共享登记文件上的文本冲突单列为「基础设施冲突」，用生成或按节点合并消掉 | 每波每类冲突数；「分解错误率」=（build + test + 语义）冲突的线对数 ÷ 线对总数；基础设施冲突占文本冲突的比例 | Brun et al. 2011；Apel et al. 2011；CodeCRDT |
| 3.2 | 写集不交之外再检查读集与写集：A 线读取（import）的符号若被 B 线改动，则两线不独立 | 跨线「读—写」交点数（应为 0；只允许读冻结契约） | Horwitz, Prins, Reps 1989 |
| 4.1 | 按第 4 节的可判定边界表做机器分级：可加、breaking、需要人。机器只放行「可加」，输出位置的枚举扩展与签名不变的行为改动一律交人 | 每波契约 diff 被自动分级的比例；reduce 后才发现的「假可加」数（应为 0） | Liskov & Wing；Elm；Ochoa et al. |
| 4.2 | 合并前对各线快照的新增集求交，拦住同名新增 | 同名新增碰撞数 | 契约单调格的 join 条件 |
| 4.3 | 快照覆盖再导出和包清单（`exports`、peer 依赖），避免 cargo-semver-checks 式盲区 | 快照未覆盖、但实际可被导入的符号数 | Rust 项目目标页 |
| 5.1 | 切片大小对齐 agent 的可靠时间范围，并以「只依赖冻结基线就能独立过自己的 gate」作为可验证单元的判据 | 需要二次派发的切片比例；从派发到过 gate 的时间分布；单切片改动文件数与成功率的关系 | METR 2025；Herbsleb & Mockus 2003 |
| 5.2 | 紧耦合工作放进同一线，不拆给零通信的两线 | 同一 DSM 对角块被拆到不同线的次数（应为 0） | Olson & Olson 2000；DSM 分区 |

**一句话**：结构独立（写集与读集不交、DSM 跨线零边、契约在类型层面单调）可以在派发前机器算出并作为准入；语义不干扰没有完备的机器判定（现有方法保守或不完备），只能靠行为测试与人工兜底。所以「冲突即分解错误」应当改为「build、test 与语义冲突才是分解错误」，并按类计数。
