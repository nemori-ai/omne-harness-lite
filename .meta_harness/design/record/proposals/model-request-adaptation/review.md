# 评审记录

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
