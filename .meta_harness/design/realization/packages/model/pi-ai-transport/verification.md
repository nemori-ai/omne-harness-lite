# pi-ai-transport 验证与证据

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
| G：新增逐模型适配 | 对 37 模型分别用生产函数与服务路径取角色、参数、工具回传、推理、缓存/精确费用证据；每个指定路由独立认证，禁止一次族代表通过后把整族判通过 | 未开始；研究暖读仅作后续输入 |

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
