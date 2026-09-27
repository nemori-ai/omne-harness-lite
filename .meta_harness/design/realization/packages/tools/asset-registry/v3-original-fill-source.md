# asset-registry：原完整 fill 来源的公共认回

本稿是 **candidate，未采用**，只补本节点的来源交接分析与有限投影，不修改已采用的 [v3-design.md](v3-design.md)。节点及源码归属仍为 `packages/tools/asset-registry`；本稿不新增插件、持久表、领域记录或规范操作。所有技术构件名均为候选。**现有公开契约不足以完成任意历史下的原完整 fill 恢复；SI-G1 保持阻断，停止依赖该恢复能力的施工。**

| 分层状态 | 本稿事实 |
| --- | --- |
| 语义接受 | AR3、MF3、AE4 已由 [当前输入契约采用决定](../../../../record/decisions/model-current-input-contracts-adoption/decision.md) 接受；本补充未采用。MS2、SLog2 采用既有 v2；不改它们 |
| 可实施范围 | 已定位完整 fill 记录的纯字段提取、已有公开读面的有限认回可供独立审查；通用恢复、完整重新 fill 后的可靠接续及其并发消费受 OF-G1/2 阻断 |
| 绑定与证据 | 0 新 bindings；下述 OF-V 场景是尚未执行的义务。反例是可重放的契约走查，不是产品运行证据 |
| 实际验证 | 无本稿产品验证；独立技术闭包实现或原节点测试不能关闭本稿及 EIS SI-G1 |

## 精确输入与“原 fill”的时间范围

baseline 均为 `omne-harness-lite-design-2026-09-15`。AR3 指 [`capability.asset-registry/v3`](../../../../spec/capabilities/asset-registry/v3/contract.md)，MF3 指 [`capability.assembly-manifest/v3`](../../../../spec/capabilities/assembly-manifest/v3/contract.md)，AE4 指 [`capability.asset-evaluation/v4`](../../../../spec/capabilities/asset-evaluation/v4/contract.md)，MS2 指 [`data.messages/v2`](../../../../spec/data/messages/v2/contract.md)，SLog2 指 [`capability.session-log/v2`](../../../../spec/capabilities/session-log/v2/contract.md)。本稿消费 [D-077](../../../../record/decisions/model-source-interfaces-adoption/decision.md) 已采用的 [EIS source interfaces revision 1](../../assets/evaluation-input-store/v3-source-interfaces.md)，SHA-256 `1d0be74b524b6609c2a1d61e5ce49ebdcf3247026b710458a951823ee83640b6`；其 SI-G1 是本稿的输入缺口，不是已满足前提。

AR3 S-22④规定：已有表时完整 fill 是完整重新装配，六张整批顶替。S-23④的 reload 保留该会话装配所依的定义版本与根；S-24②沿用该根，最近 reload 影响其中规定的工作区读入配方，不产生新的完整装配。故本稿的“原 fill”指**所消费当前完整装配对应的、最近成功提交的完整 fill**，不是会话出生时第一次 fill，也不是最近一条 mint。旧报告所依表的历史恢复另沿 S-25/S-33，不把本稿的当前原 fill 强加给旧报告。

这是从上述条款得到的投影：可信 AR3 写者的完整 fill 对应 MF3 `given`、`content.filledBy=assembly`、六类表同记录提交；reload 对应 mint，收窄对应 reuse。MF3 S-5.4 明确没有定义完整清单的切分、复用与失效；本稿不据此补完整 PF-004 生命周期。源选取只针对上述 AR3 完整 fill 事实，若需要比“最近成功完整 fill”更多的活动清单判定，仍归该契约 owner。

## 现有公开面能认回什么

| 公开面与坐标 | 可用事实 | 不能从它推出什么 |
| --- | --- | --- |
| MF3 S-16 `readHead` | 同一读视图的 head 与每类最后一条完整记录，含 session/seq/evaluation/evaluationRef/tables/content | 不列历史，也不保留“最后一次 given”槽位；全部类别已被更新时没有原 fill 定位值 |
| MF3 S-18 `readHistory` | 给定同会话 category/filledAt，精确读回不可变记录；S-9 保证该键至多一条 | 必须先知道 filledAt。记录中的表时刻是本记录的时刻，不是前驱时刻；没有前驱、区间枚举或按 seq 读取面 |
| MF3 S-17 `append`、S-8/S-22 的 given 认回 | 已有真实 given 请求与引用的回执丢失重交可得 `alreadyRecorded{record}` | 不是按任意 ref 的只读查询；未知 ref 可能真的写入。AR3 S-22⑦在任一表已换后拒旧 fill 为 evaluationSuperseded，不能以 fill 重试恢复任意原 fill |
| MF3 S-19 `dependencyPresence` | 同次读的具名依赖在场事实 | 没有装配历史或来源定位信息 |
| MF3 S-32/S-33 `readEvaluation` | 固定本次读的 head 上界内最近 given/mint 的 E/O/ref | 不区分当前完整装配的起点；返回不带源记录壳、filledBy、六表时刻或该 head，不能与另一次 readHead 拼成同一读视图 |
| AR3 S-48 的现存 content 与 table 字段 | 三字段完整 E/O/filledBy；每表 composition/filledAt；basedOn 只取壳 evaluationRef | 不能加第 4 个 locator/rootSource 槽位，不能往每条表构成混入来源元数据；root 的生效资产/版本说明该 E 的值，不说明它属于哪次完整 fill |
| MS2 §一、S-18/S-49/S-50；SLog2 S-2/S-3/S-6/S-11/S-17～S-19 | MS2 定义消息及五种模型运行时记录；SLog2 可按键/位置读回已提交的 opaque payload | 没有已定义的装配来源载荷、读取键或与 manifest 的提交关系。可存 JSON 不授权 registry 创造领域记录；SLog2 明确不参加其他 owner 的事务 |

`EvaluationRef` 只作同一性比较，绝不解析。枚举猜测 Instant 不是恢复算法：契约不给原时刻的候选范围、前驱或可完成的搜索上界；无论观察了多少次 `recordNotFound`，都不能据此声称原 fill 不存在。

## 契约责任到本节点的有限投影

| 编号、责任 | 候选构件／服务处 | 兑现点 | 符合性依据或缺口 |
| --- | --- | --- | --- |
| OF-1：AR3 S-22②④、S-48.3～5；EIS SI-2 | 公开纯 `extractRootSourceFromFullFillRecord` | 从显式记录检查 given、assembly、六表及完整 E/O，按 E.root 的能力身份匹配 E.assets 中唯一项，保留 asset 与精确 version | 复用 AE4 公共结果读取、AM3 身份与无损 JSON；函数只验证给定值，不证明记录已提交、来源可信或是当前原 fill；OF-V1 |
| OF-2：MF3 S-16；AR3 S-22④ | 服务内部同一次 readHead 的有限选择 | latest 中若仍有合法 given/assembly 六表记录，核 session、seq≤head、同 seq/ref 的重复出现内容一致，再取该原 fill | 可信 AR3 写入前提下，后来的完整 fill 会覆盖全部六类，旧 given 不可能再留在 latest；若多份不一致或不存在该证据，不能选最像的一份；OF-V2/3 |
| OF-3：MF3 S-18/S-24；AR3 S-33/S-48 | 已有可信定位值的历史读取与纯提取组合 | 用已知 category/filledAt 读原记录，再核壳与目标 fill 身份 | 只证明“这条历史记录是什么”；不能仅凭该条仍在就证明它仍是当前原 fill。通用定位/当前性缺 OF-G1/2；OF-V4 |
| OF-4：AR3 S-23/S-24/S-31/S-50.5；D-077 | 固定根来源交给 EIS `./registry-inputs` | 仅来源与本次消费边界已核实才调用；EIS 真读指定不可变正文，保留当前持有，由实际 C16 确认失配 | 原 fill 缺失/不能定位时不调用 EIS，不用当前根、creation source 或旧内存补值；OF-V5/6 |
| OF-5：AR3 S-17/S-18/S-22⑦；MF3 S-12/S-17 | 原有 fill/reload 换表闭包 | given 及六表/三字段 content 保持一次提交；来源的当前性与实际 append 所用 head 必须相关联 | 不新增“来源保存”副提交；源公共定位不足时停止该消费，不另开表或日志填空；OF-V7/8 |

OF-1 的公开函数不依赖 Cordis、会话日志、EIS 或存储。请求者须显式交记录与所核会话身份；函数不能自行补 tenant、猜 assembly 身份或返回“已授权/当前”的标记。严格 JSON 与结果读取错误作为值校验失败交回；实现异常不混成来源缺失。根项缺失/不唯一、记录非完整 given/assembly、会话不符或内容不合形状，均不得产出可供固定读调用的来源。**提取成功也只得到这条记录指认的 asset/version。**

## walkthrough 与失真历史

1. **初次完整 fill。**装配真实读取 A/v1 正文并 evaluate，registry 检查 E/O，按 AR3 S-22 一次 given 提交六表。rootSource 不另存：它已可从该记录 E 的唯一根生效项提取。提交前内存中的 E 不构成已提交来源；结果未知不能当作没写。若回执丢失且装配仍持有完整原请求，沿既有 given 重交认回；没有原请求时不能生成一份假请求查询。
2. **重开且仍有 assembly 表记录。**同一次 readHead 里至少一类 latest 仍指向该 given/assembly，OF-2 能在前述可信写者前提下确定最近完整 fill；OF-1 提取后才可进入固定正文读。某一类最新为 reuse 时不能把 reuse 的 filledAt 当作原 given 的 filledAt，也不能只看 evaluationRef 就把 reuse 壳当原壳。
3. **重新完整 fill。**A/v2 的新真实 E 以新 given 一次顶替六表；新的固定来源来自新记录，旧 creation source 与旧 given locator 均不足以证明当前性。重试旧 given 仍是 S-22⑦的 evaluationSuperseded。重新 fill 与首次 fill 即使 E 完全相同，仍是不同提交与来源认回目标。
4. **六类全部 reload 后重开。**依次 reload tool、skill、slash_command、loop_extension、mcp、plugin；可选无 plugin 成员、空表也按合法空排列 reload，避免连带掩盖场景。六类 latest 最终全为 mint，readEvaluation 也是最后 mint。原 given 仍耐久存在，但公开输入没有它的 category/filledAt，也没有遍历记录入口。OF-2 在这里停止，OF-3 无定位值不能启动；不把 mint 的根值相同当成找到了原 fill。
5. **reuse。**在上述历史后收窄 slash_command 表，content 保留该表旧 E/O，引用沿旧源；既不生成完整 fill，也不保存该 fill 的 locator。若尚存的最后一张 assembly 表正是它，被收窄后 latest 中的 given 证据也会消失。AR3 S-28 不改 skill 等其余五表。MF3 readEvaluation 的不回退规则继续成立，与本稿原 fill 定位是两件事。

**OF-X1：同一公开尾部不能认定完整装配起点。**用两个隔离清单重放以下两段合法历史；T1<T2<…<T8 为每类递增的真实 Instant，E/O 取根为 A/v1 的真实成功结果，根引用包含可收回使用权限的 slash_command c。两段在 seq≥3 时恢复相同当前权限与源事实，使后续 reload 的 E/O 相同。忽略 opaque 新引用的具体随机拼写，按一一相等关系对照，不能解析其中字符。

| seq | 历史 H1 | 历史 H2 |
| --- | --- | --- |
| 1 | given F1，六表，T1，assembly | 相同初次 given F1 |
| 2 | 撤回 c 使用权，真实 onAssetChange 只收窄 slash_command，reuse F1，T2；随后恢复权限 | 相同 E/O 再完整 fill 为 F2，六表，T2，assembly |
| 3～8 | 依次对六类别完成 reload，六条 mint M3～M8，使用同一批显式时刻、构成和当前事实 | 同左 |

终点 readHead 的 head 同为 8，latest 全是对应 M3～M8；readEvaluation 同为 M8，dependencyPresence 可完全相同；按**已知尾部** filledAt 做 readHistory 也只得到相同尾部。H1 的目标原 fill 是 F1，H2 是 F2，且它们的根值可以完全相同。当前表、求值根值与时间戳大小都不能给这两者定身份。对未持有 T1/T2 的恢复者，每一组有限猜测时刻都可用另一组合法、更早的 T1/T2 避开；不能由有界未命中判定历史不存在。此反例针对**公共恢复协议缺少定位信息**，不声称底层文件或存储本身丢了记录。

**OF-X2：创建来源不是最近完整 fill。**先真实 fill A/v1，再完整 fill A/v2，随后六类全部 reload、重开。creation source 仍为 A/v1；若拿它调用 EIS，真实 current=A/v2 将触发 C16，不是合法恢复到了新装配。直接取最近 mint 的 A/v2 虽可能给对数值，仍没有认回新 given 的身份、提交范围与依据；本稿不以碰巧同值关闭 SI-G1。

## 并发、提交与失败的边界

**已有提交保护可复用，缺失读协议不能由锁代替。**registry 新旧写者实际都经 manifest append 触碰同一 `assembly_manifest_record(session,seq)` 及对应 `assembly_manifest_table`，期望头判定与写入同事务；这些是 [manifest 节点既有共同对象](../../assets/assembly-manifest-store/v3-design.md#存储要求与共同对象)，本稿没有独立持久写者。EIS 发布使用自己的 `evaluation_input_head(store_key)` 与本批源行；同一源读取内有真实快照，但它与 manifest 原 fill 读取**没有新增共同事务**。SLog2 的 JSONL 提交也不触碰上述 manifest 行或约束；即使两个提交各自耐久、都幂等，也不是同一次装配提交。

| 交错／失败 | 现有责任与不能声称的结论 |
| --- | --- |
| reload 读 head=h/F1，完整 fill F2 先提交 h+1，旧 reload 再 append | expectedHead=h 必须得 headMismatch、零写。若可重做，必须重取适用原 fill、EIS 当前输入、E/O 与目标表；不能只换 expectedHead 为 h+1 后重交旧 E。原 fill 无公共定位时依赖不可用，不临时用 F2 的创建来源 |
| 原 fill 已核，EIS 源由 p 变 q | EIS 一次 read 内仍是某一真实一致快照，current/pinned 原样；C16 按该快照实际判。MF 头没变不证明 EIS 修订没变，也不允许给输入补旧持有；S-66 current 面不能接替 fixed 面 |
| refresh 读取表/head、读取源期间完整 fill/reload 发生 | 两个独立读不能拼成一个未声明的原子快照。候选交接可用同一 head 选择记录及表、源读后再核 head 的无变化区间；头改变就不能继续拼接，重做与有界耗尽沿采用策略。具体公开来源读必须能提供该 head 关联，现缺 OF-G1/2，尚不可实现为完整保证 |
| recheck 之后又发生 full fill | 核对只说明已观察的区间，不锁住未来。只读 refresh 的适用观察点、旧报告继续消费沿 AR3，不凭额外内存锁新增“返回时永远最新”；写入仍须在真正 append 点检查相同 head |
| manifest 已 given 成功，进程在额外 JSONL locator 写入之前崩溃 | 若擅加日志方案，新的六表已经生效但 locator 仍旧；先写日志则会出现 locator 指向未提交记录。SLog2 S-3 无参与面，现有规范没有认回/补偿协议，本稿不采用这种双写 |
| 记录不可读、定位未知、内容畸形或无法证明适用来源 | 按 AR3 S-22/23/24/32 对应 unavailable；不交新报告、不换表、不追加“修复”记录。只有确证没有装配记录才可 sessionNotFound；参数错误仍走既定 invalidInput，程序缺陷不 catch-all |

**本稿的存储要求为无新增。**若 owner 选择补公共读取，最小需求是让读者取得既有不可变完整 fill 记录及其与该次 head 的关系；不需 EIS 或 registry 再存 rootSource。如何实现索引是 manifest owner 的事，不把候选索引当新的领域权威。任何未来要把来源判定与换表放同一次提交的方案，必须仍由上述共享 manifest 行/约束域在提交点判定；只读 EIS 再写旁表不满足。

## 最小 owner 缺口与停止线

| 缺口 | 最小需要表达的性质／责任 | owner 与受阻消费者 |
| --- | --- | --- |
| OF-G1：公开定位不足 | 在同会话一个明确 head 上界内，公开定位最后一次给定求值来源的不可变记录，并把它与该 head 的关系交给消费者；必须能区别无记录、内容不可读和来源不合法，不因最新记录坏了回退旧源。可由 MF 新版读面或显式扩展 readHead 承担；**不是 MF3 已有操作**，本稿不给最终名称/签名/新失败枚举 | MF 契约 owner 起草，AR owner 精确采用及核 given/assembly/六表。阻断全部 reload/reuse 覆盖后的重开、通用来源恢复与 EIS SI-G1 |
| OF-G2：原 fill 与本次消费的 head 关联 | AR owner 在既有 S-22/23/24/31 上明确消费上述来源的观察范围与并发重做条件；纯提取不得替代“本次完整装配”判断。MF 只提供事实，不反向理解 AR 的 filledBy；若需要完整清单代际政策，转 MF G-1/PF-004，不在本节点暗定 | AR 契约/节点 owner 与主线；MF/验收装配配合。阻断并发重新 fill 下 reload/refresh 的完整接线 |
| OF-G3：实际证据 | 真实 root body→evaluate→given→公共来源认回→固定正文读→registry 操作；含重开、重新 fill、全类别 reload、reuse、并发和负控 | registry/MF/EIS 实施者及验收装配；独立组件测试不能替代整链 |

作为供 owner 评估的**技术候选**，公开只读组件可读取既有不可变 given 记录，携带同会话身份与固定 head 的关联，再由 registry 校验 assembly/六表并提取根。它不解释 opaque 引用，不新添 content 槽位，不访问其他 provider 私有表；可以独立闭包实现。**若作为 MF3 服务额外方法发布，它改变公共恢复承诺，必须先由契约 owner 成稿采用；如果只消费已有 readHead/readHistory，它仍限于 OF-2/3 的前置。**两者都不能以技术导出存在宣称 SI-G1 已闭合。本稿到此停止依赖设计，不给缺失规范补临时恢复算法。

## 装卸、观测与取舍

沿 [D-025 Cordis 4.0.4](../../../../record/decisions/cordis-adoption-version/decision.md)，本稿无新 fiber/service/effect。纯提取无 IO 资源；服务只借 manifest 与 EIS 读闭包，取得配置/依赖并满足来源前置后才调用。缺少真实来源是对应调用 unavailable，不新增“缺来源时默认创建”的启动政策。未来配置若非法仍沿原节点启动失败。

| 装载贡献／所有者 | 何时可用、部分失败 | 撤除与仍为真的事实 |
| --- | --- | --- |
| 纯提取构件，本包 | 校验显式记录；不授予存储读取权 | 无资源待释放；已交出的纯值不会获得“永远当前”的承诺 |
| 借用 manifest/EIS，原 registry 实例 | 每次调用拥有其 Promise 和实际取得的不可变记录；来源失败不发布成功来源 | 关新准入，已受理调用跑完其真实读/append；不关闭他方存储。旧实例结束后丢弃内存，不把 locator 缓存转成耐久权威 |
| 有界结构化观察端口，装配 | 记录 session/tenant、操作、观察 head、原 given 的 seq/ref、category/filledAt、固定/当前 asset/version、EIS 实际修订（仅读面确实提供时）、失败阶段与实际提交结果 | 不记正文/E/O/配值或秘密；观测丢失不伪装来源有效，也不影响已提交事实；应用等所有借用调用实际结束后关闭依赖 |

提供者换代沿 basis [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)，清理不靠 disposer 先后沿 [effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)；原 probe 不代替本节点演练。没有上游事实支持“撤 fiber 会取消数据库事务”，本稿也不作此承诺。归装配：核真实 session/tenant/run/attempt；提供源发布、完整 fill 与既有调用；保留真实数据库和公开消费者；配置有界重做/诊断；避免测试 fixture 冒充原根来源。

| 关键选择 | 落选方最强论证 | 本方弱点／复核信号 | 置信度 |
| --- | --- | --- | --- |
| 来源仍由现有 manifest 记录认回 | registry/EIS 另存固定根可直接查询、重开便宜 | 缺公共定位须回 owner，短期整链阻断；恢复读成本待真实测量 | 高 |
| 有证据才有限提取，未知时停止 | 最近 E 根值通常与原 fill 相同，现成 readEvaluation 易接 | 不能凭通常同值证明来源，保守路径暂不能覆盖全部历史 | 高 |
| 请求 MF 公共固定 head 事实，由 AR 解释完整 fill | MF 直接懂 filledBy 可少一层判定；JSONL locator 可复用现成存储 | 需两 owner 明确交接；不引入反向 AR 语义或跨存储伪原子 | 高 |
| 纯提取与服务认回分开 | 一个有状态类同时提取/缓存/读取调用更少 | 调用方前置更显式，独立函数测试不能验证当前性 | 高 |

验证义务见 [verification 新增段](verification.md#原完整-fill-来源认回补充候选)；本稿不接受自身，不新增绑定。
