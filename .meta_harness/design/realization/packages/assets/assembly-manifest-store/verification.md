# assembly-manifest-store 验证与证据

下列至「独立评审 N6」保留 v2 原义务和当时状态；本次 candidate 的采用范围、差异与新增义务在末尾 [v3 增量](#v3-候选增量的证据义务)。旧四操作没有因新增 readEvaluation 被缩减，旧评审不等于新设计已评审。

契约侧的证据义务权威在 [`spec/capabilities/assembly-manifest/verification.md`](../../../../spec/capabilities/assembly-manifest/verification.md)：本版不建形式工件（契约 S-25），证据全部是六条规范场景与故障注入，其中 S-26 必须是真并发。
本页按本节点的兑现点登记，再加**本节点自己的选择**带来的义务（按会话哨兵、`owned_ref` 唯一索引、随机铸引用、在场事实作配置）。**本节点尚未建包，一切未开始。**

**共同前提**：跑在 `infra/storage-sql` 的 sqlite 临时文件库上（D-026 不提供 in-memory）；pg 那一半只在 `OMNE_TEST_PG_URL` 可连时跑，**跳过不是通过**。在场事实由测试种子给——S-31 记「**有前提：测试种子给在场事实**」（[D-060 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-35 ①）。

## 证据义务

### 契约的规范场景（六条，全部未开始）

| 场景 | 在本节点上怎样跑 | 状态 |
|---|---|---|
| [S-26 条件追加：两路并发恰一路成](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-26-条件追加两路并发恰一路成) | **两个存储实例**（同一库文件；pg 上两条连接）各起一个闭包，同时以 `expectedHead: 3` 追加，写事务里在判定与插入之间 `await` 让出。故障注入支：拿掉哨兵**并**拿掉主键（判定拆成「先读头、再写」）——**必须出现两条序号 4** | 未开始 |
| [S-27 装配那一次的回执丢了](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-27-装配那一次的回执丢了) | 子进程提交之后、回执之前被 `SIGKILL`；重开同一库文件后同参数重交；另一会话以同一引用 `given`。**前提**：子进程在第一次受理之前已走完存储升级确认（否则重开时快照恢复，那一次提交随之消失，场景失败不是本节点的错）；这一前提已由 [cli 升级确认在第一次受理之前](../../../apps/cli/design.md#升级确认在第一次受理之前) 承接（据点清单 A-28，产品与验收装配同一时点：全部 fiber `ACTIVE` 之后 `guard.confirm()`，确认之后才开闸；证据义务 `assembly.upgrade-confirmed`，名候选，归 cli 节点）；测试不经那个 `boot` 自搭存储时须自己先确认（AMS-5） | 未开始 |
| [S-28 按表时刻读回历史](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-28-按表时刻读回历史) | 演练 | 未开始 |
| [S-29 头与各类最后一条出自同一刻](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-29-头与各类最后一条出自同一刻) | 一个实例持续追加、另一实例反复 `readHead` | 未开始 |
| [S-30 读不到不是没有](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-30-读不到不是没有) | 故障注入：交给闭包一个读写一律抛 `StorageUnavailable` 的存储包装；恢复之后按 S-22 分清 `append` 上次写没写下 | 未开始 |
| [S-31 在场判定三种答](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-31-在场判定三种答) | 测试种子作 `presenceSource` | 未开始 |

### 本节点自己的选择带来的义务

| # | 义务 | 证据形式 | 状态 | owner 与闭合条件 |
|---|---|---|---|---|
| V-1 | **两个会话同时以同一引用 `given`**（[关键选择一](design.md#关键选择)第三条交错）：恰一个成，另一个 `evaluationRefConflict`；表里 `owned_ref` 只有一行 | 真并发演练（pg 上才会走重判路径；sqlite 上由库级写锁串行，走直判） | 未开始 | 本节点；pg 那一支待 `OMNE_TEST_PG_URL`（AMS-6） |
| V-2 | **哨兵是序列化点、主键是兜底**：只拿掉哨兵 ⇒ 两路仍恰一路成（后者撞主键、重判得 `headMismatch`）；重判路径上的判定次序与直判相同（构造同时命中 `recordNotFound` 与 `headMismatch` 的输入） | 故障注入，pg | 未开始 | 本节点（AMS-6） |
| V-3 | 在场事实：没有 `presenceSource` ⇒ `unavailable`；来源答读不到 ⇒ `unavailable`；快照缺一个名字 ⇒ `unavailable`，**不是**部分答复或 `absent`；来源抛出 ⇒ 缺陷上抛 | 单元测试 | 未开始 | 本节点 |
| V-4 | **静态检查**：本包没有对两张表的 UPDATE／DELETE；服务对象恰是契约的四个方法，没有写在场事实的方法；产品据点清单里本插件的配置不带 `presenceSource` | 结构检查（`tools/ts-checks` 候选规则，带故意违反即失败的自测）＋ 据点装配的清单检查 | 未开始 | 本节点 ＋ ts-checks owner ＋ 据点装配 |
| V-5 | **原样存**：超出 ±2^53 的整数、长小数在 `composition` 与 `content` 里原样读回；交来的值不是合法 JSON 值 ⇒ `invalidInput`；表里一行 JSON 文本被改坏 ⇒ 缺陷上抛，不折成 `unavailable` | 单元测试 ＋ 演练 | 未开始 | 本节点 |
| V-6 | `CHECK` 兜底：测试直接写一条 `reuse` 却带 `owned_ref` 的行 ⇒ `StorageDefect`；删记录行而表行还在 ⇒ `ReferenceViolation` | 演练 | 未开始 | 本节点 |
| V-7 | **铸引用**：十万次 `mint` 两两不同；注入一个撞既有引用的铸号器 ⇒ 缺陷上抛、表不变，**不**静默复用 | 单元测试 ＋ 故障注入 | 未开始 | 本节点 |
| V-8 | **公开函数面**：不装 Cordis，`judgeManifestAppend` 的五道次序（构造同时命中多道的输入，`alreadyRecorded` 先于 `headMismatch`）；`answerPresence` 的整次 `unavailable` | 单元测试 | 未开始 | 本节点；有实现即可跑 |
| V-9 | **与注册表互指的两条**：注册表节点 N-2（两个写入者撞条件追加）、N-9（被顶替快照的留存）在本节点上跑，不用测试替身 | 演练（随注册表节点） | 未开始 | 本节点 ＋ 注册表节点（R-M1、R-M9） |

## 实际执行

**无。**

## 覆盖缺口

- **全部条款没有任何实现证据**。
- **在场事实在产品装配里没有任何证据可取**（design AMS-2）：唯一能跑的是验收里的测试种子。
- **派发器读链与模型请求运行时读求值结果**（契约 G-4、design AMS-3）不在本节点的证据范围：本节点只证「原样存、原样交回」。
- **断电与升级恢复**（AMS-4、AMS-5）不在任何演练里：断电测不出；升级恢复那一半由「开闸在确认之后」挡住，已由 [cli 升级确认在第一次受理之前](../../../apps/cli/design.md#升级确认在第一次受理之前) 承接（据点清单 A-28，产品与验收装配同一时点：全部 fiber `ACTIVE` 之后 `guard.confirm()`，确认之后才开闸；证据义务 `assembly.upgrade-confirmed`，名候选，归 cli 节点）——本节点这里没有演练，演练归那条义务。
- 契约 S-21 右列（协议须给）本节点一条都不兑现。

## 独立评审

### 独立评审 N6

architecture-reviewer 对本节点的独立只读评审（N6，2026-09-25），无阻断项。下表是起草者对归本节点各项的处置；**处置不等于评审方复核通过**，复核与接受另行。

| 编号 | 发现 | 处置 | 落点 |
|---|---|---|---|
| A-3 | AMS-5 的「开闸在升级确认之后」写成由据点装配承接，而 session-log-jsonl 那一侧的承接引用有误（M48 A-1 讲撤除次序） | 改：AMS-5 末列、「归装配的事项」、「报给主线」改引与 SLJ-2 同一前提 [cli 升级确认在第一次受理之前](../../../apps/cli/design.md#升级确认在第一次受理之前)（A-28）——cli 节点随后写出了这一时点，前提已有承接者；S-27 场景写明「第一次受理之前已走完升级确认」这一前提 | [缺口](design.md#实施缺口与消费者影响) AMS-5；design「归装配的事项」段；本页 S-27、覆盖缺口 |

A-4、B-5（cli 验收装配表）与 B-1（主线）不归本节点，本节点未动。

## v3 候选增量的证据义务

对应 [v3 设计](v3-design.md)与 `capability.assembly-manifest/v3` S-1～S-35、AE4 S-47；精确依赖接受状态以 [registry catalog](../../../../registry/catalog.json) 为准，本节点仍为 candidate。**源包尚未建立，本节全部未开始，新增绑定 0 条。** 不用同源对象恒等或自指 TypeOK 代替可失败断言；本节点不新增形式工件。文档检查仅检查结构和引用。

### 原义务的保留与影响

| 原义务 | v3 中的范围 |
| --- | --- |
| S-26 | 保留真实双实例条件追加及拆判定/写入负控；新读面不得改变写入序列化 |
| S-27 | 保留提交后回执前杀进程、given 认回与跨会话冲突；ME-5 补新读面重开 |
| S-28 | 保留按表时刻的三条历史；reuse 的旧表引用不随最新已提交求值读面被改写 |
| S-29 | 保留 readHead 一致性；ME-2 另验 readEvaluation 的同视图和提交上界 |
| S-30 | 保留旧三操作 unavailable；ME-3/4 补新读面的缺源、畸形与不可读分支 |
| S-31 | 保留三态在场测试及测试种子前提；不声称补齐产品来源 |
| V-1 | 保留跨会话 given 全局唯一的真并发；新读查询必须保留 session 限制 |
| V-2 | 保留哨兵、主键与重判次序；pg 路径缺环境仍是未验 |
| V-3 | 保留 presenceSource 无来源、缺项与抛错分支 |
| V-4 | v2 四方法检查保持原坐标；v3 结构检查为**恰五方法**，无新写在场面，无 UPDATE/DELETE，产品 presenceSource 限制不变 |
| V-5 | 保留旧读写的严格 JSON 与损坏内容缺陷分支；新增 readEvaluation 的无法无损解码按 v3 S-32 返回 unavailable，不能把该差异倒灌旧四操作 |
| V-6 | 保留 CHECK、外键与错误分类；不以坏数据 fixture 合法化本应被约束阻止的写入 |
| V-7 | 保留 mint 抽样及注入撞号；十万次不同只说明该样本，不证明随机铸号绝对唯一 |
| V-8 | 保留独立纯判定与优先级；ME-3/4 补不装 Cordis 的投影函数 |
| V-9 | 保留真实 registry 并发与历史快照；ME-7 增加真实 AE4/registry3 生产内容校验 |

### 新增验证（全部未开始）

共同前提：精确依赖与本节点经各自采用后，在 `infra/storage-sql` 的真实 sqlite 临时**文件库**跑；跨实例不是两个独立库。需要 pg 语义的分支明确要求可连实例，不能将跳过记成通过。装配在第一次受理之前完成迁移/升级确认。测试分别保留真实生产者用例与损坏 fixture 用例，后者只覆盖读错误处理，不冒充合法业务路径。

| # | 条款与实际演练 | 必须可失败的断言 / 范围 | owner |
| --- | --- | --- | --- |
| ME-1 | S-33/S-34：真实 E1/O1 以 given 提交六表；局部 reload 以 mint 提交根设置不同的 E2/O2；另一旧表以 reuse E1 收窄；再提交 E3 | 三次读分别为 E1、E2、E2；下一次新求值才变 E3。返回的 ref/求值/序列全属于选定源。readHead 与旧表历史仍保留 reuse E1；按 filledAt 选源、沿 reuse 引用回退、读取 reuse 自身内容的变异实现均须失败 | 本节点 + registry/AE owners |
| ME-2 | S-33/S-34：两真实存储实例协调屏障，在读者固定 head 与选源之间提交新求值；重复读并核所记录事务上下界 | 当前读只能给固定上界内的同一个源，下次读可见新源；不能拼两个源或越过 head。记录 ReadTx 真正取得/释放。负控为拆读并去掉上界、混拼三个返回成员；**只拆事务但保留上界在只增数据集上未必错**，不把它绑定为必失败证据 | 本节点 + storage owner |
| ME-3 | S-32/S-33/S-35：可读空头、非法 session；合法 JSON 的非对象/缺槽位/非法完整求值；逐一破坏 AE4 S-47 五类闭合 DTO、必需/可选类型及七组结果内关系，同时保留开放 JSON value 与合法非空 unresolved 正例；序列缺失/重复/额外项/根混入；先有合法 E1 再写畸形 E2 | 原 append 仍成功原样存，旧读面照旧；新读面非法输入为 invalidInput、空头为 recordNotFound、最新源畸形为 unavailable{reason: invalid_evaluation_content}，不跳过 E2 回 E1。内容加写方自有第四项仍可投影，嵌套 DTO 未知成员则拒绝；任意设置对象的 allowed 成员不能触发权限校验。强行 exact-three、只验根值或忽略结果内关系的变异必须失败 | 本节点 |
| ME-4 | S-11/S-32/S-33：超出 ±2^53 的整数、长小数、布尔与数值区别、重复键/非法 JSON；显式制造无同会话源的坏持久 fixture，再让另一会话存在合法源；必要读失败 | 无损值精确相等，投影不重排。输入非法仍 invalidInput；新读面持久内容无法严格解码为 unavailable，已判槽位非法带指定 reason；确定无源才 recordNotFound，不跨会话兜底。StorageUnavailable 不变空结果；无关程序/存储结构缺陷不被错误 catch。实际消费 AE4 公共制品的 judgeEffectiveAssembly，不复制 schema；布尔 false 必须映射指定内容失败，真实合法结果全部成员无删改交回。以恒 true 替身绕过该构件的负控须被非法内容用例检出 | 本节点 + core/asset-evaluation owner |
| ME-5 | S-12/S-13/S-22/S-24/S-33：真实子进程在记录行已写但目标表尚未写完、提交前杀死；另支提交后回执前杀死；重开同一文件库，继续 append/readEvaluation | 提交前整条不可见，提交后求值与目标表同时存在；given 可认回，mint/reuse 仍按旧未知结果规则。重开还原 E1→E2→reuse E1 后，新读面是 E2；读历史仍 E1。**这里是 SQL 事务恢复，不截断/修复 SessionLog JSONL，也不声称断电不丢** | 本节点 + storage owner + apps/model-request-acceptance |
| ME-6 | S-23/S-33：真实 Cordis 4.0.4 换 storage/撤 fiber，同时阻塞一个已进入的 ReadTx/WriteTx；直接闭包另跑同存储场景；调用方取消等待后释放屏障 | 旧实例关闭准入后新到 unavailable；在途按其原事务实际结束，取消不等于释放，不重执行 append。验证文件/连接/事务引用实际收口、无自建追尾器泄漏；新实例从持久记录读。重载不伪造回滚或成功；provide 纳管前提通过真实宿主核对 | 本节点 + storage/kernel owners |
| ME-7 | S-32/S-35；registry3 S-48～S-50：真实 Agent Definition 已发布版本读取 → AE4 evaluate → registry fill/reload → 本节点读回；未提交新结果时再读；当前输入验收另经 S-66 真实提供者 | 每条 producer content 恰 evaluation/compositionOrder/filledBy；完整结果和显式序列与真产物相等，表与内容单次提交，失败不留下半份。新已提交结果可读，未提交变化不可冒充已提交；合法缺项不补值。S-47 单参判定通过不证明源/权限；当前层设置的新鲜输入与缺时限零出网由 S-66 的独立用例验证，不能从本历史读面或本用例代证 | core/agent-definition、core/asset-evaluation、tools/asset-registry、model-request-runtime owners；apps/model-request-acceptance 组合 |
| ME-8 | SYS-OBSERVABILITY C1～C7：正常、空头、畸形源、存储不可读、取消请求/实际结束、重开、诊断端口失效 | 记录阶段/会话/提供者修订/head/选定源及结果，可区分拒绝、未知和实际结束；无求值 payload/秘密值，无猜测租户。观测丢失有独立可见状态，不能改写业务成功或替代清单事实；有界诊断配置由装配提供 | 本节点 + apps/model-request-acceptance 观测 owner |

### 覆盖缺口与受阻消费者

- **AMS3-1**：本节点候选未接受、源包未建立，全部新旧实现证据待做；依赖状态查 catalog。阻塞 registry 与模型纵线验收装配的正式采用，不能凭本稿称五操作已交付。
- **AMS3-2**：S-32 → AE4 S-47 → 公共 judgeEffectiveAssembly 的设计表达已对齐；实现、精确公开制品消费、完整五类 DTO/开放值槽/结果关系及本节点 false 映射尚待 ME-3/4。禁止复制 schema、仅断言类型或把结构通过当源/权限证明。
- **AMS3-3**：S-32/S-35 求值真实性与 registry S-48 exact-three、同次提交由真实生产链证明；孤立合法 JSON fixture 不足以关闭。
- **AMS3-4**：S-21 身份/租户核实、同库单属主、升级确认归 `apps/model-request-acceptance`；原 `apps/cli` 的历史接受不自动覆盖新应用。新装配尚无本节点组合运行证据。
- **AMS3-5**：实际 Cordis/存储撤除与观测故障未验，阻塞运行期换代/取消和诊断完备的声明。basis 与 core 已有测试只支持其原范围。
- 原 AMS-1/2/4～10 保留；新增读面不关闭完整 PF-004、产品在场来源、自动选模或分布式协议缺口。S-33 读取已提交求值与运行时当下层配值现读是两项责任；本节点不替后者作保证。

### 本次执行状态

2026-09-27，rev 2 对齐 AE4 S-47 公共结果判定及 registry 状态引用后，本次实际运行 `.venv/bin/python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal registered --gate internal`，退出 0，输出 `PASS: design tree /data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime/.meta_harness/design passed gate=internal; formal=registered.`。登记的 formal task 均报告 `registered; execution was not requested`。本节点 `git diff --check` 通过；旧 `design.md` 与 HEAD 无差异。

没有实现测试、真实 IO 或本节点 formal run。通过只表示该次静态检查范围，候选成稿不构成独立评审、接受或实际验证。

## v4 候选增量的证据义务

本节对应 [v4-design.md](v4-design.md) 的 MG-1～8、R-AMS4-1～5 与 MF4 S-1～S-37，另对接 AR4 S-51/S-52。MF4/AR4 已登记 candidate，节点增量未采用。**MG-V1～12 全部未执行，新增绑定 0 条；已有源码及旧版运行不提升这些义务。** 原五操作的规范义务保留，结构检查按六个契约操作核对，技术 close 单独列出；损坏分类依具体读面验证，不能把 S-36 的行为倒灌旧读面。

共同前提：精确采用后在 `infra/storage-sql` 的真实 SQLite 文件库执行；并发实例共享同一文件、同名会话哨兵、parent 主键与 owned_ref 全局唯一索引。第一次受理前由装配完成迁移与升级确认。PostgreSQL 所需实际方言环境单独记录，缺环境或跳过不能计通过。正常生产者用例、故障注入、受控损坏 fixture、纯容量边界用例分别标明，不相互冒充。

| # | 条款与演练 | 可失败的断言、负控与限度 | owner |
| --- | --- | --- | --- |
| MG-V1 | S-36/S-37：真实完整 fill G1 后，各六类逐一 mint reload，再 reuse 旧表，随后完整 fill G2；在各阶段保存 H 并读 given，重开进程后再读 | 给定旧 H 始终返回对应最后 given 的整条原记录，不能变成当前最新 mint 的 E、最后类别表或 creation source；G2 只对 seq 包含它的 H 可见。去掉 given 过滤、H 上界、session 条件或改走 readEvaluation 的实现必须失败。同时核原 readHead/readHistory 仍按各自来源返回 | 本节点 + registry owner |
| MG-V2 | S-36①②⑥：缺 H、布尔、负数、小数、不合法 session；合法 H=0、巨大整数、非空但只有 mint 的历史；真正头读失败 | 表示非法先 invalidInput；H=0 与巨大合法 H 均实际读 C，必要头读取失败为 unavailable；仅真实确认 H>C 后 invalidInput。合法范围无 given 才 none，不是 recordNotFound、空 record 或 null。移除实际头读或提前按 safe-integer 拒绝的变异失败 | 本节点 |
| MG-V3 | S-11/S-32/S-36：完整壳、全部 tables/content；合法非六类非空表集、非 assembly filledBy、content 合法第四成员、大整数与长小数 | readGiven 原样交回全部合法值，compositionOrder 顺序不变；MF 不做 AR 的 exact-three/六表/filledBy 筛选。共享 AE4 S-47 全量公共判定而非复制简化 Schema；调用者修改返回副本不改变持久源。删成员、Number 舍入或强加 AR 校验的负控失败 | 本节点 + core/asset-evaluation owner |
| MG-V4 | S-32/S-36：先合法 G1 后最新 given G2 缺槽/非法 E/O；受控持久壳、session/seq/ref、缺表、严格 JSON 损坏；实际 SQL/schema 与无关程序缺陷 | G2 内容投影不合法为 unavailable{reason:invalid_evaluation_content}，不回退 G1；已观察持久壳或解码损坏按 S-36 unavailable，不能变 none。未知列/错误 API 等缺陷仍上抛。逐项破坏 AE4 五类 DTO 与结果内关系；恒 true、只验根、INNER JOIN 隐藏坏 parent、catch 全部 StorageDefect 或回退旧源的负控分别失败。外部删改后仍完全自洽的历史不可凭本读面识别，不声称覆盖 | 本节点 + storage owner |
| MG-V5 | S-7/S-12/S-17：expectedHead=9007199254740993 等精确合法整数；真实低位 head 下同会话已存在 given、跨会话 owned_ref、缺失 reuse、新 mint；另跑 readGiven 超大 H | 原次序分别得到 alreadyRecorded、evaluationRefConflict、recordNotFound、headMismatch，不先 invalidInput 或舍入；原实读事实不能省略。公开输入结果保持 JsonNumber，ExactDecimal 比较；readGiven 范围仍先实读 C。将请求类型限成 number/safeInteger 或经 Number 比较的变异须失败 | 本节点 |
| MG-V6 | S-7/S-17：表示容量到 MAX_SAFE_INTEGER；旧引用认回/冲突与真正 admissible 追加分别触发 | 所有原优先级先成立；可写但容量满直接既有 unavailable，任何 head+1、mint 分配和 INSERT 均未发生，头/历史不变。不伪造 StorageUnavailable、不新增领域 reason；真实事务结束后仅有界内部 capacity 诊断。容量边界可用明确标注的合成事实/受控 fixture 检查，不声称实际积累了 2^53 条连续历史；另用正常小序号真实 IO 验证控制流和零写 | 本节点 + storage owner |
| MG-V7 | S-12/S-17 与 storage P-2/P-3/P-5：首条 parent INSERT 产生真实具名 UniqueViolation，按原顺序在同一事务重判一次；同时触发多道失败，或注入 mint 引用碰撞 | 重判只在 parent 尚未成功时执行，保持同一哨兵/事务；有实际结论才正常返回，仍 admissible 原样抛原 UniqueViolation。无重试、无重铸、无新 ReadTx；重判读失败也不猜认回。分支注入要说明可达条件；SQLite 的人工冲突不证明 PostgreSQL 真竞争路径。PG 两会话并发引用竞争另需真实环境 | 本节点 + storage owner |
| MG-V8 | S-12/S-13/S-17：设计 MG-X1 的 parent 成功、第一张 table 成功、第二张 table 唯一冲突；同会话两实例及跨会话同 given 的正常并发另跑 | 在真实文件库用受控语句包装使第二次 table INSERT 与首个 category 重复，触发实际约束异常。新实现异常逃出 write，整条 parent/所有 table 回滚，重开后头与历史不变；不得 alreadyRecorded。旧“任一 unique 均重判”变异应因提交 parent+首表而被检出。该注入不冒充合法写者行为。正常竞争须只一路提交且另一方按事实收场，不依赖进程锁 | 本节点 + storage owner |
| MG-V9 | S-23/S-36⑨：真实 Cordis 4.0.4 撤除/换代，阻塞已进入的 ReadTx/WriteTx；独立闭包 close；调用方取消等待 | 关闭准入后旧引用的新调用 unavailable；close 等真实提交/回滚后才结束，未结束前不得 resourceEnded，取消不等于释放或回滚。新实例从持久记录读取。借用 storage/诊断 sink 不被关掉，另一 owner 仍可用；无无主 Promise/自建后台任务。释放屏障才能让结束断言通过，不能只核计数清零 | 本节点 + kernel/storage/app owners |
| MG-V10 | S-36⑨ 与 SYS-OBSERVABILITY：正常、none、非法输入、容量、parent 冲突、table 回滚、解码/投影失败；巨大 H；诊断端口和独立故障端口失效 | 有界输出由装配持有，检查端口的队列与显式字段边界；巨大或未受检 H 只给常量 omitted 标记，provider 不 stringify/截取原输入，请求值不变。无完整 content/E/O/正文/秘密/异常 message，无猜测租户；resourceEnded 仅真实 storage resolve/reject 后，表示拒绝不伪造事务事件。诊断失败不改业务结果、不吞原缺陷；丢失覆盖由独立可见故障记录暴露，不能当业务耐久清单 | 本节点 + apps/model-request-acceptance 观测 owner |
| MG-V11 | S-36/S-37 与 AR4 S-51/S-52：真实 Agent Definition 正文→AE4→AR4 完整 fill→各类 reload/reuse→进程重开→readHead(H)/readGiven(H)→AR 完整源核对→EIS 固定根正文；插入新完整 fill 与并发头漂移 | MF 全记录成功只证明所选记录。AR 才接受 exact-three、assembly、六表、根唯一与 assetVersion；none/坏源时不得调用 EIS。新的完整 fill 切新 H 来源；refresh 可继续固定旧 H，不强加末尾头复核。reload CAS 冲突须重取整套来源与 E/O，不能只换 expectedHead；固定旧根与当前 holdings 不匹配如实 dependency unavailable，不修源。技术单节点通过不关闭 SI-G1 或整条 G 验收 | registry/EIS/AE owners + apps/model-request-acceptance |
| MG-V12 | SYS-OPEN 与 S-21/S-23/S-36：独立制品消费纯构件和存储闭包，另经 Cordis 服务取同一六操作；静态/运行时公开入口检查 | 不装 Cordis 仍能使用纯构件/闭包；没有隐藏替代源端口、额外写面、更新/删除或方法缺失降级；六个契约方法与技术 close 可区分，旧五方法行为按其精确采用不变。迁移不加来源旁表；构建产物/声明由外部消费者真正加载，不能仅检查源码字符串 | 本节点 + apps/model-request-acceptance |

两种真实并发的共同存储对象及反证见 v4 设计 R-AMS4-2/3；readGiven 的固定 H 与同 ReadTx 交错见 MG-4。只增场景中单纯拆读但保留上界未必产生失真，不能把这类实现变异登记为必失败证据；负控必须实际去掉上界、拼接不同源或吞掉已发现的坏源。

### v4 覆盖缺口与停止线

- **MG-G1**：MF4/AR4 候选已登记，最终收口、独立评审及精确采用归主线/规格 owner；阻塞正式提供第六操作，本文不自行接受。
- **MG-G2**：MG-V1～8 的实际 IO、严格值与事务阶段证据未有；本节点与 storage owner 承接。方言不满足 P-2/P-3 时停该方言交付，不能切成跨事务重判改变观察点。容量失败不是无限容量保证，也不是瞬时存储异常。
- **MG-G3**：MG-V11 的原完整 fill→AR4→EIS 真实生产链尚未执行，registry/EIS/验收装配承担；MF 的孤立成功不能关闭 source producer 或权限缺口。
- **MG-G4**：MG-V9/10/12 的真实宿主装卸、装配有界诊断与公开制品未验。本节点不接管 storage/sink；`apps/model-request-acceptance` 拥有入口身份、升级确认和停止顺序。
- **MG-G5**：PostgreSQL 真环境和未来更大序号表示另有独立义务，SQLite 或纯边界用例不代证。D-027 NORMAL 的断电边界、产品在场来源与完整 PF-004 仍按旧缺口保留。

本次仅完成候选节点设计；设计检查的实际结果由本次交付报告给出，不在此预写通过。没有运行本节产品测试、真实 IO 或 formal task，不新增绑定。

## 2026-09-27 MF4 实际组件检查补充

实际 76 项 MF4 组件测试、403 项静态工具测试、全仓 build/typecheck、源码扫描通过；源码/配置/输出及每项 SHA 见[组件运行](../../../../record/evidence/2026-09-27-probe-model-request-runtime/mf-component-checks.md)。此处只接续历史未执行读数，不把 MG-V1～12 整组标成通过。MG-V1 的完整 AR producer、MG-V11 真来源链、MG-V10 装配退化查询和有界留存、完整 MG-V9 换代与 PostgreSQL 义务仍待相应真实组合。六类别替换/历史 H、严格值/损坏分类、实际 ReadTx、容量受控 fixture、parent-only 冲突、MG-X1 真 UNIQUE 回滚及负控、独立包导出消费、Cordis drain 仅覆盖归档内的组件场景。新增绑定0，未作独立验收或生产认证。
