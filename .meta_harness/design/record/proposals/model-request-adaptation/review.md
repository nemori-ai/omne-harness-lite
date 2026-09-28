# 评审记录

## 2026-09-27 RT4 结算消费整包独立复审

architecture-reviewer `/root/b1_late_boundary_review` 与 spec-reviewer `/root/p2_narrow_projection_expression_review` 独立只读审初稿和修订；最终contract `4a31cb8bc98ae5bbb55a28c671ff84a8f86520747de7dd07c180787183651689`，manifest `11ec2435be9ae52f9ccc9f32fc9a745fe7b600b8d0123fd0208a82d26c592e15`。表达初审ER1模型完整右值、ER2未知切换却保M1、ER3进展缺实际提交／恢复机会为阻断，ER4已接受入口误标为非阻断；rev2只修模型，rev3只改五文档，两次定向复核四项全部闭合。架构各轮无本范围阻断，最终中高置信度，保留全尾争用、完整读授权、旧写者协作成本；没有新产品政策或状态权威。

最终73条／13个九项操作／17依赖／55未复核covers／6正任务保持，旧64冻结资源／13继承形式与S54～67未改；最终24形式资源与独立run2字节一致。首轮形式实际exit75失败与修订原因没有隐藏，run2只取得有限模型Pass，不提升新正文／四组向量／IO或全部操作验证。全部初稿、修订、原检查及主线忠实归因摘要见 [191文件归档](reviews/model-request-runtime-v4-2026-09-27.tar.gz)，摘要不是逐字报告或人类总体签收。G28～31及继承缺口保持原owner；本次评审意见不构成接受，精确技术接受另归D086。

## 2026-09-27 SL3 恢复路径识别增补独立复审

architecture-reviewer `/root/b1_late_boundary_review` 与 spec-reviewer `/root/p2_narrow_projection_expression_review` 分别只读核对 recovery rev1及rev2；初稿 SHA `3cb5bee15aef25c797a5c5e95700a46f97ff985b1fabb7e44e09a14ce9f3b82b`，最终 `ea205862968dbe54889d7ba4b80ffcb33e04318c5ba8a82fb09367c1bbd324ae`。架构两轮无阻断，置信度中，保留每日志同步、索引信任及宿主退出观察部署的强反方。表达 ER1 指出 RG-V3 将回执丢失／成功截回一律判不可信，ER2 指出 RG-V7 将第一次重建失败一律要求删除；rev2仅修这两行及修订号，两项独立定向复核均闭合，无新增问题。

38输入和SL3原24冻结资源无漂移，完整原件及主线归因摘要见 [61文件归档](reviews/session-log-jsonl-recovery-2026-09-27.tar.gz)。摘要是主线忠实转述评审消息，未冒充逐字评审报告。没有执行IO／进程／TLC，不关闭RG-G1～3实际义务，也不提升完整runtime实现或37认证。精确技术采用另归D085。

本包 revision 1 经独立 architecture-reviewer 只读评审，design SHA-256 `268554d7bd30b5240b8dc3996bb3b819fc321a9fdca8208861dea75cde9dcbe4`。没有接受记录。

| 发现 | revision 2 处置 | 待验义务 |
|---|---|---|
| AR-1：注册表判定点不能覆盖目录耐久提交，自动撤旧影响自建档案 | 改为注册→各档案采用→显式撤旧三个动作；部分失败与旧档案竞争明确，不承诺跨 owner 原子更新 | 有限模型覆盖采用/取得/撤除/部分失败；真实交错验证 |
| AR-2：直接公共函数消费者未进入引用计数 | 静态资源归caller；动态公共消费者显式acquire，至停止/读取后finally release；强制撤除包含这些消费者 | 直接消费者规划到发送之间撤除、异常释放、强制停止 |
| AR-3：诊断查询/保留/授权提供者未落定 | 独立装配持有本机JSONL与查询工具；运维OS权限，显式租户范围；无普通租户网络诊断读面；sink降级状态+有界stderr摘要 | fiber撤除后查询、权限、sink失败与丢弃可见 |

B 仍有方向依据，但评审不构成接受。A 同样可以共享传输资源，已修正候选比较中的过强排除理由。revision 2 首次成稿时尚没有形式检查或真实 Cordis 组合通过记录；后续补验见下。

先前交付计划的独立只读评审指出：真实 assetRegistry.lookup 不能省略；默认重试 runner 使用路径与输入生产者须明确；共同提交对象是日志追加点而非 SQL 跨存储事务；新装配须承接 guard.confirm 开闸；既有 T/SC/G 与首内容耐久写测量不能遗漏。本稿纳入这些约束。计划评审不代替本包架构评审。

## 2026-09-27 revision 2 复审

独立 architecture-reviewer 对 design SHA `43deaba01f3b295f9738286a3226ff2bd76922af2d12ee3e48957d2e05e430cf`、有限 Adaptation 模型及真实 Cordis 原型复核，AR-1/2/3 在本次候选边界内均闭合，未发现剩余阻断。有限模型正向 5430 distinct；三个负控分别反驳撤旧后准入、持引用销毁、在途改绑。进展依赖 Stop/Release/Dispose 弱公平，不证明实际 HTTP 停止、有限时间排空或耐久恢复。

复审发现原型一次归零后的等待对象被后续调用误用，已真实复现并修正；[原失败与修正证据](../../evidence/2026-09-27-probe-model-request-runtime/README.md#连续调用补验)。直接函数持引用及诊断 OS 权限已有责任分配，生产停止、权限、sink故障和 fiber 撤除后查询仍待实现验收。执行者已补命令、cwd、退出码、实际 Context 加载位置与 4.0.4 包版本/摘要，记录标明执行后取证，不凭脚本里的版本常量判断采用。

候选 B 的反方理由仍成立：逐模型贡献的生命周期较直观，同样能共用传输；元数据方案可减少目录漂移。B 集中承担引用协议、分阶段发布和公共服务替换影响，置信度中等。真实提供者若不能保留在途版本，或仍需持续跨目录与注册表同步修改，则重审此分解。此复审不接受规格，也不验收实现；根定义/求值读取增量未在本轮评审范围。

## 2026-09-27 首批规格表达独立复审及定点关闭

只读 spec-reviewer 检查 profile3、messages4、response4、directory3，以已接受各前版为比较基线。完整目录十操作、共享值、精确依赖和覆盖范围未发现新增语义矛盾。B1：response4把可变验证记录放入版本目录；主线将全文移到topic verification，并修正全部入口。N1：依据rev1残留改rev2。N2：profile S28接收方明确新directory3。最终定点复核确认三项全部关闭，未发现本次表达范围的剩余阻断。

复审没有运行产品、形式工具或测试；runtime与其他五包不在本批。已有研究及Schema检查不提升生产验证状态。最终contract摘要：profile3 `8bc4fbfe743b02586ccf582aecb4b5792e3e6582af9e48d5516c364b7251be23`；messages4 `a8ac82be707ae5d49ceb7ad057b42041f73f73a47e76cdfbea5cc37b9d1be89c`；response4 `b591476555136ef8e86fba235b95df23627aa930581ee13db2817079d5cbf566`；directory3 `a38d111a1e071300bc7297f533998922213dc2e47e4671be621b8dd21cf94e45`。

## 2026-09-27 三个 core 增量实现映射独立复审

architecture-reviewer只读复审profile/v3、messages/v4、response/v4节点四件套，三节点均未发现范围内阻断或新增政策问题。完整judge与shape-only分开；配置同名数字不套统一参数约束；精确无损绑定比较；固定Schema旧图保留与实际消费者明确改钉；没有多余Cordis服务/存储/LLM基类。反方理由是统一服务/单一最新版/仅比较修订可减少维护，但不能承担现有纯值语义与未迁移消费者；当前方案代价为多版本制品和完整消费审计。来源真实性、耐久与注册可用性仍归真实边界owner，未要求纯值判断代证。没有执行测试或形式工具，不接受实现。

评审设计摘要：profile `a78122babece0918b7468b9dac4bd0dccf5bb58c20cc9bef20f1a5123dd096e8`；messages `d045cdeffd6fa0ccee46725aebf0aee9804bcf05a578f98db367b7000e7dc286`；response `d376952c91ece3beb8f3583116063c5cda79df2a6d29684c715a7df9d636940e`。真实新源码、独立制品、旧入口和调用者接线仍需实施与执行证明。

## 2026-09-27 Agent Definition1 叶节点独立复核

spec-reviewer（binding_batch_spec_review）与 architecture-reviewer（core_projection_review）分别只读复核；AD1 contract SHA6820187aea0e9c45a2a54f05df876feead27f3c95cd27e6f1c03b7f9fcfa3119，Schema e115d2b7d47a3121c3706eeeae91a67c06c1363550d7f1e46f714f5e29a0cff9，examples 60f2e9b599786fdb3a2b5790e0eb9998c1fc9717bef9359c46a1af0547f3bb49；design c080fad47a72ab9e2df0168e068712fc5d2a6e58b145c3d5e6efdb0216b5d872。两类复核均无阻断、无新增非阻断。

表达复核核两槽、缺项/默认、规范属性域、无损值与登记引用；架构复核核单一body纯模块、未知成员由源持有者保留、通用AM校验先行、无反向依赖及真实来源归生产者。未运行本轮动态实现或122项旧工具；结果不证明真实来源、完整正文或生产装配。节点的MP3候选状态和未点名生产者是旧读数接续，在采用/实施记录按D070及已形成读取链补述，不构成架构反例。

## 2026-09-27 当前读取链五包表达复审

独立 spec-reviewer binding_batch_spec_review 完成 AD1、AE4、MF3、AR3、LC4 表达复审，无阻断。AD1 已按 D072 单独采用。四份最终契约 SHA：AE4 52b52bebd08c8451b41c3a318583210102c7d8a3a1c804bf58eab701d4d589a7，MF3 1a37d5c534c1318a72d9210e776eaf8c9a0f3f66d9feef951442975e47bec9f9，AR3 6b2f36192f0560158b07518bc2bfc7c862f88c54475000aca68153051e522118，LC4 cb317f3c0caf8a4e85ecde231440edeb98806c458a1524ed17207ab94827f6f3。

C16 来源失配、普通二次求值分支、完整失败主体、AE4 S47 与当前资格交接均已表达。原 covers 污染关闭，1902 项为对象且新批仍 reviewed=false。三项非阻断定点关闭：AR→AE S7 已登记；LC依赖标签只指 registry 精确状态，不改规范语义；MF实例的 AM/v2S1 改为 AM/v3S1（examples SHA f68a059dbaf2f6121dee313355f48e8b5dd1cacfa98dcc9a9aa6cbe9238f8dfb）。增量复核维持此前结论，无剩余本轮非阻断项。

architecture-reviewer core_projection_review 对 AE4 纯节点独立核对无阻断，v4-design SHA cf617761a6dd967d187bb3c37bf7f7fda5d4b9845175f7b84a966cba75fc246a。选择器、根声明和成功结果读取责任分开；当前授权、真实来源仍留源持有者。未运行本轮代码或真实 IO，尚未核完整批次 runtime/runner；本报告不产生接受或实现验证状态。

## 2026-09-27 真实读取及共享值提供者复审

独立 architecture-reviewer adaptation_architecture_review 对 input-store/STT rev2、manifest3/registry3 分别审阅，范围内无阻断。spec-reviewer binding_batch_spec_review 对 input-store/STT表达无阻断；input-store参与失败的OG S63引用和真实SQL排队/持锁量测两处非阻断定点关闭，design SHA01e0d2a1ff4fbdaab11321a1126bec8e0e3c01d91a18e8c1f6e3cd162a134bd4。四节点其余最终设计哈希见D074输入表。完整源与同Unit真实性、结构seed守卫、竞争/恢复和实际成本未运行。

core_projection_review独立审core LC4，无阻断；pure单记录共享judge和明确旧面承载绑定语义，fullbatch/source/lifecycle留runner/runtime。v4-design SHA c012b83a3b1501e1f8118a12f318f6df50e16f4aabc646b7350fd509283be26f；LV4义务均待真实运行。

同reviewer审transport v3（design297d42b6eb6b8841169724d3922bd9be4f1114a8432c498aa27cba4b9f75e0cd）无结构阻断，但真实socketstop/直接工厂收口/慢sink/逐模型生产认证/TTL expiry未验。目录原稿（ca2a3bd001f06d5f441ffa7fa15e8633aad9e8703414323ce01b48049268b00c）有阻断D3-AR1：T已绑定RefA与A副本，bindRefB成功后present仍true，tenant-only readReplica会交旧A，违反S19下次取用/S20按ref。独立发现保留；新设计必须使此顺序反例取正确值或明确失败，中心传播范围不免除本机规则。新稿及CCL技术投影另审，未由D074接受。

## 2026-09-27 模型凭据来源有限复审

目录 RefA 绑定切至 RefB 后，tenant-only 读可能交旧 A；原 ca2 候选的 D3-AR1 为阻断，未据它开工。新模型来源投影存 sourceRef 并把 tenant/ref 编入 AAD，实际同单元锁读共同绑定行；轮换与写入排序，错源无 factory 回退。architecture-reviewer core_projection_review 在 6b57/3ea 及最终 699859/e02 两轮均确认设计闭合，不声称 MCR-V7/V8 或目录 V3-10/V3-16 已执行。

spec-reviewer binding_batch_spec_review 首轮指出 B1 未列技术端口失败集合及 B2 构造/执行权限混淆；最终逐失败和逐 symbol 表已明确正常 body/absent、StorageUnavailable 单元退出后映射、缺陷不降格、bootstrap构造/传递与CCL/P1r读取分离、装配唯一关闭，原 B1/B2 闭合。最终 design SHA：目录6998595474dcc847a4da354fed90195d6b52368313515d7af98da84c6a48f671，CCLe02af1cb236928f9cb59298f3d7ae901730706ef726fec10ebfee23ebac1d30a。节点新增bindings均0；实际异常污染/回滚、静态权限及秘密扫描由实现补证。

## 2026-09-27 最终 runtime/runner/app 有限复审

runtime旧d91候选的RT-AR1为阻断：opened实际上提交却丢回执，独立函数正确给出零可见firstTokenAt的失败，若服务按此写before_first_content响应就与日志矛盾并可能跳过恢复。Q1–4隔离实际写者及流、权威读回和S33结算控制形成355稿；architecture-reviewer adaptation_architecture_review确认原两条交错设计闭合。spec-reviewer binding_batch_spec_review指出RT-B1系统停止S36与新隔离支歧义，主线沿既有恢复边界裁定并由原drafter补正常已知收场与失去连续性后恢复前提；最终RT9d73735d3c22033dd583f10f8c7ea61b5b6865769e25de652399a59e2949747a及节点31a46a46ad67bb6d1dd383cbc6a08a7a89d3354aa261d9db54ab8f7ae7d2ae99均独立有限复核无阻断，未加意图/操作/默认政策。新实例是真实验收义务，原有限模型不代证。

app原332稿的MAA-AR1裸revision五元组认证碰撞阻断，在49c87851856064ba0c33cc0c25d8b73a70a7b249d6a060fca3fcb0610da96bbf采用完整来源上下文/无损binding/实际route匹配与A-V13负控；MAA-AR2权限负控在A-V14补齐。core_projection_review有限复核二者保护点闭合，binding_batch_spec_review对限定表达检查未见阻断。OS权限、真实IO、opened恢复和37认证仍无执行声明，bindings新增均0。runner最后e2fcc节点439f与pi节点297d沿此前无阻断评审采用；各未交付全产品分支原缺口保留。

## 2026-09-27 MF4/AR4 原 fill 读面独立复审

architecture-reviewer 与 spec-reviewer 分别只读核对 MF4 contract `46c3d605fb889c6f66822f8aecb815c1e691bf605600a036dc48ac0c9aeb6a2d`、AR4 contract `23ce5e5b88dbdaf4062184e2a0324cf0b75cd5af86cdf79aebaba05354c9b414` 和 candidate 登记 `12d70a309a48062419749cfaa2b37a6842a2d6ee2cfe4c3fb46c9f6db9b23f38`。两者均无阻断；MF 保留同会话/H 的完整 given 事实，AR 核 assembly/六表/唯一根用途，reload CAS 漂移全重做，refresh 保留 H 观察点，EIS 当前事实不冒充共同快照。

spec N1：MF4 examples 第3行仍写 v2，主线仅改归属为 v4；最终 SHA `d0e78471062e824c1723129822d7fefac38eef9a96196d386e4f874033f01d45`。contract 不变；其他实例正文和行为场景不变。47项 covers 全保留 reviewed:false。原4,977历史／六负控只支持声明的有限抽象值关系，未验证真实提供者/授权/重启。

独立 architecture-reviewer 随后核 MF4 provider `d2394261503f5a37b39f67a6e11b552c19c218564e008bcf4884235be99c2784`、verification `739927b83c3f8f7ba097d1dc0cbdf8213da6fc13cb94f66b61b1f8fdfaabdfb3`，无阻断。明确 parent 首语句 UNIQUE 才能同事务重判；table failure 整次回滚；实际安全容量与数学请求域分离；真实结束后诊断，巨大 H 不 stringify。PG、MG-V及真实 AR/EIS 组合未覆盖。评审未修改稿、未运行产品测试、未接受；技术采用另见 D-079。

## 2026-09-27 AR4/EIS 历史正文联合复审

core_projection_review 对 AR4 provider 初稿及有限顺序修订独立评审，无阻断。最终 design d5d53046909700936b839a7142406bff606b55b33c050d9b6ef21ec467a0ba60，verification 19d6c7d6a87e6d7fcff067e68d78f9cb2cff1bf9efbf30fcc43d467ed6cbb7da。原给定来源、七操作、共同 SQL 对象、reload 全套 CAS 与 refresh 固定 H 的分工维持。联合核对确认 STT 先核租户再 MF 真表，EIS/OG 同 atomic 后再纯判定；同租户另一会话仍须 AR/可信入口核实际 session/run/attempt，STT 不替代入口授权。

adaptation_architecture_review 对 EIS history revision 1 独立审阅，无阻断，design 9313dcbe4788f4e72b1be13b05b109d55f7d5aa70d928e24927af49bc9e584a0。真实原表 tuple、当前资格与 immutable 正文分配明确；两 owner 的不可变事实允许独立读取，不新造共同事务。重复 MF 回读与全版本序列成本已标价，尚无实测。

binding_batch_spec_review 对两包联合表达复审，无阻断；116 个本地引用路径可定位。唯一非阻断 N1 是 EIS README 仍写先 MF 后 STT，主线只改摘要，README 最终 2b18a74027adc265ed83742f298802fe467122055ebf16cfe2c62035baf87fb2；reviewer 有限复核确认 N1 闭合，其余五份输入不变。三位 reviewer 均只读，未测试、未接受。HI-V1～9、V4-1～15、真实旧报告/未持有旧版本成功恢复及观测/静态权限/换代仍未验证，不因本评审关闭 AR4-G3/HI-G1。

## 2026-09-27 必要日志载荷投影独立评审

session-log-jsonl 的 [v2-design 候选](../../../realization/packages/session/session-log-jsonl/v2-design.md) 初稿 SHA256 `6dd4ac87b116f31f8dc0d010d2eb31e6beb6f1885be932fa8d9da1fc64adbc11` 经独立 architecture-reviewer 与 spec-reviewer 只读核对。架构阻断 AR-B1-1：带 Run 的响应预读当前尝试后构造 `late`，新尝试或运行终结可以在无栅栏响应追加前先提交。共同 JSONL 只能排序写，未保护提交前判断；MR4 S-35、CA2 S-39 的实际写入时语义尚未兑现。这是已采用 runtime L-4 的继承组合缺口，不能以 ResponseId 判重、再次普通读取或进程内锁关闭。

表达评审指出 MR4 字符串响应头与传输多值数组冲突、写入不可信时 fence／重启顺序歧义，以及公开无损载体的澄清。候选修订 2 SHA256 `a3cd98478faf5d158a8b09dd8e1491db568b4cc93091b0dc560b6e74a20ffbb6` 分开两种保真验收、先关停／重启再确认新 fence、读方权威恢复领域类型。有限表达复核确认原表达发现已处置，无新增表达阻断；架构复核确认范围处置一致，**AR-B1-1／G2-7 仍阻断带 Run 的 late／结算组合**。SL2 不透明三操作可按其采用和验收前提独立推进，没有暗增第四操作或载荷解释。G2-6 多值头的持久投影仍交 runtime／response owner。

两次输入快照、四份评审原文及来源封存于 [评审归档](reviews/session-log-jsonl-2026-09-27.tar.gz)，SHA256 `37cfab94e74894d01564b50cc6ca3688b11a6cbd5072bf286c4bd1a3d8f7f080`；[索引](reviews/session-log-jsonl-2026-09-27.json) 列 102 文件、64 冻结资源和 4 已采用设计核对，来源漂移 0。归档是只读评审记录，未执行提供者 IO、并发、故障恢复或形式任务，不产生候选接受或实现通过。共同键 codec、旧写者实际静止、owner 交接及权威恢复尾的真实证据仍开放。

## 2026-09-27 远程工作区产品输入正式化及用户追加裁决

本次在model请求纵线同步 `origin/main@2844a95d` 后，依产品负责人授权将PR #13的12个PF已确定工作区增量登记正式；这只是本提案持续消费者的产品输入补齐，不接受新版资产接口或提供者、不扩建通用资产产品。

三个独立product-design-reviewer分段只读核对：PF001/002/020、PF003～007、PF014～017。PF002旧单租户取舍与共享实例验收矛盾修正为rev25，定向复核闭合；其他版本元数据、身份／会话／交付边界及业务所属PF误引修正，旧未决与接受范围保留。评审不验收技术实现。

评审揭示外部仓库首次登记的治理归属缺口，产品负责人明确“没有治理者，都是参与者”；随后明确启用组织限制时外部仓库“不再认定为是 workspace”、普通目录无法禁止，为best effort治理。新修订PF00123/PF00226/PF02022据此区分Host治理所有者与外部仓库仅参与者，受限时不附着、不加载工作区来源；不改变普通工具权限、不删除全局身份／关系，也不热重判既有运行。独立新裁决评审无本次阻断，两处非阻断概述／历史归位已修。

逐条复核97项出处、83个章节，更新140个版本字段；仅3个UL定义、参与限制注意栏及2个对象范围校正，没有发明寿命宿主或外仓终结策略。官方对象视图生成／默认对账通过：241词条、44对象、8待裁。原rev25的47项复核独立保留。

[产品输入与独立评审摘要／逐条审计](reviews/workspace-products-2026-09-27.tar.gz) SHA256：`8207a31693c1b633a2b39af05248b7741578b40b74e3648b8af6b15b30c0d440`。归档保存远程原稿、正式化后追加裁决前快照、最终产品／词条／对象／视图与源审计。review-summary.json明确为主线据独立消息汇总，不冒充reviewer原始全文；输入、未覆盖及user原话单列。技术新规格和模型消费者仍沿条件PU阶段接续，既有冻结契约不变。

## 2026-09-27 late 提交协调方向独立架构评审

独立 architecture-reviewer `b1_late_boundary_review` 只读评审 [三候选正文](late-coordination.md)，精确 SHA256 `ba2e68bf7e404a9fdb1d6ef16f8e7bd9df86891eb6096b14dfc6eb8814538c05`，观察基线 `ea000728`。结论：本次方向选择无阻断、无新增非阻断，支持 B 在已有 session-log 的权威追加提交点保护日志尾一致；存储仍不解释 Run 或响应，runtime／回复写方拥有 late 与完整批次。评审不是接受。

该边界依赖从同一次合法完整日志读取取得事实与尾，所有响应写方采用保护，以及丢回执后先认回原完整批次。独立评审保留 A 的完整相关写方链、C 的全历史派生读面作为有力替代；若 B 的实际无关争用妨碍所承诺进展、合法前缀不可得，或三操作恢复无法闭合，必须重比候选而非削弱保证。确切新契约／失败优先级、形式模型、真实日志 IO／重启、Run 终结认法、旧写方实际停止、权限、重试上界与消费者迁移均未验收。

领域读数、独立机制读数、主线对账、精确输入、候选、结构检查和独立意见的**主线汇总**已保存为 [归档](reviews/late-coordination-2026-09-27.tar.gz)，SHA256 `1cbafd04f9ed9828bc99472814e62ae34b1609902339354e8757e191b4b3dff2`；[索引](reviews/late-coordination-2026-09-27.json) 含逐文件校验值，已读回核对。review/primary-summary.json 不是 reviewer 原始全文；reviewer 按角色边界未读主线处置对账表。HUB 合入候选后的 design internal 检查通过，formal 明确 skip。

归档中的主线有限实验实际执行了每模式 360 条历史：普通预读追加出现 96 条错误 late，提交点尾比较模式为 0；后者有 248 次条件冲突、96 次写入静止后重试。实验未覆盖真实 IO、unknown ack、Run 认法、授权、崩溃、旧写方停止、公平性或无限争用，不据此关闭 B1。主线只采用演进方向，见 [D-081](../../decisions/model-late-coordination-direction/decision.md)；SL2 原字节与旧采用不变。

## 2026-09-27 完整模型窄定义投影独立评审

本次为现有提供者的 [完整定义增量](../../../realization/packages/model/pi-ai-transport/v4-definition-design.md)；没有新增产品方案或重新分能力。rev1 SHA256 `226001dd3d7dda5055b334f9140e7e8392a5394d37ef7293242112b8cf58a65c` 的架构阻断 ND-AR1 是旧37五字段集合会在根导入时被新完整校验拒绝、默认 pilot 与真实消费者无迁移方向。主线明确预生产无兼容迁移，作者补齐删除旧集合及默认、显式 definitions、空动态 network owner、旧宿主排空和全部消费者责任；architecture-reviewer 定向复评 rev2 `a7ec2ca698a04f5adae9a5f5756e90419661fbbaabf613486c82eb6fb5cc0411` 关闭 ND-AR1，无新架构阻断或非阻断，ND-V9 仍待实际执行。

独立 spec-reviewer 核对完整定义→content→目录独立采用→acquire 路由联集→plan 本次路由的消费者路径，无表达阻断。唯一非阻断 ND-ER1 是 ND-V2 概括会把当前 maxOutputTokens only-pass 误当 drop/select 正向场景。作者仅改这一行：八项原值／缺席正向，其余允许规则项测 drop/select/adjust，maxOutputTokens drop/select 为非法定义负控，G-22/S-18 保留。reviewer 在内存还原这一行得到原精确哈希，定向确认闭合；最终 SHA256 `13f0bdfe97c885fd521da924b6c1d432577d1f669c22081ea5eafd147f61ceda`。

两个 reviewer 均只读、未运行测试／形式工具、未接受。当前共用实现 revision6 修复不在该表达评审范围；ND-V1～9、37模型完整能力／参数／TTL与布局、跨宿主实际资源及消费者迁移均未验收。[输入、三个修订、结构检查与主线汇总归档](reviews/definition-projection-2026-09-27.tar.gz) SHA256 `1784c3140d8a6172c85ea863f1c5f3fb6a4c684c7d1368138376a0b63e840368` 已读回校验，[索引](reviews/definition-projection-2026-09-27.json) 逐文件登记。汇总不是 reviewer 原始全文；设计合入 HUB 后 internal 检查通过、formal 明确 skip。主线精确技术采用见 [D-082](../../decisions/model-definition-projection-adoption/decision.md)，旧 v3 字节不变。
## 2026-09-27 session-log v3 规格整包独立评审

依据已采用D081方向，独立architecture-reviewer和spec-reviewer分别核SL3契约／消费者传播／形式工件。初稿contract `f7086724e58e736dc5dccc92dcd936eabda82c1cae5c0fbf523c966ed51e1fa8` 的架构评审无本包阻断；表达发现SL3-ER1：S35把稳定业务批认回义务无条件施加给合法keyless条件调用者，另ER2重交缺前置条件、ER3入口精确依赖写错。

作者修订S22/S35通用THISbatch零写与适用业务唯一性协议，保留keyless未知非幂等；S17重交按既定输入／租户／栅栏／判重／尾顺序，examples增三支，README依赖1/2/2/2/2。第二轮两reviewer均无本次阻断／新非阻断，ER1/2/3闭合。最终contract `f327f1289e1d6c539dd959e8862b382869e3d303cf984b6a773fdd6a00e4bd26`；26文件manifest `54575a682046204ead63792a977e61f2b08f29fb028c89d8206920944ad0e5d2`，整包排序摘要 `0a4f67e20b8d4717476c9c1445b949c3e6b45deafc985c800bda95004c9449a2`。consumer-impact、2TLA、18cfg与formalREADME原字节不变，旧SL2十资源未变。

[精确两轮输入、差异、结构检查和主线汇总归档](reviews/session-log-v3-2026-09-27.tar.gz)，SHA256 `28c424b0be9efb9869d23930ec83f2df357e21bf5b6059c97c899ed97725f5ee`；[索引](reviews/session-log-v3-2026-09-27.json)登记409文件，全部读回。primary-summary.json是主线据独立消息写的摘要，不是reviewer逐字全文。53项作者观察输入按精确hash保全：其中旧候选verification从已封存revision1取字节，brief为明确task虚拟路径；前两次归档来源解析失败保留，不冒称全部来自当前HUB。

独立形式执行 [run1](../../evidence/2026-09-27-formal-session-log-v3/README.md)只绑定旧正文及有限前提；未变模型继续适用，不重标成新正文已跑。两个reviewer未执行模型／产品工具或接受。本次最终技术接受见[D083](../../decisions/session-log-tail-condition-adoption/decision.md)；生产Run认法、完整批／共同键、真实IO与旧writer停止及RT3→新消费传播仍须原owner闭合，withRun尚未放行。

## 2026-09-27 SL3 JSONL 提供者投影独立评审

依据D083已接受SL3，独立architecture-reviewer和spec-reviewer核既有[JSONL节点增量](../../../realization/packages/session/session-log-jsonl/v3-design.md)。rev1 SHA256 `c26b03b9ee84c3bd809e61cd1bf2538d819ff4734e7178100d041d9897335849` 的架构评审无阻断；表达唯一SLJ3-ER1为旧verification V5的截回失败读旧确认尾与新不可信三操作unavailable验收相冲突。

作者rev2仅升修订号及两处明确替代：旧design该读取行为和旧V5对应预期改由SLJ3-V8承接，成功截回、其余故障注入／机制与部署前提保持。两位reviewer定向复核无本次阻断／新增非阻断；最终SHA256 `f8561eed58597fbb972d474b14648f74f74cafae3d1125f7813a45a4c241b351`，28项输入无漂移，汇总摘要 `6e57ee89189bc356eca20b93e4fa6ae03fb991d8cdfc46a35ed068bf8a0e9bd9`。旧四件套及v2输入在评审时字节不变；表达检查20链接、SL3 24资源和旧SL2 10冻结资源符合。

[输入、两修订、差异、作者结构检查及主线评审摘要](reviews/session-log-jsonl-v3-2026-09-27.tar.gz)，SHA256 `70b5b1eb70c43f35b899e0a33952874d3659a773491636bbe9161ff62c874360`；[索引](reviews/session-log-jsonl-v3-2026-09-27.json)47文件已逐字读回。primary-summary不是reviewer逐字原文。11新oracle及所有真实IO尚未执行、bindings0；评审未运行产品或形式工具。索引信任、重启停顿／全量扫描和文件机制取证成本作为强反方保留。技术采用见[D084](../../decisions/session-log-jsonl-v3-projection-adoption/decision.md)，不自动升级RT3/SL2依赖或证明Run认法／旧writer停止。

## 2026-09-27 runtime共同业务编码窄投影独立评审

独立architecture-reviewer `b1_late_boundary_review` 与spec-reviewer `p2_narrow_projection_expression_review` 只读核对[同runtime节点增补](../../../realization/packages/model/model-request-runtime/v4-log-codec-design.md)，226项输入manifest SHA256 `39cd81433d5a676453d724579cb7646a25471432922bccc3e0dacf24f63944f4`。rev1 `ab502ec8045528ab3c7c8c5c45c2e0c54b55022a3d33b79c30c9108cfc024c84` 的架构评审无阻断：K1／P1纯构件不新增事实权威，G29-P可以承载既有RT4全部写方／合法历史组合义务，但尚无真实来源和全路径采用实证。公开批边界对混杂历史的优势、历史清点代价和码元键体积成本作为强反方保留。

表达初审发现G29-ER1原批身份与败方候选身份适用域冲突、G29-ER2写前候选被要求具有读后耐久位置两项阻断，以及G29-ER3字段路径错误。作者rev2仅消歧相应谓词、结果表／C-V6并修正`R.timing.firstTokenAt`，K1／P1／G29-P字节不变。定向只读复审确认三项全部闭合，50行差分与实际一致，邻域无新问题。最终精确SHA256 `f537277f2610b2d98169c69d5c71fcbb3e62fd65de3364ae0ff5148603e92c27`。

[273成员归档](reviews/model-runtime-log-codec-2026-09-27.tar.gz)SHA256 `e4df3c0e9e67ab5a186d3c98899b99a39534a161e56d74efa4eb2789bdbc0bf9` 已逐字读回，[索引](reviews/model-runtime-log-codec-2026-09-27.json)列原输入、两个修订、作者检查和主线明确归因摘要。评审文本是主线据真实消息保存的摘要，不是reviewer逐字报告、测试或采用。作者结构检查formal=skip；C-V1～10、实际竞争／旧写方停止／历史来源、G28／G30／G31、十三操作及37认证均未验证。精确技术采用另见[D088](../../decisions/model-runtime-log-codec-adoption/decision.md)，只关闭采用步骤，不据相邻成员认定物理同批。

## 2026-09-27 原core精确RFC3339比较窄投影评审

独立architecture-reviewer与spec-reviewer只读核对[offer-expiry增补rev1](../../../realization/packages/core/offer-expiry/rfc3339-order-design.md)，候选SHA256 `249c68ea3239977131cc44be3d75dbd31474e0659355258c2606833eb2bfaab2`、77输入manifest SHA256 `a501cf6acf822f9c71adff43b55ed27d9faf76ec115d6e33ad9c8ea112f27a8d`。两份本次评审均无阻断；架构结论仅适用于B／R1合法时点前提下的条件排序，表达结论不证明算法。

原owner承接任意小数／合法偏移／闰秒顺序无需全局Clock改表示；R1的ok不能证明实际闰秒合法性，G29-P物理来源本身也不能代证具名时间生产链。TL-G1缺前提的完整批仍不可确认。双入口误用、线性成本、A的隔离半径／C的统一表示／R2适应混杂来源的优势与改票条件保留。两评审未执行tests／IO／TLC、未写文件或接受。

[107成员归档](reviews/model-runtime-rfc3339-order-2026-09-27.tar.gz)SHA256 `8329a9c9b79549904c730cfe3df702dade98dff10c4ec8cfad60be950fb53807`包含77原输入、候选、作者检查及主线明确归因摘要，全部逐字读回；[索引](reviews/model-runtime-rfc3339-order-2026-09-27.json)钉逐文件hash。主线摘要不冒充逐字reviewer原件；源码／TO-V1～9／双语制品／TL-G1与完整runtime门均未验。技术采用另见[D089](../../decisions/model-time-order-projection-adoption/decision.md)，未改冻结OE1／OE2或MR4时间域，新增bindings0。

## 2026-09-27 多值响应头／MR5-RT5 与 core v5 独立评审

两轴 A/A 的 architecture-reviewer、完整 MR5/RT5 的 spec-reviewer、core v5 rev1 的两角色独立只读评审均无本次范围内阻断。受审 MR5 c4cba40c…／RT5 21c3ef25…，core `5c2e633b771e5d262d4d5240310f7d8bf9cd735a36259d4a6e70b749bf41eb94`；详细责任与未覆盖为 [root 据实际角色消息保存的归因摘要](reviews/model-headers-v5-2026-09-27.json)及其完整归档，不能当逐字 reviewer 原件或产品执行。规范整批的 runtime D087 导航滞后与 core 旧候选导航由本次当前段落修正；旧记录不覆盖。无新增产品政策，codec mrr/1／新格式仍归共同 owner。

主线 [D-090](../../decisions/model-headers-v5-adoption/decision.md)只精确接受完整规范与 core 投影。PV1～9、RT5-H1～6、真实 TLS／秘密／停止／append-reopen、全部写方及十三操作和37认证均待；新增 bindings0。评审归档全部212成员原字节读回，SHA256 `53a1c0fc4076998cf4db91c8edf9bb0dbc317fa42fb3be7cc9c3d0b8bcc89777`。

## 2026-09-28 十三操作统一组合收口的窄复评

主线据独立 architecture-reviewer 消息保存的归因摘要（非逐字原件）：受审 runtime v10 SHA256 `9237c1744b3c3bec233274f50ad1ae0a7c039ca842880e30c765f57f95637be7`，新增“统一组合的全部调用收口”段无新阻断；唯一store owner、同步关准入、全部容器停止、迟到资源回收和全部实际释放后成功均有具体承载。原B1跨L1/L2未知调用责任交接仍阻断该分支，不扩大到healthy noRun。

独立评审认可 root 对 selection 的条款解释：RT8 S27⑧保持原命令结果未知，SL3 S22/S35没有给无键命令恰一次认回保证；原追加和回调均实际停止后，可释放该命令物理registration，不追认成功或自动重放，不移除日志提供者自己的IO责任。已知反方“迟到旧selection覆盖新选择”要求留住仍活跃writer，不支持已停止后永久持有。最小验证必须区分ack未知且writer活跃/已停，零重放且原返回均不升级成功。未执行测试或接受；主线范围采用另见[D-102](../../decisions/model-runtime-owner-close-adoption/decision.md)。
