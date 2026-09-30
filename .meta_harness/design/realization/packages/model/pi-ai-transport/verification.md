## D-091 结构切片实际验收

- 2026-09-27 D-091 结构切片实际验收：[原始实际 TLS、制品和主调度有限签收](../../../../record/evidence/2026-09-27-tests-model-transport-opaque-response/README.md)。公开反射/实际 stop 与 stopped/真实 socket close/延期读取/伪造与不同plan/单 reader/零重发及公开 exports 已独立 Pass；两个完整源码变异真实编译后分别被 oracle 拒绝。HUB transport178/runtime147、build/typecheck/格式/规则通过。首次 cleanup 测量失败原样保留，仅校正实际 close 观测，294 成员读回；不签收 G6/full S-20/H/完整 PH-V9/十三操作或37认证，新增绑定0、形式0、付费0。

# pi-ai-transport 验证与证据

## v8 统一公开面破坏性迁移验证

[v8 候选](v8-input-limits-design.md)按用户最新要求撤销版本过渡。新增 bindings 0，以下未执行；采用后以 **IL-V9-v8** 取代下方历史 IL-V9，其余 IL-V1～8 的新代际义务保留，不再分 A/B。

**IL-V9-v8 / MP4 S-28/S-29、RT6 S-53/S-57/S-74：**独立公开制品从同一根读取 37 份完整定义并经 core 根 MP4 判定，建档完整保真；纯 import 零网络/Agent/注册。过渡 `./definitions/v4`、旧定义实现和旧 Pro 执行特例不再导出或被当前路径引用。旧五项定义进入读取/注册/factory/plan 明确拒绝且零 HTTP，新六项定义在当前 root 与 plugin 共享判定；不剪字段、不自动降级。新 binding 必须精确取得当前贡献，不能回退旧模型。同键不同内容拒绝，不能用修订字符串魔法代替全值校验。

所有当前 runtime、demo、README/README_ZH 及打包消费者使用新路径；缺 meter/材料时按 RT6 具名拒绝，零新增锚点/HTTP/响应/调用终结。具备可靠 meter 的受控组合必须成功发送已检查的同一 serialized，证明不是全拒绝占位；正式模型成功仍须实际依据。旧不兼容日志/快照明确失败，不报空历史或已恢复，运行前后原用户文件字节不变，无自动删除/迁移/回填。现行依赖的 content-blocks 等版本保持其精确消费，不能把删兼容解释为无范围升级。

负控至少包括：旧五项被补默认后放行、为 demo 保留旧发送旁路、根与插件使用不同能力判定、未检查 token 就把完整声明当发送许可、旧日志拒绝被改为空历史；每项必须由实际边界 oracle 拒绝。没有可靠 token 证据则保留 IL-G2，不把假 meter 的测试成功说成正式发送通过。原 D-098/v7 过渡证据仅作历史，不验证本次统一公开面。

## v7 完整输入限制候选验证

[v7 候选投影](v7-input-limits-design.md)消费 MP4/RT6 candidate，以下是待执行 oracle，**不是运行结果**；新增 bindings 0。既有四件套及有限传输证据不证明本增量，正式采用由主线另行完成。

rev 2 的分段 A 验收 IL-V9 与 IL-V1～3 中纯声明/配置/建档部分；新代际 register/lease 以及 IL-V4～8 留待分段 B。不得以 A 的通过宣称 MP4 值已经可由当前根执行，亦不得为了测过 A 偷接旧 planner。

| ID / 条款 | 验收 oracle 与必须失败的负控 |
| --- | --- |
| IL-V1 / MP4 S-8/S-9/S-32/S-33 | 六项能力在 read/own/build/register 各面都保真；unknown 配有限 cap 合法，缺事实、缺必需 cap、limited 比项目 cap 小、非 image 带图片限制及非法三态均拒。图片档案只发文字也不能绕过缺单图 cap；恢复旧五项 validator 或 unknown→unbounded 默认必须失败 |
| IL-V2 / MP4 S-27/S-28/S-29 | 公开读取和建档六项逐值相等；跨字段由 core 唯一判定。registry 同坐标改 cap 或 upstream 状态拒，JSON 对象键顺序与数值拼写不产生假差异；定义原对象/读回对象变化不改 lease。配置 Schema/解释器双向一致，caps 不混入配置。负控删比较字段、补默认或以 latest 覆盖 snapshot 必须失败 |
| IL-V3 / MP4 S-28；RT6 S-53 | 八家相同定义组织和公共消费路径；最终完整定义精确 ID 集与承诺供给集核对，逐项来源及项目 cap 可解释。import 不联网/建 Agent/注册，具名定义可单独读取和配置解释；无事实的 fixture 不算 official。旧形状不给自动补值，README/README_ZH 实例经独立公开制品消费 |
| IL-V4 / RT6 S-74 | 按规定次序覆盖三种既有拒绝、缺项、malformed、准确超限、不可计量及合法输入。已有调用被拒保持阶段与锚点数；token 不可判但请求字节准确超限仍报 exceeded。超 cap 的保守界不能报实际超限，unknown 上游不等同不可计量；删除任何一个差别必须失败 |
| IL-V5 / RT6 S-74 | 实际本机 HTTPS 抓线 bytes 与已检查 serialized 的 UTF-8 bytes 相等；工具 Schema、developer reminder 标记、协议包装、cache_control、多字节字符、内联图共同入数。逐图严格 base64 拒绝非法表示；重复图计两项，工具结果图计入，cap−1/cap/cap+1 全边界；伪造 AttachmentRef.bytes 不能放行，send 重序列化/加项负控必须失败 |
| IL-V6 / RT6 S-74/G-33 | 对每个采用的 meter 保存模型/provider/算法版本/适用域与准确性或上界论证，独立核对全部输入贡献。词表正确但漏消息/工具包装、漏特殊 token/模态、用样本最大系数冒充全域上界、仅凭 callback 标签通过均作为拒收反例。token 证据未知时 size_unavailable、缺构件时 unavailable；尚无合格算法不可声称通过本项 |
| IL-V7 / RT6 S-53/S-58/S-64/S-74 | 真实两代 lease 交错：旧引用固定 A cap/算法，B 发布只影响新取得；规划后输入改动及 A 退役不改变抓线，旧清理不删 B；伪造/复制/跨宿主 plan 不能 send。取消/停止时所有实际 reader/socket/callback 沿既有 owner 排空，不能只断言 disposer 已调用 |
| IL-V8 / RT6 S-20/S-54/S-63/S-74 | 独立公开 invoke 与真实 Cordis/runtime 路径分别验零新增锚点/HTTP/响应/终结；合法固定输入仍能通过，不能用全拒绝替代 gate。诊断只含允许指标、数字与绑定，敏感 sentinel 不出现，既有取消、H、故障归属不回归；runtime/日志组装未建成时保留对应覆盖缺口 |
| IL-V9 / MP4 S-28/S-29；RT6 S-53/S-57/S-74；分段 A | 独立制品实际 import `./definitions/v4`，公开可达面仅有纯定义读取、配置 Schema、建档及数据；网络/Agent/注册构造次数为零。37 个完整新定义经 core 根 MP4 判定，读取与建档全部保真；对旧五项定义拒绝。旧执行明确 import core `/v3`，将六项新定义原值交旧根 read/register/factory/plan 各边界均拒；在仅装载旧贡献的实际宿主，用新 binding 的 plan/acquire 返回 unavailable 且零 HTTP。同键不同内容沿旧规则拒绝；不限制可信调用者另行定义合法 MP3 值的名称/修订。检查实现和调用方没有剥字段桥接或自动降级，不声称能判断手工重造值的来源。原 MP3 demo 实际旧路径仍可跑，输出不冒称 v4；两个语言 README 的 imports 实际执行。负控为旧执行误用 core 根 MP4、六项值被静默裁剪后进入旧执行、恢复猜形状 fallback、未匹配精确 binding 就使用旧贡献，必须各自失败 |

覆盖缺口：**IL-G1**（MP4/RT6 采用与 core 实现，阻塞正式源码升级）、**IL-G2**（逐模型可靠 token 依据，阻塞相应新版成功发送）、**IL-G3**（runtime 拒绝/锚点/历史分发及产品装配，阻塞纵线验收）、**IL-G4**（既有缓存与实际多模态认证，阻塞对应提供范围）。owner、精确边界与闭合条件归[候选稿缺口表](v7-input-limits-design.md#实施清单与缺口)。声明的未知上游数值不是全批声明阻断；file 元数据不是新增 PDF 平台义务。没有已运行且在删掉上述语义时失败的证据，不把 IL-V 填入 bindings。

## v5 响应头证据义务

2026-09-27：[v5-headers-design rev2](v5-headers-design.md) 是 D-090 后的本节点候选投影，**未采用、未实现、未取得产品运行证据，新增绑定 0 条**。rev1 独立架构评审的唯一阻断 PH-AR1 是公开 `RawResponse.stream.headers` 仍可泄密；本次补句柄封装和 PH-V9，尚未独立复评，不以文档修改关闭实际漏洞。下表均为待执行义务，不是测试 ID。既有 `bindings.yaml` 的旧版运行范围保持；RT5 六份形式任务不承载新增头性质，本页也不以形式登记代证真实采集。规范 oracle 来自 [RT5-H1～H6](../../../../spec/capabilities/model-request-runtime/v5/examples.md#v5-增量同次响应头的交接与留存) 和 [MR5 完整实例](../../../../spec/data/model-response/v5/examples.md)。

| ID／来源条款 | 可执行场景与必须观察的判据 | 当前状态、owner 与完成边界 |
| --- | --- | --- |
| PH-V1：RT5 S-58；MR5 S-20；RT5-H1/H2 | 在采用 Node 上用真实本机 TLS 的 2xx 和非 2xx，送普通串、逗号串、重复 set-cookie、空串，比较 Node 实际采得 map 与同次公共 rawHeaders；wire 行序、头名大小写及 HTTP 库合并不能被冒称为本包保证。另用完整公共端口 literal H 覆盖单元素数组、重复／乱序／空成员、空数组／map，缺席独立检查；这些 literal 不能写成真实线上采得证据 | 未执行；transport 验证 owner。新候选捕获构件若有可独立纯边界，可直接验证其自身；不能靠只跑 core Schema 代替 send |
| PH-V2：RT5 S-58/S-59；MR5 S-21/S-22；RT5-H1 | send 交出后修改底层原 map／数组、调用者尝试赋值／删除、释放 R，再观察原 H；正常成员与特殊键保留，不调用用户 getter/toJSON 或混进继承成员。坏值 null／数字／对象／混合数组等用违规提供者负例显式暴露，不 coercion、静默滤项或缺省；缺席绝不补空 map | 未执行；transport＋公共端口验证 owner。Node 不提供某 literal 时分别报告字面边界与真实运输覆盖，不伪造端到端证明 |
| PH-V3：RT5 S-18/S-58/S-59；RT5-H2 | 控制 TLS 非 2xx：错误体读完、非法 JSON、超界、先 flush headers 再断 socket、挂起正文后 cancel；分别安排 request.error/readError 的先后。每个已采 H 的公共结果保留原值，failed 仍是实际 HTTP 状态和来源，不退成 connect；取消按原 aborted 事实供 invoke 判 interrupted。没有 response 的 connect/cancel 分支缺 H；发出最多一次 | 未执行；transport owner。保留真实 HTTP 次数、分支轨迹、断开与 reader 完成证据；仅回调打点不足 |
| PH-V4：RT5 S-20/S-63；MR5 S-21；RT5-H5 秘密部分 | 显式给出三项 S-20 测试政策：同次完整凭据、达到配置长度的片段、名单头、独立形态哨兵；覆盖普通键／值和数组每项、遮罩键碰撞、正常非敏感 H。send 成功／HTTP 失败／取消、read 原错误与诊断都不能漏哨兵；剥除指定头，其他值保原形。缺政策和非法政策在出网前拒绝，零 HTTP | **受阻 PH-G2**；runtime 政策 owner 明确公共构件与配置后，transport 验证真实出值。测试参数不成为生产默认；仍须 PH-J1 的全部写方检查 |
| PH-V5：RT5 S-54/S-55/S-58/S-59/S-63；RT5-H2/H3 | 真 TLS→send→invoke：complete、truncated、带内有／无码错误、解析失败、首内容前／后断流、门失败、门等待取消、reader 未进入。H 从公共 send 保留到四 outcome；只有头且正文暂停时，gate、snapshot 内容、onAccepted、arrival、firstTokenAt 均无新增；diagnostic.detail、上下文及默认呈现无 H | **待 joint 接线**；runtime 与 transport owner。当前只有 SSE reader，若宣称另有 JSON 读取面，必须点名实际入口并分别实测，不能虚造已存在的 JSON reader |
| PH-V6：RT5 S-54/S-58/S-59；RT5-H3 无双源 | 用只提供读取能力的不透明 R 和公共 H；再加带冲突私有 headers 的违规 R／StreamEnd，invoke 只保留 H；去掉 H 时不能从旧字段补回。旧 RawResponse.headers 与 TransportFailure.headers 的生产出口及旧消费迁移核查；不是为双源建立优先级 | **受阻 PH-G1/PH-G3**；runtime 公共类型／invoke owner，transport 同步测试。违规 reader 不合规由负控暴露，不能将其当正常第二权威 |
| PH-V7：RT5 S-53/S-56/S-58/S-64；RT5-H2/H4 | 真实 Cordis 4.0.4 与直接工厂、固定 lease：收头后取消／retire／close，complete 先定后晚 cancel、取消先定后晚数据、R 从未 read 的 stop；观察准入关闭、一次发送、实际 socket 关闭、read／错误体任务结束、track 回调和引用释放，旧 H 不变。保留旧队列／旧清理不删新贡献与原参数／usage／绑定回归 | 未执行；transport 与资源 owner。signal、结果返回、fiber 开始 UNLOADING 都不等于实际停止；范围不扩大到完整宿主恢复 |
| PH-V8：RT5-H6；SYS-OPEN | 构建并打包后在两个新建仓库外消费者中仅用公开入口执行上述合法／非法 literal 和可控 TLS；执行 README.md／README_ZH.md 全部修改的例子。至少实际编译四类行为变体：数组 join／取首、取得头后取消删 H、从旧双源补头、把头当首 token；原版 oracle 成功，变体以对应 AssertionError 非零，编译失败／超时不算命中 | 未执行；独立验证 owner，分别变异真实承担行为的 transport 或 runtime 制品。若 core 仍从 MR4 入口拒数组，另负控断言公共精确 MR5 消费失败；源码类型通过不能代替实际制品 |
| PH-V9：RT5 S-20/S-58⑤/S-59/S-53/S-56；PH-AR1 | 真实 TLS 2xx 回显 secret／片段／指定头／形态哨兵并暂停正文；显式 S-20 政策已令 send.rawHeaders 安全，**reader 尚未进入**。实际 JS 消费者检查 R 的直接取值、`in`、Reflect.ownKeys、属性描述符、Symbols、原型及可达自定义成员，确保只有 stop/stopped、无原始 stream/request/socket/redactor/headers；不能用 TS 访问报错、非枚举或 JSON.stringify 当证明。另一次调用 stop，断言返回严格 undefined，await stopped 的履约值也为 undefined；检查返回／拒绝信息和诊断不携原始对象／秘密。句柄复制／伪造／错 plan／错 host 被拒；真实句柄只允许一个 reader，保持原取消／实际停止／lease track 排空。打包根与 plugin exports 不导出私有表或解包函数，未声明的包子路径不可作公开旁路 | 未执行；transport 实施与独立制品验证 owner，完整政策仍依 PH-G2。至少两项真实 compiled 负控：重新公开 stream（含不可枚举／Symbol 等旁路变体）和恢复表达式 stop 返回 req，分别以预期可达性／返回值 AssertionError 非零；不以编译失败算命中。观察限正常 JS 公共面，不声称同进程调试器／内存沙箱 |
| PH-J1：RT5 S-17/S-20/S-68～S-73；MR5 S-20～S-22；RT5-H5 | 同次 H 经 runtime 完整响应构造、MR5 公共接收、共同 codec、全部真实写方：runtime rsp＋账和 persisted msg＋rsp＋账；真实 append 后关闭原物理 writer 再 reopen，完整批身份／费用／binding／头原值一致，秘密哨兵不出现在输出或日志。raw.body 独立缺席及原附件责任另验，不增加 transport IO | **其他 owner pending**；runtime／共同 codec／消息写方／session-log-jsonl／验收装配。transport 单包通过不关闭它；旧 mrr/1 解释和混用政策必须先由 codec owner 明确采用 |
| PH-J2：RT5 S-17/S-33/S-36/S-64/S-68～S-73；RT5-H5 | 已提交批 H 与后来候选 H2 竞争，保留原完整批；unknown opened／response、迟到提交、原写方未停、进程丢失未持久 H：沿原强门／恢复且不重发，不凭 H 绕过锚点。全部实际写方和共同 tail/判重边界参与 | **其他 owner pending**；耐久 runtime／日志／Run 与消息写方。G28/G29/G30/TL-G1 未闭合不由本页豁免；未持久且进程丢失的头不要求伪造恢复 |

### v5 响应头覆盖缺口

| 缺口 | 精确受阻处／事实 | owner、闭合条件与仍可继续部分 |
| --- | --- | --- |
| PH-G1 | RT5 S-58 的 SendResult 与 MR5 RawHeaders 公开消费；当前只有旧结果／重复头出口，core 新入口未在本观察基线实施 | core、runtime 公共类型 owner、主线明确采用与实际构建／pack；transport 按本稿同步，不能先靠断言或私有路径开工。局部采集和竞态设计仍可完成 |
| PH-G2 | RT5 S-20/S-58/S-63；当前缺 credential_header_names／credential_patterns 的公共接线及匹配实现，只有片段最小长度与字符串 redactor | runtime 政策实现与主线明确完整构件、参数解释及出值前交付机制；验收装配显式给值。本文不选默认名单、regex 方言或新的失败政策；完整秘密符合性和 PH-V4 受阻 |
| PH-G3 | RT5 S-54/S-59；runtime 现未从公共 rawHeaders 接收到四种 outcome，也未采用本增量 | runtime 节点投影／实际 invoke 接线及 PH-V5/V6，先于 joint 验收；本节点单独传输结果通过不冒充函数链闭合 |
| PH-G4 | RT5 S-17/S-68～S-73；完整 MR5 响应的 codec 格式、mrr/1 历史解释、全部写方与真实日志链 | 对应原 owner 明确采用并跑 PH-J1/J2；本稿不改 wrapper、业务键或混用语义。G31 仍开；不妨碍独立 transport 测试 |
| PH-G5 | RT5 S-53/S-56/S-58；Node 实际关闭次序与 header map 采集边界未在本增补运行 | transport 验证 owner 以采用 Node 版本真实 TLS 及行为负控取证；basis 中有 probe 的 Cordis条目只支持相应内核性质，不代证 HTTP |
| PH-G6 | RT5 S-20/S-58⑤；rev1 未封装原始 stream，当前源码 stop 表达式还会返回 ClientRequest，类型 void 不能隔离它 | rev2 已起草私有响应所有权／真实句柄及迁移，**独立复评与 PH-V9 源实现／实际制品验证均待**；transport owner 闭合。不将本行与 PH-G2 的政策解释合并成一个假通过 |

### v5 本次起草实际检查

本次以该检出的检查源码实际运行 `check_design.py --root .meta_harness/design --formal skip`：首次系统 Python 缺少 `PurePosixPath.is_relative_to`，exit 1，未完成设计判定；改用本机已有 Python 3.12 后，实际输出 `passed gate=internal; formal=skip`、exit 0。未安装依赖。该检查只覆盖结构／引用／登记等确定检查，不是产品测试或形式证明。原始两次命令、PID、退出码和输出交由主线保全；没有新产品测试、形式工具运行或绑定，独立评审与技术采用均归主线，起草者不作接受。

以上为 rev1 起草检查历史。rev2 的 PH-AR1 修稿另以本机已有 Python 3.12 运行同一检出的检查源码：实际 PID166611、exit 0，输出 `passed gate=internal; formal=skip`。原 rev1 与本次输入／输出分别保全，未覆盖范围不变；本增量的产品验证仍为零。

## Revision 7 完整定义公共增量有限签收（2026-09-27）

[本轮实际 run](../../../../record/evidence/2026-09-27-tests-model-request-runtime-definitions/README.md)记录主线技术签收与独立两目录公开制品验证：HUB transport175／runtime6、源码规则和构建／类型检查通过；冻结2070输入无漂移，2628证据文件核对、67520制品成员与2648源码／运行归档文件逐字读回完成。当前7条新增绑定仅对应已执行断言；旧默认37五字段贡献及两pilot已删除，旧126项检查和原P2运行保留原历史范围。

完整声明／配置、八项参数值与缺席、精确域、Unicode extra原项名、全值同key比较、零HTTP拒绝、真实r6 A／r7 B迁移和新版owner排空取得有限证据。8个独立compiled行为负控先解析成功、均指定AssertionError失败；两个model包双语12个TS块在两仓库外目录编译且执行24个模块。正向全部真实Agent已destroy，socket／queue归零；B接管A负控末服务器快照仍socket1且无更晚快照，不能泛称所有负控socket0。

签收公共机制，不将fixtures升为37正式定义。ND-V1正式来源值、ND-V6全部official role／配置、全部布局真实附着及ND-G1～3保持待验；当前输入窗口／单图计量、跨参数约束、模态来源、G22上限、真实TTL冷暖／到期、完整T／SC／G及十三操作未由本轮闭合。新增付费0、形式执行0、生产认证仍0／37。

## Revision 5 参数表与公开制品补证（2026-09-27）

[实际 run](../../../../record/evidence/2026-09-27-tests-model-request-runtime-parameters/README.md)保留初次测试判据修正、测量器 TS2322、独立实际 21/22 产品失败及不变判据修复后22/22。保护 extra 全丢时省略它，丢项与实际字节不改；公开 profile3 judge由malformed变ok。八项统一参数的缺席、合法0值、精确数字、推理档、保护键、冻结及非法配置零HTTP取得有限T10证据。

共享实现revision5/definition1，整包transport231/runtime6和类型／格式／源码规则通过。重新打包的仓库外制品及异目录迁移、根入口无Cordis依赖、真实TLS/停止/贡献排空和恢复旧缺陷必须失败的负控通过。未执行OpenRouter付费、TTL、完整service或37认证，旧r4事实不移作r5认证；完整义务继续保留。

## Revision 4 符合性补证（2026-09-27）

[实际 run](../../../../record/evidence/2026-09-27-tests-model-request-runtime-conformance/README.md)保留修复前 10/12 通过、T-16 与 T-8 两个实际失败、85 文件输入／源码／dist 快照及修复后独立 13/13。最终整包 209 项、runtime 6 项、类型及维护范围格式／源码规则检查、双语 10 示例通过。仓库外制品所有模块解析保持内部闭合，明确 Cordis peer，根入口拒绝解析插件依赖仍可用，控制 HTTPS／实际取消与贡献装卸通过。

T-16 对不同 id/index、未知 metadata、null／缺席及超 2^53 数值保真；相同 metadata 的文本片段仍可拼接。同路由回放实际比全 JSON 值，换路由不复用；没有将 LosslessNumber 私有字段的表面相等充当精度验证。T-8 保留首次实报值，并按既有 design 输出 serving_provider_changed。T-12/14 逐事件由真实 stream-assembly/3 接收；T-19 覆盖真实 socket reset、无整数 code 带内错误、异常 finish_reason、未结束 SSE 帧及 DONE 后数据，不虚造正常封口或费用。

这只是列明子项；完整 T/SC/G、实际 provider 名称对应、片段／队列总界限、完整脱敏／诊断矩阵、耐久 service 与 37 官方认证仍待。implementation revision 4，旧 revision 3 的研究或制品不提供本修订上游认证。本 run 付费 0，未执行形式任务。

## P2 局部构件实际验证（2026-09-27）

[新 run](../../../../record/evidence/2026-09-27-tests-model-request-runtime-p2/README.md)保存 transport 196 项（plan 12、TLS 44、registry 8、真实 Cordis lifecycle 6、official 窄定义 126）、依赖闭包 build/typecheck、源扫描、仓库外制品和两包双语 10 个示例。implementation revision 3；以前 revision 2 的付费结果不移作本轮上游认证。

T-2 补实际脱敏响应头/重复值/过界体头；T-18 补负 token 关系诊断及未知计数。PAT-V3-1/T-17 取得全部 37 身份与提醒/route/cache 的离线证据，但完整 offer/schema 未冻结。PAT-V3-2/6、T-20 取得实际 acquire/retire、稳定服务不重跑、空闲再 acquire、幂等 release、旧清理不删替代贡献、超时 fiber 仍 UNLOADING，以及真实双 HTTPS 停止后待 track callback 收口的局部证据。网络使用可信控制 endpoint assembly，不冒称固定 OpenRouter 插件的实际网络认证。

完整 T/SC/G、未定头工具片段/队列总界限、全部诊断/脱敏/查询、宿主服务换代、目录耐久采用和 37 public/service 认证仍待。缓存 TTL 到期未测，official 完整认证 0/37；不得以离线 126 项判逐模型生产通过。binding 只覆盖已执行的具体断言。

## P1 实际公开生产验证（2026-09-27）

[实际 run 与完整边界](../../../../record/evidence/2026-09-27-tests-model-request-runtime-p1/README.md)保存 plan 12、TLS HTTPS 27 项通过、构建/类型检查、仓库外制品、r1/r2 共八次实际 OpenRouter 请求及全部保存的建设失败。bindings 中五条 v3 局部绑定只覆盖断言可失败的具体部分。

T-1/T-3/T-9/T-10a/T-12/T-14/T-17/T-18 等取得局部控制证据，T-17 只有两项精确定义；没有把整行判为全模型通过。SC 扫描通过不替代全部比较门。HTTP 非成功首部留痕、负 usage 关系诊断、工具片段/队列总界限、完整 T/SC/G、动态引用撤除、TTL 到期、全部 37 模型和 service 路径仍未完成。包双语 README、公开规划/生命周期示例及来源/许可已补齐。

下文保留原义务与历史观察；candidate/尚无源码等沿当时日期读取，当前接受见 D-076。未被本节明确覆盖的义务继续待验。

本页记本节点触发的证据义务、实际跑过什么、覆盖到哪里。原始输入与输出归 [record/evidence](../../../../record/evidence/README.md)，本页只引用并写范围。**源码不存在，本节点没有任何实现层的证据。**

## 证据义务

义务从契约 [S-38](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) 传输适配十一条、生产者一侧的数据契约条款与 [D-019](../../../../record/decisions/model-provider-pi-ai-fork/decision.md#理由与保留前提) 的比较门产生，不从已有测试反推。**T 系列**是本包的符合性测试：不装 Cordis、不连外网，只用函数面对一个本机脚本化 HTTP 端（按脚本回状态码、首部与 SSE 字节，并记下收到的每一个请求）；**G 系列**是比较门，必须对真实 OpenRouter 实测。

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
| --- | --- | --- | --- |
| S-38 第 1 条；S-22；`data.model-response/v2` S-24 | **T-1**：脚本端回 `503`、`429`、首部后断开、正文中途断开各一次 ⇒ 每次收到的请求恰 1 个；请求体 `provider` 恰为 `{ order: [那一家], allow_fallbacks: false, require_parameters: true }`；`extra` 带 `models`／`route`／`provider` 时这三键不出现在请求里、记进丢项 | 未开始 | 本节点；建包即可跑 |
| S-38 第 2 条；S-18 | **T-2**：`400`、`401`、`402`、`403`、`404`、`408`、`413`、`429`、`500`、`502`、`503`、`504`、`418`、`302` 各一次 ⇒ 交回 `http_status`、状态码逐字相同、首部原样；响应体超过 `maxErrorBodyBytes` 时停读且不截改已读部分的含义（只交状态码与首部、记诊断） | 未开始 | 本节点 |
| S-38 第 3 条；D-035 保留前提 1、2 | **T-3**：工具参数分多片到达（含一片把一个多字节字符切成两半、含中途是不合法 JSON 的前缀）⇒ 交出的 `fill` 片段相接**逐字节等于**上游各片 `function.arguments` 相接；工具调用块封口不带块。**SC-1** 静态检查：参数路径上没有任何 JSON 解析调用 | 未开始 | 本节点 ＋ 承载仓库 `tools/ts-checks`（规则未写） |
| S-38 第 4 条；S-16 | **T-4**：脚本端先回首部、停 500 ms、再发第一片内容 ⇒ 首部到达时 `readStream` 不交任何事件，第一个事件是 `open` | 未开始 | 本节点 |
| S-38 第 5 条；S-19 | **T-5**：进程环境里放一把 `OPENROUTER_API_KEY`、交空凭据或全空白凭据 ⇒ `local` 失败、脚本端**零请求**。**T-5b**：交一个哨兵凭据串，跑完全部失败支 ⇒ 本包交出的任何值（失败事实、`StreamEnd`、诊断事件）里找不到它或它任何不短于 `credential_fragment_min_length` 的片段（取值是契约 G-6，测试配置自带）。**SC-2**：包内没有 `process.env` 的读取 | 未开始 | 本节点 |
| S-38 第 6 条 | **T-6**：抓到的请求里没有 `x-session-id`、`session_id`、`user`、`prompt_cache_key` | 未开始 | 本节点 |
| S-38 第 7 条；S-11 末段 | **T-7**：消息里有图而快照 `inputModalities` 只有 `text` ⇒ `{ rejected: "modality_not_carried" }`、零请求；工具结果里的图同样；出现语音块 ⇒ 同样拒绝；`PI_AI_CARRIABLE_MODALITIES` 恰为 `{ text, image }` | 未开始 | 本节点 |
| S-38 第 8 条；`data.model-response/v2` S-9 | **T-8**：SSE 带 `id`、`model`、顶层 `provider` ⇒ `serving` 三项原样；`model` 从没出现 ⇒ `upstreamModel` 缺席（不以路由名填）；`provider` 中途变了 ⇒ 保留第一个、记 error 级诊断 | 未开始 | 本节点 |
| S-38 第 9 条 | **T-9**：脚本端回 `302` 带 `Location` 指向另一个本机端口 ⇒ `http_status` 302、那个端口**零请求**。这一支同时是「`node:https` 不跟随重定向」这一假设的 probe | 未开始 | 本节点 |
| S-38 第 10 条；S-29 ④；`data.model-profile/v2` S-17、S-21 | **T-10a**：`planRequest` 交出的改值与丢项，与 `sendRequest` 实际发出的请求体逐项对得上（发出的 = 合并后的，换掉改值项、去掉丢项项）；`planned` 冻结后改不动。**T-10b**：参数处置表逐行——缺席的项不出现；`reasoningEffort` 缺席 ⇒ 请求里没有 `reasoning`；`max` ⇒ 记丢项；`extra` 里落在本包握着的键或统一项上游拼法的 ⇒ 记丢项 | 未开始 | 本节点 |
| S-38 第 11 条 | **T-11**：工具条目名（含 `__`）原样进 `function.name`；回来的调用块头 `tool` 与上游 `function.name` 逐码点相同 | 未开始 | 本节点 |
| S-51（生产者一侧）；`data.arrival-events/v2` S-7、S-11、S-13 | **T-12**：一组录制的 SSE 夹具（纯文本、思考＋文本、思考只有 `reasoning_details`、单个与并行工具调用、`finish_reason = length`、`stop`、`tool_calls`）⇒ 交出的序列逐个交给 stream-assembly 的 `accept` **一个都不被拒**；`length` 那一支没有任何 `close`，`stop`／`tool_calls` 那一支每个开着的块都有 `close` | 未开始；stream-assembly 尚未建包 | 本节点；stream-assembly 建包后 |
| `data.arrival-events/v2` S-8、S-9；`data.content-blocks/v2` S-14 | **T-13**：`BlockId` 在一条流里两两不同；每个 `open` 都带两位 `visibility`；工具调用块头带 `callId` 与 `tool`；`CallId` 形如 `call_` 加 32 个 `[A-Za-z0-9_-]` 字符、同一（`ModelCallId`，发出，索引）恒得同一个值。**「在一份会话日志里两两不同」没有测试能证**：它建在 SHA-256 抗碰撞与三元组会话内唯一之上，这里只登前提，不登成已证 | 未开始 | 本节点 |
| `data.arrival-events/v2` S-20 | **T-14**：性质测试——任意切分的片段序列，封口块内容 = 片段按到达次序相接（那份契约写明这条的证据只能落在生产者一侧） | 未开始 | 本节点 |
| `data.arrival-events/v2` S-15 | **T-15**：带 `usage` 的流恰交一个 `account`、且在生成器返回之前；没有 `usage` 的流不交；`usage` 来两次 ⇒ 取后一个、记 info 级诊断 | 未开始 | 本节点 |
| `data.content-blocks/v2` S-9 | **T-16**：`reasoning_details` 进 `opaque`，经严格无损读写回来、同一路由名再请求时 `reasoning_details` 与上游原样**逐值相等**（含一个超过 2^53 的整数）；换一个路由名时不带 `reasoning_details` | 未开始 | 本节点；回放在真实上游上是否被接受归 G 系列 |
| `data.messages/v2` S-35、S-36 | **T-17**：`SystemReminderMessage`、`CompactionMessage` 各落成一条带系统标识的 `user`（`routeWireHints` 写了 `developer` 的路由落 `developer`）、不丢；`ToolInternalMessage` ⇒ 规划拒绝；有调用无结果 ⇒ 规划拒绝，**请求里没有凭空造出的结果** | 未开始 | 本节点 |
| `data.call-accounts/v2` S-4～S-8；那份契约 G-9 | **T-18**：`cost` 为 `0.000000123456789012345678`（超过 17 位有效数字）⇒ `cost_usd` 精确相同；`cost` 缺席、为字符串、为负 ⇒ `cost_usd: "unknown"`、`source: none`；`prompt_tokens` 小于缓存读加缓存写 ⇒ 三项输入都 `"unknown"`；缺席的 token 数不记 0 | 未开始 | 本节点；换算规则本身的真伪归 G-9 |
| S-18 的来源分支（本包交的事实） | **T-19**：DNS 失败、拒绝连接 ⇒ `connect`；正文中途断开且无 `finish_reason` ⇒ `stream_broken`（不封口）；`finish_reason` 之后又来内容、单事件超过 `maxSseEventBytes`、一帧 JSON 有重复成员、名字始终没到的工具调用、`delta.images`／`delta.audio`／`delta.refusal` 非空 ⇒ `protocol`；首帧带 `role`、`refusal: null`、`annotations: []`、`content: ""` ⇒ **不交任何事件、不以 `protocol` 收场**；HTTP 200 之后帧里带 `error: { code: 500 }` ⇒ `in_band`，**`statusCode = 500`、`inBand: true`、`httpStatus = 200`**（断言 `statusCode` 不是 200、不缺席；契约 S-38 第 2 条）；帧里 `error` 没有整数 `code`、或只有异常的 `finish_reason` ⇒ `in_band`、`statusCode` 与 `inBand` 都缺席、`upstreamError` 原样；`maxConnections = 1`、一条流占着连接时第二次 `sendRequest` 在排队中收到中止 ⇒ `local`、带 `queued` 留痕、脚本端对第二次**零请求**；拿到连接之后调用方中止 ⇒ `aborted`、此后不再交任何增量 | 未开始 | 本节点 |
| 装卸（[design](design.md#成对的装载与撤除)） | **T-20**：用 kernel-basis 的测试装配起本插件：配置缺席 ⇒ 取初值；配置不合形状 ⇒ 插件 `FAILED`、`modelTransport` 不可见；一条流在途时撤除本插件 ⇒ 那条流**不断**、继续交增量直到调用方中止或自然收尾；撤除之后再 `sendRequest` ⇒ `local`、零请求；最后一条在途结束后连接池被销毁 | 未开始 | 本节点 ＋ kernel-basis |
| SC-3 | 静态检查：网络 API 只在 `sendRequest` 所在模块里出现；`planRequest` 与 `createPiAiTransport` 不开连接 | 未开始（规则未写） | 本节点 ＋ `tools/ts-checks` |
| **G 系列：D-019 比较门**（十五项）与请求差异四项（最大生成长度字段、`store`、`reasoning`、`strict`） | 对每条目标路由用同一份输入实测，逐项记结果：请求路由四项、原始工具参数与结果回传 ID、流终态与无尾随事件、实际执行方与响应 ID、`usage.cost` 质量（按 generation id 查 `/generation` 对账）、私有 replay、重定向、错误、断流（首 token 前后各一）、abort（首 token 前后各一，含是否仍计费）、无隐藏重试 | 未开始；少量真实小请求已获 D-064 ⑲ 授权，比较门仍未过 | 主线 → 实施程；授权范围见 [D-064 ⑲](../../../../record/decisions/assets-runtimes-rulings-2026-09-26/decision.md)，密钥只由脚本读取，不进会话、日志或证据。**任何费用或身份丢失先报反例**（D-019） |
| G 系列：本页新增的比较项 | `max_tokens` 与 `max_completion_tokens` 是否等价；`store: false` 与上游缺省；`require_parameters: true` 在单家路由下的实际效果；`transforms` 的缺省；`anthropic/*` 走 chat-completions 时的思考回放、缓存断点与中途 system；`reasoningEffort` 的取值集；`402`／`403`／`404`／`413` 是否出现、含义；带内错误的形状，带内 `code` 与 HTTP 状态是否同一套码（契约 G-5）；`delta` 内容成员闭集是否完备、各家首帧实际带哪些非内容字段、`refusal` 何时非空；`cost` 的单位；`prompt_tokens` 是否含缓存读写；`is_byok` 下 `cost` 的含义；`CallId` 在上游的词法上限 | 未开始；同上 | 同上；结果回填 design 的 PAT-N3、N5～N7、N10、N12、N13 |

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
| --- | --- | --- | --- |
| （无） | — | — | — |

**有限检查不写成无条件证明。**T 系列跑通只说明本包对脚本化输入的行为；它不说明 OpenRouter 的实际行为，那一半只能来自 G 系列。

## 覆盖缺口

- **没有任何实现层证据**：源码不存在（PAT-N1）。
- **比较门一项都没过**（PAT-N2）：在它过之前，产品装配里的真实发出没有证据支撑。
- **`CallId` 的会话内唯一**只能登前提（SHA-256 抗碰撞、`ModelCallId` 会话内唯一），给不出会失败的测试；若评审认为这不够，退路是让 P-2 把 `CallId` 的登记落在会话日志的判重键上——那是 model-request-runtime 一侧的改动，报主线。
- **状态码表、费用单位、用量换算**都是待核对主张（PAT-N3、N5、N6）；T 系列只核本包照表与照规则做，不核规则本身对不对。
- **PAT-N4、PAT-N9 已由契约闭合**（D-060 §八 N-40 ④、N-41）：T-19 的带内一支从「两样都交出来」改为断言 `statusCode` = 带内 `code` 且带 `inBand`；T-7、T-17 仍只核本包拒绝且零出站——拒绝值到 `undispatched{modality_mismatch}`／`invalidInput{reason}` 的收场在 P-2，证据归 model-request-runtime 一侧。
- **P-2 对 `local{queued}` 与无码带内错误的分类已有判据**（PAT-N18）：MRR v2 S-18/S-21/S-36 已闭合；T-19 仍只核本包交出的事实，P-2 最终成因及撤除收场的场景证据归 model-request-runtime，尚未执行。
- **跨 fiber 的撤除次序与等待**未核实；本设计的结局不依赖它，T-20 只覆盖同一装配里先撤本插件的那一种。**kernel-basis 的 probe 候选**（候选名 `dispose-order-across-inject`，owner kernel-basis 节点，尚未登记）：提供者 fiber 撤除时，inject 它的依赖方是在提供者的异步撤除函数完成之前还是之后被卸载；它决定本插件撤除的等待是否要等到在途流自然收尾（[design 的撤除等待上界](design.md#成对的装载与撤除)）。

## 独立评审

2026-09-25 本节点首稿随 N7 批（infra 三节点与本节点）经一次独立的架构评审（只读结构核对，无运行）：本节点无阻断，应修 1、建议 2、观察 2。契约侧据此改写（D-060 §八 N-40 ④、N-41），本页与 design 按下表对齐。**处置不等于评审闭合**——是否闭合由复审判断。

| 编号 | 发现 | 处置 | 落点 |
| --- | --- | --- | --- |
| F-5（应修） | 节点落后于契约已裁的两处：`in_band` 的状态码仍标开放，规划拒绝仍写「没有落点」 | PAT-N4、PAT-N9 改「已由契约闭合」；`in_band` 失败事实定为 `statusCode` = 带内 `code` ＋ `inBand: true` ＋ `httpStatus` 另带，`inBand` 由 P-2 原样落；三种拒绝值映射到 S-28 表第 3 行（`modality_mismatch`）与第 6 行（`invalidInput{reason}`）；「`openCall` 已过而 `planRequest` 仍拒」定为两处判定不一致的缺陷，收场照契约 S-29 ④ | design 投影表 S-38 第 2、7 条行、新节「规划拒绝的三种值与收场」、流翻译表带内一行与 `StreamEnd`、失败映射表、成因表与表下两条、PAT-N4、N9；本页 T-19 |
| S-2（建议） | 连接池排队会把本机饱和折成 `upstream_unavailable` | 排队中被中止 ⇒ `local`、带 `queued` 留痕，不交 `aborted`；`maxConnections` 初值标「无测量依据、实施程测」；P-2 一侧的分类登 PAT-N18 ① | design 策略配置项 `maxConnections` 行、失败映射表、成因表 `unrecognized` 行、PAT-N18；本页 T-19 |
| S-3（建议） | `readStream` 未列内容成员闭集，非内容字段可能被当成认不出来 | 写明闭集 `content`／`reasoning*`／`reasoning_details`／`tool_calls`／`images`／`audio`，**另加 `refusal`**（非空即拒答文本，忽略就是静默丢）；闭集之外的成员一律忽略；闭集列入比较门 | design 流翻译表两行与表下「内容成员闭集」一条；本页 T-19、G 系列新增比较项 |
| 观察（`connectTimeoutMs`） | 它是 S-21 两个设置项之外的第三处时限来源 | 已在策略配置项表标价，不改 | — |
| 观察（撤除等待上界） | 若内核先完整撤除本插件再卸 P-2，撤除等待要等在途流自然收尾 | 写明上界「等于流的自然收尾，受 P-2 的时限约束」；撤除函数等最后一条在途收场、池销毁后才返回；内核次序登 kernel-basis probe 候选 | design 装卸表与「撤除的等待上界」一条；本页覆盖缺口 |
| 契约对齐（主线） | 同一批契约改写还承接了 PAT-N3 的 402／403 两行、PAT-N11（G-22）、PAT-N16、PAT-N17（G-23）、PAT-N14 的 ②③ | 各行改指契约坐标；PAT-N14 只剩「工具条目的来路」，改「待契约（与 MRR-N14 同一件事）」 | design 参数处置表 `maxOutputTokens` 行、策略配置项 `routeWireHints` 行、inject 边与依赖表、PAT-N3、N11、N14、N16、N17；README 分层状态 |

## v3 候选增量验证

2026-09-27，[v3-design.md](v3-design.md) 是 candidate，未接受；旧节的 T/SC/G 义务仍全部保留。本文区分“旧义务继续”与“候选怎样改变输入/判据”，不借新适配器免掉比较门。下文 runtime 指 `capability.model-request-runtime/v3`，profile/messages/response 分别指 `data.model-profile/v3`、`data.messages/v4`、`data.model-response/v4`；arrival-events、call-accounts 为 v2，content-blocks、tool-definition、stream-assembly 为已接受 v3。

### 原验收逐项接续

| 既有编号 | 保留的失败判据与候选影响 | 当前状态 |
| --- | --- | --- |
| T-1 | 一次 send 至多一 HTTP；三项固定路由、extra 禁用键不变。新增 37 个 definition 的规划逐项不得改写这组保护字段 | 未开始，保留 |
| T-2 | 原状态码/首部、错误体上界不变；新版事实对象仍不能用 HTTP 200 覆盖带内 code | 未开始，保留 |
| T-3 | 工具参数逐字节拼接不变；家族/窄适配不得加一次解析或 schema 改写；使用 content-blocks/3、tool-definition/3 | 未开始，候选消费版本变化 |
| T-4 | 首部不算内容；任一家族不得以适配初始化、usage、空首帧制造 open；内容可见门另外由 runtime S-55 验 | 未开始，保留 |
| T-5 / T-5b | 明确凭据、零环境回退、全部失败与诊断的完整/片段哨兵；新增注册配置错误、未知版本与 sink 故障支 | 未开始，候选扩样本 |
| T-6 | user/session_id/x-session-id/prompt_cache_key 全禁；逐家族启缓存后再抓线核对 | 未开始，候选扩样本 |
| T-7 | 模态不承载就规划拒绝；声明 text/image 不自动支持音频/视频；每个模型定义实际输入范围都要验 | 未开始，候选扩样本 |
| T-8 | 上游 id/model/provider 原样，不以请求填缺席。仍保留 provider 中途变化诊断；若实际执行方与固定路由不符，保留原值并交协议来源，业务分类归 runtime S-18 | 未开始，新增 response/4 S-37 对照 |
| T-9 | 302 不跟随，重定向目标零请求；依旧是真实 Node probe，家族不可自建绕行发送器 | 未开始，保留 |
| T-10a | 实际 wire、planned、改值/丢项一致，规划后修改源输入/配置不改变发送；新增完整 binding 原值、跨字段相等与旧版本引用 | 未开始，新增 PAT-V3-3 |
| T-10b | 原参数表逐行继续；缺席 reasoning 不补值，extra 无权覆盖统一项。模型仅允许统一词表内的支持值，不偷塞 xhigh；原 max 未核实处理不可静默改变 | 未开始，候选逐模型验证 |
| T-11 | 工具名字/调用头逐码点原样，无逆转写；tool-definition/3 的生产者输入必须来自真实公共入口 | 未开始，候选消费版本变化 |
| T-12 | 真实 stream-assembly/3 接收全部合法增量；length 不封口，stop/tool_calls 对应封口；增加 8 家录制样本和生产解析器实跑 | 未开始，候选消费版本变化 |
| T-13 | 块标识、visibility、callId 的本流性质不变；会话内唯一仍只列其明确前提，不由有限测试证明全局唯一 | 未开始，保留 |
| T-14 | 任意切分、多字节、reasoning opaque 与工具参数的拼接性质；每一家窄适配不能变动原文 | 未开始，保留 |
| T-15 | usage 最终一次 account、缺席不造事件、重复 usage 取值与诊断规则继续；缓存两项各自未知，不由模式补零 | 未开始，候选加缓存来源对照 |
| T-16 | opaque 严格无损、同路由回放、换路由不误复用、超 2^53 值保真；各家受支持的推理回放须过真实 G 门 | 未开始，保留 |
| T-17 | 旧消息不丢/不补工具结果/拒 ToolInternalMessage 的判据保持。提醒不再由 routeWireHints 判：OpenAI developer，其余适用专用类型否则 user；所有 37 项配对验证，system 为负控；Compaction 单列 | 未开始，候选替代决策源 |
| T-18 | 原高精度金额、非法/缺席未知、缓存计数一致性保留；另加已知零/未知/正读、只报读不报写，response/4 不得出现第二份缓存镜像 | 未开始，新增 PAT-V3-4 |
| T-19 | 原 DNS/连接/带内/断流/协议/非内容首帧/queued 分支全部保留。首内容时限中止 queued 由 runtime 归 unrecognized；取消与触达未知不猜值；取消后须观察 socket 和读循环停止 | 未开始，新增 PAT-V3-6 |
| T-20 | 原配置非法启动失败、撤除停止新 send、在途跑完/明确取消后再销毁池保持；新增实际 Cordis 模型贡献热更新与直接消费者、宿主替换、多次 acquire 空闲间隔，不靠 disposer 次序 | 未开始，新增 PAT-V3-2/6 |
| SC-1 | 工具参数路径无中间 JSON 解析；家族、窄适配也在规则范围内 | 未开始，保留 |
| SC-2 | 包内无 process.env 凭据或 TTL 回退；配置必须来自显式 binding/装配 | 未开始，保留并扩大检查 |
| SC-3 | 唯一网络出口是 send；plan/factory/注册均不开连接，模型插件没有第二出口 | 未开始，保留 |
| G：D-019 全十五项及原新增项 | 原表所有路由、身份、费用/generation 对账、私有 replay、重定向、错误、首内容前后断流和 abort、无隐藏重试，以及 max_tokens/max_completion_tokens、store、reasoning、strict、transforms、require_parameters、状态码含义、delta 闭集、cost 单位/BYOK、token 组成、CallId 词法均保留 | 未开始；研究短请求不算完整比较门 |
| G：新增逐模型适配 | 对 37 模型分别用生产函数与服务路径取角色、参数、工具回传、推理、缓存/精确费用证据；每个指定路由独立认证，禁止一次族代表通过后把整族判通过 | 未开始；研究暖读仅作后续输入。ZAI 五叶只有本机 TLS 三轮（见 2026-09-30 ZAI 节），真实认证 0/5，不计入本行 |

### 增量证据义务与覆盖缺口

| 编号与来源条款 | 必须失败的反例 / 所需验收 | 当前状态 | owner 与受阻消费者 |
| --- | --- | --- | --- |
| PAT-V3-1：profile S-29～S-31；runtime S-53/S-57 | 工厂/manifest 恰覆盖确认的 37 模型；精确 implementation/definition/configuration 可解释；未知版本、modelId 不等 routeName、缺必需 TTL、非法配置均零 HTTP；同 revision 不同档案 values 不混用 | 尚未实现；候选规范与 core 采用待闭合 | 本节点与目录/core owner；阻断所有新 binding 生产消费 |
| PAT-V3-2：runtime S-53/S-64 | 真实 Cordis：register→adopt→retire 各失败窗口；acquire/retire 两种次序；旧 runtime/direct 不换版本；重复 release；空闲后再次 acquire；正常排空、超时 remaining_active、强制取消后实际停止；旧清理不得删新版 | 有限模型与原型部分支持，生产注册表未验 | 本节点；阻断模型贡献热替换接受 |
| PAT-V3-3：runtime S-54④/S-57④；messages S-49；response S-11/S-36 | 真实计划器→实际 send 抓线→耐久已出门→响应 binding 原值逐值对照；旧输入外部变异、配置更新、plan 与 send 之间发布版本都不能改变旧计划；生产入口无二次规划 | 未开始 | 本节点 + runtime/sessionLog 提供者 + 验收装配；阻断“锚点记录就是实际请求”的声称 |
| PAT-V3-4：response S-37/S-38；call-accounts S-4～S-8 | 每一指定模型路由冷暖运行，read > 0 才命中；automatic 与 explicit 分验；TTL 配置值原样发出，另验 expiry 才可声称保留期；正写不能代读命中；实际 provider 不由请求值补，名称对应未知不猜别名；精确金额与 generation 账一致 | [37 个研究暖读齐](../../../../record/evidence/2026-09-27-probe-model-request-runtime/model-evidence-summary.json)；本节点生产路径尚无证据。研究没有独占上游缓存，首请求不保证冷；不证明 TTL expiry、完整比较门、所有路由或持续命中 | 本节点 + 主线实测；阻断各模型 official 认证 |
| PAT-V3-5：runtime S-20/S-63 | 所有生命周期与传输失败支的关联齐全；默认无正文/参数/推理/凭据及片段；慢/抛错/满 sink 有界、独立降级计数可见；相同模型输入正常 outcome 不因 sink 故障改变 | 未开始 | 本节点采集、独立验收装配 sink/权限/查询；阻断全链路观测覆盖声称 |
| PAT-V3-6：runtime S-53⑤⑥/S-56/S-58/S-59/S-61 | 真实 HTTPS 延迟/不主动 EOF 流；宿主替换、transport 撤除、贡献强制撤除与直接调用交错；abort 后等 socket close/读取终止及回调收口才释放；仅 signal.aborted 或解除 effect 不能通过 | 原型调用者是模拟，无 HTTP、真实时限或持久；仍未闭合 | 本节点 + runtime + kernel-basis + 验收装配；阻断停止已完成及资源不泄漏声称 |
| PAT-V3-7：runtime S-38、D-019 | 原 T/SC/G 全门生产实现通过，pi 片段 provenance/许可齐；费用/身份丢失即保留反例，不用新 adapter 名称绕过采用门 | 未开始 | 本节点与主线；阻断产品真实发送采用 |
| PAT-V3-8：runtime S-64；profile S-30；response S-20 | candidate 精确 catalog/采用及 core 新版本就绪；发布管理方、配置政策、诊断 sink、时钟、凭据注入与入口身份核实由装配点名；原始响应附件留存依旧需附件 owner | 候选未接受；runtime v3 尚待 catalog 登记，独立验收装配 `apps/model-request-acceptance` 尚未建立，原 PAT-N15 保持开放 | 主线/spec/core 与 `apps/model-request-acceptance` owner；阻断将此节点读成可独立完成整条纵线 |

配置修订历史判重只由目录负责；本节点测试只核其收到的完整 values 原样解释，不伪造跨目录/注册表事务。有限版本模型中的“一名消费者最多取得一次”由模型构造吸收，不能绑定成可重复 acquire 保证；该缺口必须由生产并发测试覆盖。

### 已有候选依据的实际范围

| 运行 | 输入/结果 | 能支持什么，不能支持什么 | 原始位置 |
| --- | --- | --- | --- |
| Adaptation 第二轮 | TLC exit 0，20404 generated / 5430 distinct / 深度 17；两个版本、runtime/direct 两消费者、两个档案范围；Stop/Release/Dispose 弱公平 | 分步采用失败、固定绑定、取得/停准入、无持引用销毁的有限交错；不证明网络、持久提交、重启、超时、任意消费者数 | [run 配置](../../../../record/evidence/2026-09-27-probe-model-request-runtime/lifecycle-formal-2/Adaptation/run.json)、[输出](../../../../record/evidence/2026-09-27-probe-model-request-runtime/lifecycle-formal-2/Adaptation/stdout.txt) |
| Adaptation 三负控 | 各 exit 12；NoAcquireRetired、NoDisposeWithLease、BindingPinned 被对应变异反驳 | 证明这些断言在当前有限模型中能失败，不证明生产代码实现了守卫 | [AcquireRetired](../../../../record/evidence/2026-09-27-probe-model-request-runtime/lifecycle-formal-2/Adaptation_AcquireRetired/stdout.txt)、[DisposeActive](../../../../record/evidence/2026-09-27-probe-model-request-runtime/lifecycle-formal-2/Adaptation_DisposeActive/stdout.txt)、[Rebind](../../../../record/evidence/2026-09-27-probe-model-request-runtime/lifecycle-formal-2/Adaptation_Rebind/stdout.txt) |
| Cordis 4.0.4 连续调用反例 | acquire A→release A→acquire B→dispose；旧等待已完成，B 在用时 disposed=true，exit 1 | 反驳旧原型的排空方案；不能只引用原三场景通过结论 | [失败](../../../../record/evidence/2026-09-27-probe-model-request-runtime/lifecycle-reuse-failure/stderr.txt) |
| Cordis 4.0.4 修正原型 | retiring 后建立当次等待，新增交错及原三场景 exit 0 | 支持提前注销一次、旧 runtime/direct 引用排空、取消后待模拟停止；无 HTTP/生产注册表/超时/耐久事实 | [输入](../../../../record/evidence/2026-09-27-probe-model-request-runtime/lifecycle-reuse-fixed/input.mjs)、[结果](../../../../record/evidence/2026-09-27-probe-model-request-runtime/lifecycle-reuse-fixed/stdout.txt) |

全部是候选依据，未新登记本节点绑定，未宣称节点已接受或已验证。主线另行独立架构评审；本次起草者不作自我接受。


[D-070 I-B](../../../../record/decisions/core11-integration-coordination/decision.md#生产者铸号)承接 T-13 增补的 [IS-2](../../../../record/proposals/content-blocks-implementation-seams/design.md#验证与消费门)：精确编码、无界整数、等值写法与特殊字符串的确定性，未执行。非法 target、CallId 判重／恢复与原比较门不因该采用闭合。

## 2026-09-27 既有承诺同步

主线与独立 spec-reviewer 定向核对 PAT-N14、PAT-N18、MRR-N15：MRR v2 冻结契约 SHA256 `d7d166da84aaf1f05ac6274abc0f215e57a32dadad79db19f4a7402120f799b9` 已含 D-060 N-42～N-44 的工具条目来源、无码带内错误与排队中止分类，D-066 登记继续承接其语义接受。三处为节点漏同步，按既有条款修正，无新裁决、未改冻结资源。历史评审表保留原时点；未运行源码、T/G 比较门或新的形式验证，其他实施缺口不变。

## 2026-09-27 revision6 边界修复实际验收

[实际运行与主线有限签收](../../../../record/evidence/2026-09-27-tests-model-request-runtime-boundaries/README.md)：HUB transport262／runtime6、build/typecheck与源码规则；独立两份新制品各23场景，84次本机TLS；七类恢复缺陷负控均实际失败并命中诊断。公开direct/Cordis关闭准入保留旧流/回调到真实停止，direct诊断异常不改业务，失败/serving逐键值脱敏保留普通事实，extra原键及全未知Usage来源通过公开judge。六条新增绑定仅覆盖各自有限判据，不将输入保全或测试总数当完整契约符合性。

implementation6／definition1；当前旧窄定义/两个pilot尚待D082迁移。未验证真实OpenRouter、TTL到期、37完整能力/config、耐久租户服务、完整A/B换代或全T/SC/G。付费0，旧失败和r5原样保留，不重标历史认证；本轮形式执行0。

## v12 响应校准增量

对象为 [v12 revision 2 candidate](v12-usage-calibration-design.md)，MR9/RT10 candidate；新增绑定 0，以下均为待执行义务，尚无本增量实现运行或模型认证。revision 2 明确 B1 相关缓存元数据边界与 UCT-V12 性能行为门，尚待独立复评。既有形式任务与源码测试不改版本标签。

| 编号／条款 | 必须会失败的场景与负控 | owner／消费者 |
|---|---|---|
| UCT-V1 MR9 S-41/S-43，RT10 S-77 | canonical golden：非 ASCII/转义、无损整数及等值异词法、key 次序、重复/空消息、opaque、tools/schema、system；改变任何实际 input-bearing 贡献必须改变预像或明确版本。缓存控制只按 v12 窄规则剔除，其余字段保留；input/output 域、空序列与拼接无混淆；输出 request unavailable 仍能 known | transport；core/invoke |
| UCT-V2 RT10 S-77/S-79 | 稳定 prefix 增量；编辑/重排/删块、tools/system、媒体表示、compaction 派生不可见（含无 compaction 标记）均 prefix_changed；换模型/provider/tokenizer/meter/replay/transform、未证兼容均 basis_changed。假 trusted 布尔、同 hash 异版本、只同 seq/modelId 不能放行 | transport planner；runtime 来源交接 |
| UCT-V3 MR9 S-42，RT10 S-59 | 三互斥项求和；prompt total 已知缓存细目 unknown；缓存读/写不双加；conflict/负值/缺项/重复 cumulative/response-cache 零；独立已知真实 0 合法。故意将 cached/unknown 置 0 必须失败 | reader/account；invoke |
| UCT-V4 RT10 S-54/S-59，MR9 S-42 | 真本机 TLS/SSE 在 usage 前后分别取消、断流、非法后续帧、带内错误、assembly 拒收；终止 readFacts 保留已提取 I/usage，invoke 无 raw 私读，不提前 generator.return；构件 throw 不冒充上游 missing。provenance 与 route 原事实对应，密钥字符串出现在 id/model/provider 时按来源脱敏且不泄漏 | transport+runtime 联测 |
| UCT-V5 MR9 S-43/S-44，RT10 S-78 | complete/partial、reply/delivered/none、request unavailable/output known、thinking/tool/opaque；真实选入组与 block digests 一一对应；删选组不能按 aggregate 均分，O/reasoning 不双加，旧 O 已进新 I 后不重复计 | transport projectOutput/φ；core 关系校验 |
| UCT-V6 RT10 S-74/S-78/S-79 | full/φ/δ 独立导入，无 Context/日志/网络；正负边界修正，误差仅剩本轮 φ/δ；缺 usage 多轮覆盖全部锚后内容；不可判回退 full，仍不可判零 HTTP；非法结果不能悄悄计 0；margin 只对最终估算应用一次；精确/上界/估算不升级 | transport；外部函数消费者 |
| UCT-V7 RT10 S-74/S-79 | marginal 仍精确验完整 UTF-8 bytes/逐图解码大小/图数；稳定历史 tokenize spy 必须为零，有限边界重分词单独计数且有证明；cipher 长度伪 token、故意遗漏 tools/hidden contribution 的负控必须失败 | 每家 meter owner；plan |
| UCT-V8 RT10 S-53/S-77/S-82 | 真 Cordis 贡献 A 持 lease 时注册 B/retire A；旧 plan/reader/φ 固定 A，新调用用 B；同 binding 异函数拒绝、部分初始化失败、force 后仍活动不提前 cleanup、停止后一次释放 | transport registry；装配 |
| UCT-V9 MR9 S-45，RT10 S-80/S-81 | 实际 invoke→runtime→SL3：换代不重解旧响应；response/reply 原批回执 unknown 不提前发布锚；恢复仅原完整值；晚到别分支/别日志同 seq 不选作来源。撤掉相应 gate 的负控失败 | runtime 主责，transport/core 配合；生产装配 |
| UCT-V10 RT10 S-79/S-82 | 同一百万 token 级材料比较 full 与 marginal：报告消息/字节/token 数、版本、CPU/墙钟/峰值内存、warm/cold 和重复分布，拆 projection/序列化/hash、tokenizer、全量图片检查、组合准入；稳定前缀改变和新增规模分别实验 | verification owner；主线性能验收 |
| UCT-V11 MR9 S-42/S-43，RT10 S-78/S-82 | 37 个型号逐项记录 model/provider/精确绑定、full/φ/δ 覆盖与精度、原统计口径/retention、版本化事实、边界与留出反例、public/service 两面；本机符合性和真实上游证据分开，不以家族一例覆盖全部 | 各厂商 owner；official 供给验收 |
| UCT-V12 MR9 S-41，RT10 S-77～S-79 | 四个 Anthropic 精确 official definition/provider/1h/last_message 配置，实际 planner/reader/meter 经 public 与 service 各跑三轮普通 append；脚本上游提供同次完整 I，另按 V11核真实口径。必须 full→marginal→marginal，断点真实移位、wire 保留控制且完整 bytes/images 门照常。覆盖 user、assistant/tool 首次及成为历史后的稳定包装、图文最后 text 位置；百万级稳定历史后两轮 tokenizer 调用零，新增量独立计数。负控：恢复旧 wire 摘要导致每轮 full、删真实内容/role/tools/reasoning、忽略未知cache成员、string/array比较时伪归一、错误版本继续命中、历史偷偷全量tokenize，每项均须触发失败 | transport+runtime；verification owner；只阻相关 Anthropic 稳定增量采用 |

UCT-V10 的比较必须使用同一实际最终输入与生效配置：扫描/序列化 O(bytes) 仍存在，不能将 tokenizer 节省表述为端到端同比提速；不声称恒定时间或已经测得新路径性能。实现前既有全量瓶颈只说明优化动机，不能替代本增量测量。

UCT-V12 的官方配置不能换成禁用缓存或固定在旧位置的研究配置；fixture 提供的是上游响应事实，不替换本产品 planner 或 meter。缓存排除需要 v12 中的精确来源与范围；缓存命中、客户端类型允许或有限 token 同值都不独自证明普遍语义等价。稳定包装直接由新 revision 从首次生成，避免承担 string/array 等价证明；旧 revision 新 basis 首次 full，不添加兼容承诺。允许 φ/δ estimated+配置余量，但必须覆盖全部新增，不将可能改变整段旧 P 的未知转换藏进估算。性能报告分别列序列化、投影/hash、完整图片检查、tokenizer 和合成成本；零历史 tokenizer 与端到端耗时分别断言。

### UCT 覆盖缺口

| 缺口 | 条款／受阻消费者 | 关闭条件与 owner |
|---|---|---|
| UCT-G1 candidate 未采用、源码仍无 full/φ/δ/readFacts | MR9 S-41～45，RT10 S-59/S-77～83；所有新消费者 | 主线独立评审/采用后，runtime/core/transport 同批公开面迁移，不留旧格式旁路 |
| UCT-G2 逐模型事实未闭合 | MR9 S-42/S-43，RT10 S-78/S-82；各不具依据的型号发送/增量 | 厂商 owner 完成 UCT-V11；无依据 estimated 不允许，unknown 不填零；其他已具依据型号不受牵连 |
| UCT-G3 真实异常/热换/日志组合未验 | RT10 S-53/S-59/S-81；真实 service 与装配 | 实施与 verification owner 完成 UCT-V4/V8/V9，形式模型不替代实际资源停止 |
| UCT-G4 新路径百万 token 成本未知 | RT10 S-79；性能交付声明 | verification owner 执行 UCT-V10 和 tokenizer 调用计数负控；不引入额外持久索引补故事 |
| UCT-G5 estimated 不能给 compaction 硬 fit 保证 | MR9 G-17、RT10 G-36；未来压缩硬保证消费者 | 归相关产品/规格 owner 处理；本节点如实保留估算语义，不实现压缩、不把该缺口扩成当前全量交付前提 |
| UCT-G6 Anthropic 稳定增量尚待复评/实施/验证 | MR9 S-41，RT10 S-77～79；四型号常规 append 的增量供给 | 采用 revision 2 精确窄投影、发布新适配修订并通过 UCT-V12；owner 为 transport 与逐模型验收。此门不阻 MR9/RT10 规范本身或纯 core 实现，不能用每轮 full 假称闭合 |

## 注册表诊断源读面增量

采用范围见 [v11](v11-registry-diagnostics-design.md)与节点README；运行证据尚无。必需场景为实际registry+collector/Cordis贡献生命周期、未停旧lease、force请求与真实停止区分、cleanup失败、无端口/合法拒收/throw/非法值、重复pending Promise停投及拒绝吸收、溢出unknown和最终inspect快照；源/network/collector同值不能相加当多个失败。不以这些场景替代完整D6或逐模型认证。


## 2026-09-29 D4 模型贡献范围实际接受

[独立及HUB真实验收](../../../../record/evidence/2026-09-29-tests-model-contribution-lifecycle/README.md)覆盖可信贡献/声明式custom、同一旧lease及phi、真实排空/失败隔离、组织租户/配置/凭据与撤销准入、历史锚旧绑定和三等待状态。HUB7＋2＋2场景通过，root逐门核对后接受该D4范围；新增绑定0，不提升37模型D7、D6、完整十三操作或任意JS reader在线补丁的声明。精确输入/原始输出与有限前提沿run读取。


## 2026-09-29 Fable 5.1 生产路径有限验证

[实际生产公开调用／三轮service／响应校准](../../../../record/evidence/2026-09-29-tests-fable-production-invocation/README.md)：固定Anthropic路由，full→marginal→marginal、物理[M,R]同批和真实关闭；7笔全部结清，含两次截断原结果。只验证本次文本/low场景，cache命中、TTL及全部模态/模型认证未由此关闭。

## 2026-09-30 ZAI 五叶本机 TLS 有限覆盖

对象：`z-ai/glm-5.3`、`glm-5.3-prime`、`glm-5.3-flash`、`glm-5.3-flashx`、`glm-5.2` 的当前绑定（definition 2/3，`pi-ai:zai@mp4-17`），五个计量器均为 full-only（`unsupported-marginal/1`）。执行仓库 `packages/model/pi-ai-transport/tests/zai-three-round-invoke.spec.ts` 共 110 例，本机 TLS 全部通过；上游为合成流或已记录的 Prime/FlashX 真实 SSE，未发起任何付费请求。原始运行输出未归档为 evidence run。

| 覆盖 | 用例数 | 实际结果 |
|---|---:|---|
| 回复不含推理：五叶 × 已接受 effort（Flash/FlashX 缺省）× 有/无工具 × {public，Cordis transport service} | 36 | 每轮 full/`estimated`，fallback 为 `no_observation` 后接 `basis_changed`（Prime 为 `prefix_changed`）；φ/δ 未被调用；每轮恰一次 HTTP，线上字节与计划一致 |
| 调用方隐藏 thinking（`visibility.toModel: false`）后追加，含 Prime/FlashX 已记录真实流 | 36 | 三轮 full/`estimated`，HTTP 次数 1/2/3，任何 wire 消息都不带 `reasoning`／`reasoning_details`；真实流的无 id 无签名片段装配为一条 detail |
| 原样回放推理历史（纯 `reasoning` 或 details）：五叶 × 2 形状 × 2 入口 | 20 | 第 2 轮 `input_size_unavailable`，不再发 HTTP，历史不变 |
| provenance 与依据一致时的 φ/δ；集合外 effort 丢弃 | 10 | fp8 四叶 φ/δ 被调用且均为 unavailable；Prime 因断点移位在此之前回退；集合外 effort 进 `droppedParameters` |
| Flash/FlashX 声明媒体：图片、视频 × 2 入口 | 8 | 图片由 wire 投影承载，但官方计量器在 HTTP 前拒绝；视频 `modality_not_carried` |

范围：带推理历史的多轮在当前源码上一律 unavailable，可见推理历史计量映射是登记缺口，未采用。隐藏 thinking 的多轮能通过，是运行时上下文组装中调用方的决定，不证明 transport 对推理回放可用或可计量。同批以当前源码重放了冻结证据：8 条固定路由请求 wire 的估算等于观测 `prompt_tokens`，5 份已记录 SSE 按固定 SHA-256 装配，GLM-5.2／5.3／Flash 模板黄金输出一致，五叶坐标与迁移后记录相同；逐叶表在包 README。本节不关闭 UCT-V11、上节「G：新增逐模型适配」或任何真实 OpenRouter public/service、cache 与费用认证。

## 2026-09-30 Moonshot 可见推理 MV1–MV3 本机覆盖

对象：[Moonshot 可见推理计量 revision 2](moonshot-visible-reasoning-estimate-design.md)（[采用决定](../../../../record/decisions/model-input-usage-calibration-adoption/moonshot-visible-reasoning-decision.md)）在 `moonshotai/kimi-k3`@`moonshotai/mxfp4` 与 `moonshotai/kimi-k2.7-code`@`moonshotai/int4` 的新发布：definition 3、`pi-ai:moonshot@mp4-18`，algorithm `moonshot-k3-xtml-image-5`／`moonshot-k27-jinja-image-4`，tokenizer 修订钉在不变的 `tokenizer-basis/moonshot-k3-xtml-image-4`／`tokenizer-basis/moonshot-k27-jinja-image-3`，φ/δ 仍为 `unsupported-marginal/1`。夹具是 [2026-09-27 probe run](../../../../record/evidence/2026-09-27-probe-model-request-runtime/README.md) 十份 Moonshot 原件的有序片段（816 帧，成员 SHA-256 随夹具记录），按原 delta 形状重建成本机 TLS SSE、交真实 reader 合并；未发任何付费请求，原始运行输出未归档为 evidence run。

| 义务 | 执行仓库用例 | 用例数 | 实际结果 |
|---|---|---:|---|
| MV1 | `tests/moonshot-visible-reasoning-rounds.spec.ts`：K3 low/high/max 与 K2.7 Code × 有/无工具 × {public transport，Cordis transport service} | 16 | 第 2、3 轮 full/`estimated`；每轮恰一次 HTTP 且字节等于计划；线上只回放 reader 合并后的一项 details，不带 `reasoning`／`reasoning_content`；每轮估算等于独立 meter 与「details 换成 `reasoning` 字符串」的计数；余量只在门上应用一次；资源实停 |
| MV2 | `tests/moonshot-visible-reasoning.spec.ts`：反例 1–7、9 与等价预言（十份原件 × 有/无工具 × K3 三档） | 19 | 合格 details 计数与字符串形逐值相等；反例 2–5 的每种形态（含显式 `signature: null`、R-L 迟到签名、带 id 片段）在 meter 与规划器均为 unavailable／`input_size_unavailable`，零新增 HTTP；原 body 与字节不变；replay/new 被询问且为 unavailable，measurement 为 full |
| MV3 | 同文件，直接调用两叶 factory 返回的方法 | 2 | body-only full 为 `estimated`；缺 span、部分组、越界、重复目标、组被篡改、来源矛盾、序列化不一致均 unavailable；φ/δ 坏输入 `invalidInput`；共同包装无递归 |
| 受影响既有用例 | `tests/moonshot-closeout-boundaries.spec.ts` 真实形状 details 由拒绝改为估算、encrypted 负控保留；`official-reader-bindings`、`official-moonshot-definitions`、`moonshot-input-meter` 跟随新发布 | — | 通过 |

同批对实现做了变异负控：去掉投影、放宽并行键逐字相同、去掉 `[REDACTED]` 排除、拆掉共同包装、图片计数改读原 body，各自使上述用例失败。演示装配 `examples/model-invocation-minimal-demo/tests/moonshot-three-round-service.spec.ts` 的 details 用例已改为真实形状与只发 details 两个变体（均期望估算），但在本 spoke 基线上整份演示装配因 `model-request-runtime` 要求 `callAccess`／`callPresence`／`callFacts` 而启动失败（与本改动无关，其他演示 spec 同样失败），该组合尚未实际通过。本节不关闭 MV4（真实回放与必做同路由对照，归 root 账本）、G1 上游转换、G2 真实回放或两叶 D7 认证。

## H13 多个历史输出组候选

对象为 [v13 revision 1](v13-output-history-design.md)，精确消费 D-107 已接受 MR9/RT10 与 runtime v19 候选唯一账本。**本节均为待执行义务，新增绑定 0**；本次文档检查不证明源码、模型或上游已兑现。

| 编号／条款 | 正向、反例与必须失败的负控 | owner／受阻消费者 |
|---|---|---|
| H13-V1：MR9 S-43/S-44；RT10 S-79 | 独立 public 的多组原 blocks/usage/origin 显式输入；requestInput unavailable/outputGroup known 保留 O；缺 outputHistory/坏形状/未知成员、错摘要、越界或原事实矛盾拒绝。runtime/transport ownPlanInput 与缺限额前检均显式 copy；修改 caller 嵌套原对象不改变已拥有快照，大整数及缺席不丢失。独立 full/φ/δ 入口也核本口可判关系，不能只验 planner；同一可判坏组经 planner 返回 malformed，经独立 full 返回 unavailable，经独立 φ/δ 返回 invalidInput，三者均不得成功计量。未知旧投影版本只判依据不足，不冒判摘要错误 | runtime copy＋transport projection；public/full/δ |
| H13-V2：MR9 S-43；RT10 S-78 | 重复 target、跨组目标重叠、锚/history 同目标异源明确拒绝；同内容不同原块、不同块共享合法 message span 不误拒。重复 source、partial、删选或重排不能自动消费一次完整 aggregate；未知旧编码不凭相同 hash 通过 | transport；覆盖分配与各 meter |
| H13-V3：RT10 S-77/S-78 | 两个以上旧 opaque 组在 full 用有据映射覆盖；收到实际完整 I 后下一轮 marginal，旧组全部落 P 且原 O 不再次加入。移除排除逻辑导致数值多加的负控必须失败 | transport/家族 owner；全量重锚与增量 |
| H13-V4：RT10 S-78/S-80 | 较早准确 I 锚＋中间 I unavailable/O known＋新 user：中间组交 δ，全新增覆盖；稳定 P tokenizer 访问零。跨 P/G/N 不得拆 aggregate；共享 framing 只计一次。删掉中间组计数、把锚组同时交 φ/δ 的负控必须失败 | transport＋runtime；普通多轮/缺统计后续 |
| H13-V5：RT10 S-77/S-79；MR9 S-43 | full/φ/δ 独立导入不建 Context、不读日志/环境/网络；已知旧 binding/mode 到当前依据映射可用；换模型/tokenizer/mode 后无证明不能用原 O；requestInput unavailable 不以当前 route 补原 origin | 逐家族 meter owner；public 和 service |
| H13-V6：MR9 S-43；RT10 S-78 | 固定组 O 含 reasoning，O+reasoning、密文字节 tokenize、O 与整组可见块二次相加、按块均分 O 均须击中反例。partial/重复/缺 origin 下无映射时 unavailable；有据 estimated 不提升 exact/upperBound | 模型 owner；每个获供型号，不能由家族一个成功认证全部 |
| H13-V7：RT10 S-74/S-78 | full 与 marginal 的 signed 修正/总量非负、precision 合成、一次 margin、输出预留；完整 UTF-8 bytes/逐图解码/图片数照验。固定 wire 前后相同；估算不覆盖 actual usage/cost，拒绝零 HTTP/新增锚/响应 | transport gate；所有消费者 |
| H13-V8：MR9 S-45；RT10 S-80/S-81 | 真 service 原同批 `[M,R]` 的冷恢复构造同组，与同事实 public 计量一致；原批回执 unknown 时不得从内存提前发布组。错租户/日志/generation/因果源由 runtime 门拒；恢复读回保持原 O/partial/route，禁止重算历史事实。遍历全部来源，不因已有锚跳过后续坏 D/M/R；sourceUnavailable 可 full 与必要事实 unavailable 必拒分开，noObservation 不能吞已选 known G | runtime 主责、transport 配合；耐久服务 |
| H13-V9：RT10 S-79/S-82 | 真贡献换代保持旧 lease 的原 meter/projection，新增接口整批迁移无旧重载；public/invoke/plan、openCall/dispatch/dispatchAgain 与现 demo reader 均覆盖。百万级多旧组分别量测 copy、序列化、projection/hash、全图门、tokenizer、合成及峰值内存，报告字节/组/selection 数并比较固定新增、递增历史。稳定 P tokenizer 零与端到端性能分别报告，不声称扫描为常数 | verification/贡献 owner；性能与包交付 |

### H13 覆盖缺口

| 缺口 | 精确限制与消费者 | 关闭责任 |
|---|---|---|
| H13-G1 | RT10 S-79：本节点与 runtime v19 均候选；公共迁移尚不得据此实施 | 主线联合 architecture/spec 表达复核和精确采用；起草者不接受 |
| H13-G2 | MR9 S-43、RT10 S-78～S-82：H13-V1～V9 未运行，不能以旧单 observation 的通过结果代证多组 full/δ | runtime/transport/verification 完成实际正反例、独立制品及双语 README |
| H13-G3 | MR9 S-43、RT10 S-78：O 到当前输入没有无条件恒等；仍缺依据的每个模型不能借接口齐全称完成 | 模型 owner 明确固定 route/binding/mode、转换/边界、精度及真实留出；没有依据保留 unavailable |
| H13-G4 | RT10 S-77/S-78/S-81：现 UsageCalibration.tla 有锚/失效/原批性质，但未表达多组 target 分配及 aggregate 转换守卫；NoDoubleOutput 不证明实际覆盖互斥 | 主线明确新组级形式证明范围；若要求此保证，spec owner 发布后继形式工件与负控，不改冻结版本。H13-V2/V3/V4 是必要实现证据，不能冒称已有 TLA 已证 |

H13-G4 不改变 MR9/RT10 的原接受状态，不将旧形式任务重绑给未建模性质；组级来源映射以本节真实反例和后继正式证据分别兑现。新增 store/持久事务/服务均为零，仍须验证原 batch 发布与旧 lease 交错，不靠进程锁或时间谓词补来源门。
