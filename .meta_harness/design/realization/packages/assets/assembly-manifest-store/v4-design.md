# assembly-manifest-store v4 增量实现设计

本稿为 **candidate，未采用**。节点及源码路径均为 `packages/assets/assembly-manifest-store`，沿 D-059。旧 [design.md](design.md)、[v3-design.md](v3-design.md) 与绑定保持原字节；D-074 的技术采用不延伸至本稿。已有 MF3 五操作源码正在施工，文件存在不构成验收；**MF4 第六操作尚未交付，须规格与本稿精确采用后实施**。本页新增或调整的服务、方法、内部构件与存储名称均为候选投影，不冒充现成 API。

| 分层状态 | v4 事实 |
| --- | --- |
| 语义接受 | MF4/AR4 已登记 candidate；本稿无接受。最终收口与采用由主线/规格 owner 完成，不借 MF3 已接受事实提升 |
| 可实施范围 | 六操作及新读面、整数边界、唯一冲突阶段修正的完整候选投影；MF4/AR4 与本稿采用前不向正式消费者提供 readGiven |
| 绑定与证据 | 0 新绑定；继承证据只保留原坐标。下文 MG-V1～12 均为待执行义务 |
| 实际验证 | 无本稿产品验证；不声称 SQLite 六操作、PostgreSQL、真 registry/EIS 组合或资源收口通过 |

## 输入与实现路径

本稿兑现 `(omne-harness-lite-design-2026-09-15, capability.assembly-manifest, 4)` 的 [MF4 候选正文](../../../../spec/capabilities/assembly-manifest/v4/contract.md)，继承 S-1～S-35，新增 S-36/S-37；[AR4 S-51/S-52](../../../../spec/capabilities/asset-registry/v4/contract.md#s-51-原完整填表来源与本次表头的关联) 是消费者交接。动因沿 D-077 与 [原 fill 来源缺口稿](../../tools/asset-registry/v3-original-fill-source.md)，不把缺口稿的候选末尾复核策略带入 AR4：**refresh 固定 H 后允许继续消费旧表，后续追加不触发末尾必须等于最新头的条件。** 本节点不反向规范依赖 AR4，不解释 assembly/六表/资产根。

精确数据依赖沿 MF4 S-4：identity-values v1、messages v2、content-blocks v2、asset-model v3、offer-expiry v1、tool-definition v2、asset-evaluation v4 的 S-47。运行时实现复用已有公开严格 JSON/ExactDecimal 与 AE4 完整结果读取构件；包 root 的实际采用版本按已接受公开实现显式核对，不因类型相近擅自升级规范坐标。

继续复用本项目 `core/storage` 协议与 `infra/storage-sql`，公开 SQL 查询经既有 Kysely。采用依据仍为 D-026 与 D-027，不在本节点重选数据库。Cordis 固定 D-025 的 4.0.4。不增加业务表、索引化来源副本、会话 JSONL 双写、后台追尾器或计时重试层。

源码公开入口已存在 `createAssemblyManifestStore`、`checkManifestAppendInput`、`judgeManifestAppend`、`answerPresence`、`readEvaluationProjection`，以及五操作和独立 `close`；本轮只读其施工事实，不确认稳定制品。本稿拟沿同一闭包与 `assemblyManifest` 服务显式增加 `readGiven`，六个规范操作加一个技术关闭方法；不设“方法不存在就退回 readEvaluation”的兼容路径。可独立采用的纯构件及存储闭包继续不依赖 Cordis。

## 契约责任到 Cordis 的投影

| 编号与契约责任 | 插件／服务／公开构件（候选） | 实现与采用版本 | 符合性依据或缺口 |
| --- | --- | --- | --- |
| MG-1：S-6～S-9/S-11/S-16/S-18/S-19 | 原 readHead/readHistory/dependencyPresence 与公共值判定 | 复用 MF3 两表、严格 JSON 和在场来源；新操作不改变旧返回 | 原值与失败分类按旧操作保留；MG-V1/2/3；旧义务继续 |
| MG-2：S-32/S-33/S-36 | 公开 `readEvaluationProjection` 与内部完整记录读取构件 | 两种新读面共用 AE4 S-47 全量公共读取，另核 O 为 E.composition 精确排列；readGiven 返回整条记录 | 不复制 DTO/Schema、不精简 content、不解释 filledBy；MG-V3/4 |
| MG-3：S-36①②⑥ | 候选纯 `checkManifestGivenReadInput`、readGiven 准入 | 显式 session 与精确非负整数 H；同一 ReadTx 真实头比较后才转 SQL 安全边界 | 巨大合法 H 不先判表示错误，必要头读失败仍 unavailable；MG-V2/5 |
| MG-4：S-36④⑤⑦⑧/S-37 | 闭包与服务 `readGiven(session,H)` | 一次 ReadTx：实读 committed head、核 H 范围、选同会话最大 given seq≤H、完整读取和 S-32 判定 | none、坏源和存储不可用分开；固定旧 H 不随后续追加扩大；MG-V1～4/8 |
| MG-5：S-7/S-12/S-17 | 原 checkManifestAppendInput/judgeManifestAppend/append | expectedHead 保持 JsonNumber；ExactDecimal 比较；真实 seq/head 采用安全整数容量边界 | 超大合法 expectedHead 沿原优先级正常判断；容量耗尽 unavailable、零写；MG-V5/6 |
| MG-6：S-12/S-13/S-17；storage P-1/P-2/P-3/P-5 | append 的 parent 与 table 插入阶段 | 首条 parent INSERT 唯一冲突仅同事务重判一次；table INSERT 冲突逃出 write 回滚整次 | SQL 实现修正，不改领域失败序列，不跨事务重判或自动重发写；MG-V7/8 |
| MG-7：S-21/S-23/S-36⑨ | 原一个插件/fiber、一个闭包；必需 storage，借用 presence/诊断端口 | 独立准入与在途集合；真实 storage 返回/抛出后记录资源结束 | 诊断有界由装配持有，borrow 不关闭 storage；MG-V9/10/12 |
| MG-8：S-36/S-37 与 AR4 S-51 消费 | registry 经公开面 readHead(H)→readGiven(H) | 本节点只交完整 given；消费者核 assembly/六表/根和自身权限 | 原 fill 恢复不再依赖哪个类别还留 given；真实采用与生产链缺 MG-G3；MG-V11 |

## readGiven 的读取与值边界

1. **表示与准入。**纯构件校验 session 与必填 H。通过公开严格 JSON 复制/读取得到 `JsonNumber`，拒绝布尔、负数、非整数、缺席及不合法数表示，不用 truthy、`Number()`、`parseInt()` 或安全整数上限代替规范域。表示错误先返回 invalidInput；合法请求在闭包已停止时 unavailable。
2. **真正实读范围。**进入一次 `storage.read`，由该 ReadTx 第一条实际 SQL 读取得已提交快照，读本会话当前最大 seq 为 C；确证无记录才 C=0。使用 ExactDecimal 比较 H 与 C；H>C 才返回 invalidInput。即使 H 巨大或 H=0，也先真实读 C；不能因实现容量已知就跳过读取，不能在头不可读时臆判 invalidInput/none。
3. **固定显式 H。**合法 H≤C 后，H 已落入本 provider 可精确承载的安全整数区间，此时才经受检转换交 SQL。选择条件完整为 session 相等、seq≤H、evaluation_kind=given，按 seq 降序取一条；不用 mint/reuse、filledAt、filledBy、根值或引用字符参与选择。无匹配且读取完整时交显式 none；技术表示候选为 `{none:true}`，与 `{record}` 及 failure 互斥，不以 undefined/null/空对象代替。
4. **完整读取与检查。**在同一 ReadTx 从选中 parent 读全部对应 table 行，核 S-6～S-11 壳及同一 session/seq/ref 关系、非空且合法类别的 tables、精确时刻和每份 composition/content 的严格 JSON。只按 parent 选择后再读 tables，不以 INNER JOIN 把坏 parent 悄悄消失成 none，也不只取当前 latest 所含类别。S-32 判定复用同一 `readEvaluationProjection`；通过后返回原整条 `{session,seq,evaluation,evaluationRef,tables,content}`，保留 content 合法未知成员与全部原序列和数字。MF 的 tables 可为规范允许的非空类别集合，并不要求 AR 的恰六类。
5. **结束。**回调产生的是待交出的完整自有值；只有 `storage.read` 实际 resolve/reject 后资源阶段结束，才向外返回/诊断。没有读取重试、修复、写入或引用铸造；读取中发布新 given 不改变输入 H。相同 H 的耐久源不变，但下一次存储不可用仍允许失败。

**失败分类只在本操作的语义层做。**表示合法但实读范围超界为 invalidInput；合法范围无 given 为 none。必要 IO 无法完成、选定源缺失、已存壳/序列/会话/ref 关系损坏、表不能完整读出、严格 JSON 解码失败为 unavailable；已确认壳与记录可读，但 S-32 缺槽位/非法 E/O 为 unavailable{reason:invalid_evaluation_content}。不把坏来源归咎调用者，不回退旧 given。SQL schema、未知列、错误 API、无关 TypeError 等程序缺陷仍抛出，不能 catch 所有 StorageDefect 当来源损坏。

完整记录解码应把**已观察到的持久值损坏**与存储/程序缺陷显式区分，供 readGiven 按 S-36 映射；旧读面的分类由原操作继续决定，不能为了复用一个 helper 改写旧承诺。append 仍接受任意合法 JSON content；readGiven 遇 `filledBy` 非 assembly、额外合法内容字段或非六类的合法 tables，若 S-32 合法仍原样返回。消费者才拒绝不合自身用途的记录。只增不删和事务完整性仍是存储前提；不声称能发现绕过存储协议后被外部删改成完全自洽的任意历史。

## 精确整数与实际容量

MF 的头与序号是数学整数，SQLite 物理整数范围、JavaScript number 的精确范围及规范域不同。该提供者当前持久 seq/head 限于 `0…Number.MAX_SAFE_INTEGER`，记录 seq 自 1 起；这是**实现容量**，不是把契约请求域缩成安全整数。已有不在该范围的持久 seq 不转换或舍入后继续：依操作的持久值损坏/缺陷分支明确失败。PostgreSQL 更宽物理整数也不自动扩大当前公开实现容量，更不构成已验证证据。

`expectedHead` 在公开检查结果中保持 JsonNumber，判定用 `ExactDecimal.from(expectedHead)` 与精确实际 head 比较。超大合法整数不因 safe-integer 检查而 invalidInput；例如真实 head=7，新 mint 的 expectedHead=9007199254740993 正常 headMismatch{head:7}。同会话既有 given 仍在 head 判断前 alreadyRecorded；跨会话/指向 mint 的 given 仍先 evaluationRefConflict；不存在的 reuse 仍先 recordNotFound。不得借“肯定不等”跳过更高优先级的实际事实判定。

所有常规判定通过且实际 head 已为 MAX_SAFE_INTEGER 时，**在计算 head+1、铸 mint 引用和任何 INSERT 之前**返回既有 unavailable，零写、头与历史不变。内部观察仅记有界 stage=capacity，不新增领域 reason，不抛伪造的 StorageUnavailable；该类型沿 storage P-8 只承载其已定义的瞬时失败。空写事务的真实结束之后才输出 capacity 诊断。此边界不承诺无限追加，未来扩容须由存储表示与公开制品 owner 显式迁移并重验。

## append 的唯一冲突：按语句阶段收口

主线本轮已收敛采用以下 SQL 实现修正。旧 design「任一 UniqueViolation 同事务重判」不能直接搬到产品源码；原正常判定序列仍为：表示 invalidInput → alreadyRecorded → evaluationRefConflict → recordNotFound → headMismatch → filledAtNotIncreasing。修正不新增领域失败、重试策略或业务回滚操作。

**反例 MG-X1。**在同一 `storage.write` 内锁住本会话哨兵、读取事实、判定可写，parent given 插入成功，第一张 table 也成功，第二张 table 插入触发具名唯一冲突。可用测试中的约束/语句故障注入构造该异常分支；合规正常写者不应产生它。storage **P-2 只撤销失败的那条语句**，此前 parent 与第一张 table 仍在本事务中。若 catch 覆盖整段插入，并按 P-3 重读事实，读者看见自己刚写的同会话 given；一般判定答 alreadyRecorded，`fn` 正常 return 后 **P-1 会提交这份半截记录**。其他 kind 也可能把自己的新头/时刻误判成拒绝而正常提交。若第一张 table 就失败，完整解码有时会因零表抛出，仅遮住这个特例，不能保护“已有一张成功”的反例。

| 阶段 | 处理与观察点 | 为何没有本次半截被认回 |
| --- | --- | --- |
| 原事实检查 | 同一 WriteTx 先 lockSentinel(session)，依原次序读取并判断；已有给定引用即认回，不走 INSERT | 本次尚无记录写入；结果来自真实已提交不可变记录 |
| **首条 parent INSERT** 抛 UniqueViolation | catch 的词法范围只包这一条 INSERT。P-2 保证该失败语句无写入且事务可继续；仍持同一哨兵，在同一 WriteTx 按原次序**重判一次**。实际有结论则返回该结论；仍 admissible 则原样抛出原 UniqueViolation | 在 parent 前本节点没有任何记录/table 暂存写。P-3 的重读可看到赢得全局引用竞争者的已提交完整记录；不含本次 parent。不能仅凭约束名字认定所处阶段 |
| parent 成功后任一 table INSERT 失败 | 不进入认回 catch，异常逃出 write；由 P-1 回滚整次 parent 和此前全部 table 写，原异常上抛 | P-2 可继续不等于应该继续。拒绝返回、只回滚失败语句或新开 ReadTx 都不能代替整次回滚 |
| 返回/抛出 | await storage.write 的真实提交/回滚结束，再映射其允许的 StorageUnavailable 或交回原缺陷 | 不能在回调 return 时声称已提交/资源结束；诊断或取消不改外部事实 |

首条 parent 冲突的重判是**原次追加判定点内**的读取，不释放哨兵后再开只读事务。正常同会话给定引用重试由原前置检查认回；真实跨会话 given 竞争触碰 `owned_ref` 全局唯一约束，后方可据 P-3 看到胜方而收 evaluationRefConflict。mint 随机撞引用时请求不具有 given 认回资格，重判仍可写就抛原异常，不重铸重发。重判所需读取若不可用或发现缺陷，异常同样逃出 write，由真实事务结束后按既有类型收场，不猜 alreadyRecorded。

这一方案依赖 P-1/P-2/P-3/P-5 的完整成立：同会话写者持同名存储哨兵；跨会话冲突由具名唯一约束定序，胜方提交全记录；原记录不删改。若某实现只能在冲突后新开事务才能读到事实，或失败 parent 语句可能留下部分写入，它不满足本采用前提，**停止该方言交付**，不能私改为跨事务认回。当前 SQLite 下全局写锁常使碰撞在前置事实检查即被判出；因此人工触发 parent 冲突分支不能冒称真实 PostgreSQL 并发已验。

## 依赖、存储要求与交错

| 依赖与取得方式 | 绑定范围 | 缺席与撤除 |
| --- | --- | --- |
| storage 必需 inject；直接闭包显式传入 | 单实例固定借用提供者；SQL 仅经公开 ReadTx/WriteTx | 缺席 PENDING；换代重建无业务缓存，已受理调用按实际事务结束，不接管旧事务 |
| AE4 S-47、严格 JSON/ExactDecimal、身份与时刻纯构件 | 静态公开 import，制品明确精确采用 | 构建/配置错误不发布；程序缺陷不伪装投影 false |
| presenceSource、诊断/独立故障端口 | 装配拥有，本节点借用；无新增秘密或时钟配置 | 在场源缺席仍 unavailable；非法配置沿既有启动失败政策；诊断失效不影响业务提交 |

本节点不选数据库，向存储提供者提出以下要求；与原 R-AMS/R-AMS3 同范围互指。

| 要求、契约坐标 | 存储性质及本次共同对象 | 消费／证据 |
| --- | --- | --- |
| R-AMS4-1：S-36 | P-6 同一已提交 ReadTx 中读 C、核 H、选给定 parent 并读全部 tables/content；不可读可识别，严格无损 | MG-V1～4；使用实际取得的单个 tx，不以查询字符串或模拟事务代证 |
| R-AMS4-2：S-12/S-13/S-17 | 同一 `(session,seq)` parent 主键、同名会话哨兵与所有 `assembly_manifest_table(session,seq,category)` 行一次提交；table 外键及表时刻唯一约束 | 新旧 registry 写者均经本节点 append 触碰这些对象，互指 [registry 已采用共同对象](../../tools/asset-registry/v3-design.md#共同提交对象与存储要求)；AR4 继续同一对象，MG-V7/8 |
| R-AMS4-3：S-8/S-17 | `assembly_manifest_record.owned_ref` 在同库所有会话全局唯一，具名约束可识别；parent 失败语句原子、同事务仍可读最新提交 | P-2/P-3/P-11；不同会话写者在同一唯一索引相遇，MG-V7/8；另开库不满足 |
| R-AMS4-4：S-11/S-13/S-24/S-36 | 原记录与表行只增不改，已确认提交在进程重开后保留；历史 H 不被 reuse 或新 given 改写 | MG-V1/4/8；D-027 NORMAL 的断电边界不提高；无新归档清理政策 |
| R-AMS4-5：S-7/S-17/S-36 | 实际 seq/head 受检精确表示，非法持久值可识别；达到表示容量在任何写入之前停止 | MG-V5/6；请求 H/expectedHead 不因此缩域，内容的大整数/精确小数不受 seq 容量牵连 |

交错一：readHead 得 H=8，写者 given G2 提交 seq9，readGiven(s,8) 随后进入其 ReadTx，实读 C=9、仍选 seq≤8 的 G1；H=9 才选 G2。交错二：readGiven 在 ReadTx 内已取得 C=8，写者提交 G2，后续选择/表读取仍属于原快照，不能拼 G2 的 content 或扩大 H。只增场景中“拆开读取但仍保留上界”未必构成失败，不据此制造伪反证；负控分别去掉 H、混源、把表过滤为 latest 或将坏源回退。

写交错一：同会话旧/新实例都持 expectedHead=h，哨兵及主键令一方提交，另一方按原顺序得到真实结论，通常 headMismatch；给定引用相同则已存在优先。写交错二：两会话同 given 引用共享 owned_ref，至多一方提交；parent 冲突重判不能返回本次暂存数据。MG-X1 专门反证 table 阶段吞冲突导致半截提交；这三种场景都不依赖进程内锁。

MF 只保证自己的读视图与提交；AR4 H 对表/原 fill 的关联由消费者持有。reload 把 H 带回 append，若冲突由 AR4 全套重取；refresh 无写，不因后来的头变化失败。EIS 的当前源与本 ReadTx 没有共同提交，SessionLog JSONL 亦无；本节点不造跨 owner 原子承诺。

## 装卸与有界观测

| 资源／贡献 | owner、可用时点与部分失败 | 撤除与保留 |
| --- | --- | --- |
| 迁移与 storage | 装配合成既有两表迁移，确认升级后开闸；本节点借用，不拥有库关闭权 | 不删除/补写历史，不回滚其他实例的合法提交；底层关闭等借用调用实际结束 |
| 一个公开闭包与 assemblyManifest 服务 | 本 fiber 配置通过且依赖可用后提供六操作；失败沿 fiber 收回已取得贡献 | 同一个组合 effect 先关准入，旧引用后到 unavailable；close 幂等并 await 所有已受理调用 |
| 每次 ReadTx/WriteTx 与调用 Promise | 调用登记在进入异步存储前建立；事务由 storage 拥有，返回值/异常均有等待者 | 计数只在实际 storage 完成及本次收场处理后释放；取消等待或服务撤除不等于实际停止，不自动重发 append |
| 诊断端口及独立故障端口 | 装配负责有界队列、单项字段长度、输出/保留策略和 sink 资源；已配置诊断却缺必需故障端口或静态配置非法时启动失败，不把可选端口变为必配 | 节点不后台排队、不持有无主 Promise、不关闭借用 sink；sink 故障暴露覆盖缺口，不能改业务结果、吞原缺陷或提前标 resourceEnded |

诊断只交操作、provider 修订、session、受检后可安全表示的 H、实际 C/选中 seq/ref、结果 success/none/既有失败及限定阶段；租户/尝试只用已核调用上下文，不能从 SessionRef 猜。巨大或尚未受检的输入 H 不输出原值、不为诊断 stringify，可交常量标记 `requestedHeadOmitted=true`（候选技术字段）；readGiven 的 H 经真实范围核对后才可按安全整数输出。此处不新增 cap 配置或领域 metadata；端口 owner 对 session/ref 等显式字段的尺寸、输出与保留负责，不能反改请求值。内部 capacity、parent_conflict、table_failure、decode/projection 可区分；不输出异常 message、完整 content、表 composition、E/O、正文、配值或秘密。resourceEnded 只在 storage 已返回/抛出后为真，不在回调内标记。没有真实存储操作的表示拒绝不伪造事务结束事件；诊断故障不替代清单事实。

机制依据：必需 inject 沿 [inject-has-no-optional-form](../../../../basis/cordis/inject-has-no-optional-form.md)，依赖换代沿 [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)，配置失败沿 [plugin-throw-fails-fiber](../../../../basis/cordis/plugin-throw-fails-fiber.md)，不依赖 disposer 完成顺序沿 [effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)。原 probe 不代替六操作真宿主演练；provide 纳管仍按原节点待核对主张登记，没有依据声称 Cordis 取消本次数据库事务。

## 关键选择与代价

| 选择 | 落选方最强论证 | 本方弱点／复查信号 | 置信度 |
| --- | --- | --- | --- |
| 一插件一闭包，增加公共 readGiven，复用两表 | 独立读服务可单独换代；旁表能直接定位最后 given | 六操作一起换代；每次公开查询有成本，尚无索引优化收益证据 | 高 |
| 真读 C 后按显式 H 选 given，全记录同 ReadTx | 已知本机容量可提前拒巨大 H；最近 E 读面已可用 | 更多读数与完整返回成本；不能以性能猜测弱化 S-36 范围与来源 | 高 |
| 请求用 JsonNumber/ExactDecimal，持久 seq 安全整数有界 | 全面 BigInt/数据库大整数可扩容量；全 safe-integer 请求检查代码更少 | 明确容量耗尽，未来扩容需迁移；但不舍入、不拒规范合法请求 | 高 |
| **仅 parent INSERT 冲突同事务重判；table 失败整次回滚** | 整次回滚后新只读重判容易统一控制流；任一 unique 都重判代码最少 | 需保留清楚的阶段边界及 P-2/P-3 证据；有些异常只暴露缺陷，不能自动恢复 | 高：主线本轮已裁定；正常领域次序不变 |
| MF 只核 S-32，不解释 filledBy/完整 fill | provider 直接要求 assembly 可少一层消费校验 | MF 成功仍可能被 AR 拒绝，需要双层各自验收 | 高 |

跨事务重判本批未采用：它释放原哨兵后在另一个观察点裁决，需另证竞争归属和失败时点；不声称它等同 S-12 原次提交内判定。本方案用失败首语句无写入这一前提保留现有边界。任何未来把 parent 前置移到已有暂存写之后的重构都须重新审查 MG-X1，不能靠约束名相同复用该 catch。

## 归装配、缺口与停止线

`apps/model-request-acceptance` 负责真实同库 storage、迁移与升级确认后准入、入口 session/tenant/run/attempt 核实、真实 AR4/EIS/AE4 生产链、独立有界诊断端口和停止顺序；`apps/cli` 的产品在场来源、完整 PF-004、中心副本同步不由此自动完成。无需本节点配置时钟或密钥。源码只从精确采用后的六操作规格与本稿生长，主线正在实现的 MF3 不自动承诺第六操作。

| 缺口 | 受阻范围与 owner | 闭合条件 |
| --- | --- | --- |
| MG-G1 | MF4/AR4 已登记候选，最终收口及精确采用未完成；主线/规格 owner | 坐标和最终条款一致、独立评审与采用完成；不得修改旧 adopted 稿代替 |
| MG-G2 | readGiven 全记录读取、损坏与缺陷分类、精确整数/容量、parent-only 重判未验；本节点/storage owner | MG-V1～10 及原 MF3 相关义务真实执行；任何方言不满足 P-2/P-3 停该方言，不改产品次序 |
| MG-G3 | 原 fill→公共 readGiven(H)→AR4 完整 fill 核对→EIS 固定正文读取；registry/EIS/app owner | MG-V11 与 AR4 S-52 真生产链；MF 成功仅是原记录事实，不能独自关闭 SI-G1 |
| MG-G4 | 真实 Cordis 撤除、诊断有界与故障、制品公开入口；本节点/装配 owner | MG-V9/10/12 真宿主/文件库/独立制品；不借旧证据称当前已验 |
| MG-G5 | PostgreSQL 分支与未来更大序号容量 | 实际环境与表示迁移另有证据；SQLite 检查和跳过不算 PG 通过，不提升 D-027 断电边界 |

验证义务见 [verification 的 v4 追加段](verification.md#v4-候选增量的证据义务)。本稿不更改 bindings，不接受或验收自身。
