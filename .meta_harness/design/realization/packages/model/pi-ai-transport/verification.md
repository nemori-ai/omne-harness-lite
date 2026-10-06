## v8 统一公开面破坏性迁移验证

[v8 公开面](v8-input-limits-design.md)明确采用统一公开面。精确采用范围沿正文；**IL-V9-v8** 取代旧 IL-V9 的双代际过渡判据，IL-V1～8 的新代际义务保留。

**IL-V9-v8 / MP4 S-28/S-29、RT6 S-53/S-57/S-74：**独立公开制品从同一根读取 37 份完整定义并经 core 根 MP4 判定，建档完整保真；纯 import 零网络/Agent/注册。过渡 `./definitions/v4`、旧定义实现和旧 Pro 执行特例不再导出或被当前路径引用。旧五项定义进入读取/注册/factory/plan 明确拒绝且零 HTTP，新六项定义在当前 root 与 plugin 共享判定；不剪字段、不自动降级。新 binding 必须精确取得当前贡献，不能回退旧模型。同键不同内容拒绝，不能用修订字符串魔法代替全值校验。

所有当前 runtime、demo、README/README_ZH 及打包消费者使用新路径；缺 meter/材料时按 RT6 具名拒绝，零新增锚点/HTTP/响应/调用终结。具备可靠 meter 的受控组合必须成功发送已检查的同一 serialized，证明不是全拒绝占位；正式模型成功仍须实际依据。旧不兼容日志/快照明确失败，不报空历史或已恢复，运行前后原用户文件字节不变，无自动删除/迁移/回填。现行依赖的 content-blocks 等版本保持其精确消费，不能把删兼容解释为无范围升级。

负控至少包括：旧五项被补默认后放行、为 demo 保留旧发送旁路、根与插件使用不同能力判定、未检查 token 就把完整声明当发送许可、旧日志拒绝被改为空历史；每项必须由实际边界 oracle 拒绝。没有可靠 token 证据则保留 IL-G2，不把假 meter 的测试成功说成正式发送通过。旧过渡路径的局部验证不适用于统一公开面。

## v7 完整输入限制验证

[v7 输入投影](v7-input-limits-design.md)消费 MP4/RT6，以下是验证 oracle，不记录每轮结果；精确采用范围沿对应正文，有限传输验证不证明全部义务。


| ID / 条款 | 验收 oracle 与必须失败的负控 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IL-V1 / MP4 S-8/S-9/S-32/S-33 | 六项能力在 read/own/build/register 各面都保真；unknown 配有限 cap 合法，缺事实、缺必需 cap、limited 比项目 cap 小、非 image 带图片限制及非法三态均拒。图片档案只发文字也不能绕过缺单图 cap；恢复旧五项 validator 或 unknown→unbounded 默认必须失败 |
| IL-V2 / MP4 S-27/S-28/S-29 | 公开读取和建档六项逐值相等；跨字段由 core 唯一判定。registry 同坐标改 cap 或 upstream 状态拒，JSON 对象键顺序与数值拼写不产生假差异；定义原对象/读回对象变化不改 lease。配置 Schema/解释器双向一致，caps 不混入配置。负控删比较字段、补默认或以 latest 覆盖 snapshot 必须失败 |
| IL-V3 / MP4 S-28；RT6 S-53 | 八家相同定义组织和公共消费路径；最终完整定义精确 ID 集与承诺供给集核对，逐项来源及项目 cap 可解释。import 不联网/建 Agent/注册，具名定义可单独读取和配置解释；无事实的 fixture 不算 official。旧形状不给自动补值，README/README_ZH 实例经独立公开制品消费 |
| IL-V4 / RT6 S-74 | 按规定次序覆盖三种既有拒绝、缺项、malformed、准确超限、不可计量及合法输入。已有调用被拒保持阶段与锚点数；token 不可判但请求字节准确超限仍报 exceeded。超 cap 的保守界不能报实际超限，unknown 上游不等同不可计量；删除任何一个差别必须失败 |
| IL-V5 / RT6 S-74 | 实际本机 HTTPS 抓线 bytes 与已检查 serialized 的 UTF-8 bytes 相等；工具 Schema、developer reminder 标记、协议包装、cache_control、多字节字符、内联图共同入数。逐图严格 base64 拒绝非法表示；重复图计两项，工具结果图计入，cap−1/cap/cap+1 全边界；伪造 AttachmentRef.bytes 不能放行，send 重序列化/加项负控必须失败 |
| IL-V6 / RT6 S-74/G-33 | 对每个采用的 meter 保存模型/provider/算法版本/适用域与准确性或上界论证，独立核对全部输入贡献。词表正确但漏消息/工具包装、漏特殊 token/模态、用样本最大系数冒充全域上界、仅凭 callback 标签通过均作为拒收反例。token 证据未知时 size_unavailable、缺构件时 unavailable；尚无合格算法不可声称通过本项 |
| IL-V7 / RT6 S-53/S-58/S-64/S-74 | 真实两代 lease 交错：旧引用固定 A cap/算法，B 发布只影响新取得；规划后输入改动及 A 退役不改变抓线，旧清理不删 B；伪造/复制/跨宿主 plan 不能 send。取消/停止时所有实际 reader/socket/callback 沿既有 owner 排空，不能只断言 disposer 已调用 |
| IL-V8 / RT6 S-20/S-54/S-63/S-74 | 独立公开 invoke 与真实 Cordis/runtime 路径分别验零新增锚点/HTTP/响应/终结；合法固定输入仍能通过，不能用全拒绝替代 gate。诊断只含允许指标、数字与绑定，敏感 sentinel 不出现，既有取消、H、故障归属不回归；runtime/日志组装未建成时保留对应覆盖缺口 |

覆盖缺口：**IL-G1**（MP4/RT6 采用与 core 实现，阻塞正式源码升级）、**IL-G2**（逐模型可靠 token 依据，阻塞相应新版成功发送）、**IL-G3**（runtime 拒绝/锚点/历史分发及产品装配，阻塞纵线验收）、**IL-G4**（既有缓存与实际多模态认证，阻塞对应提供范围）。owner、精确采用范围、边界与闭合条件归[输入投影的缺口表](v7-input-limits-design.md#实施清单与缺口)。声明的未知上游数值不是全批声明阻断；file 元数据不是新增 PDF 平台义务。没有已运行且在删掉上述语义时失败的证据，不把 IL-V 填入 bindings。

## v5 响应头证据义务

[v5-headers-design rev2](v5-headers-design.md) 的精确采用范围沿正文。RawResponse 原始对象与句柄返回值的泄漏必须由 PH-V9 真实公开面验证。RT5 六份形式任务不承载新增头性质，形式登记不代证真实采集。规范 oracle 来自 [RT5-H1～H6](../../../../spec/capabilities/model-request-runtime/v5/examples.md#v5-增量同次响应头的交接与留存) 和 [MR5 完整实例](../../../../spec/data/model-response/v5/examples.md)。

| ID／来源条款 | 可执行场景与必须观察的判据 | owner 与完成边界 |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PH-V1：RT5 S-58；MR5 S-20；RT5-H1/H2 | 在采用 Node 上用真实本机 TLS 的 2xx 和非 2xx，送普通串、逗号串、重复 set-cookie、空串，比较 Node 实际采得 map 与同次公共 rawHeaders；wire 行序、头名大小写及 HTTP 库合并不能被冒称为本包保证。另用完整公共端口 literal H 覆盖单元素数组、重复／乱序／空成员、空数组／map，缺席独立检查；这些 literal 不能写成真实线上采得证据 | transport 验证 owner。捕获构件若有可独立纯边界，可直接验证其自身；不能靠只跑 core Schema 代替 send |
| PH-V2：RT5 S-58/S-59；MR5 S-21/S-22；RT5-H1 | send 交出后修改底层原 map／数组、调用者尝试赋值／删除、释放 R，再观察原 H；正常成员与特殊键保留，不调用用户 getter/toJSON 或混进继承成员。坏值 null／数字／对象／混合数组等用违规提供者负例显式暴露，不 coercion、静默滤项或缺省；缺席绝不补空 map | transport＋公共端口验证 owner。Node 不提供某 literal 时分别报告字面边界与真实运输覆盖，不伪造端到端证明 |
| PH-V3：RT5 S-18/S-58/S-59；RT5-H2 | 控制 TLS 非 2xx：错误体读完、非法 JSON、超界、先 flush headers 再断 socket、挂起正文后 cancel；分别安排 request.error/readError 的先后。每个已采 H 的公共结果保留原值，failed 仍是实际 HTTP 状态和来源，不退成 connect；取消按原 aborted 事实供 invoke 判 interrupted。没有 response 的 connect/cancel 分支缺 H；发出最多一次 | transport owner。保留真实 HTTP 次数、分支轨迹、断开与 reader 完成证据；仅回调打点不足 |
| PH-V4：RT5 S-20/S-63；MR5 S-21；RT5-H5 秘密部分 | 显式给出三项 S-20 测试政策：同次完整凭据、达到配置长度的片段、名单头、独立形态哨兵；覆盖普通键／值和数组每项、遮罩键碰撞、正常非敏感 H。send 成功／HTTP 失败／取消、read 原错误与诊断都不能漏哨兵；剥除指定头，其他值保原形。缺政策和非法政策在出网前拒绝，零 HTTP | **受阻 PH-G2**；runtime 政策 owner 明确公共构件与配置后，transport 验证真实出值。测试参数不成为生产默认；仍须 PH-J1 的全部写方检查 |
| PH-V5：RT5 S-54/S-55/S-58/S-59/S-63；RT5-H2/H3 | 真 TLS→send→invoke：complete、truncated、带内有／无码错误、解析失败、首内容前／后断流、门失败、门等待取消、reader 未进入。H 从公共 send 保留到四 outcome；只有头且正文暂停时，gate、snapshot 内容、onAccepted、arrival、firstTokenAt 均无新增；diagnostic.detail、上下文及默认呈现无 H | **待 joint 接线**；runtime 与 transport owner。SSE 与任何 JSON 读取面的覆盖须分别核实；若宣称另有 JSON 读取面，必须点名实际入口并分别实测，不能虚造已存在的 JSON reader |
| PH-V6：RT5 S-54/S-58/S-59；RT5-H3 无双源 | 用只提供读取能力的不透明 R 和公共 H；再加带冲突私有 headers 的违规 R／StreamEnd，invoke 只保留 H；去掉 H 时不能从旧字段补回。旧 RawResponse.headers 与 TransportFailure.headers 的生产出口及旧消费迁移核查；不是为双源建立优先级 | **受阻 PH-G1/PH-G3**；runtime 公共类型／invoke owner，transport 同步测试。违规 reader 不合规由负控暴露，不能将其当正常第二权威 |
| PH-V7：RT5 S-53/S-56/S-58/S-64；RT5-H2/H4 | 真实 Cordis 4.0.4 与直接工厂、固定 lease：收头后取消／retire／close，complete 先定后晚 cancel、取消先定后晚数据、R 从未 read 的 stop；观察准入关闭、一次发送、实际 socket 关闭、read／错误体任务结束、track 回调和引用释放，旧 H 不变。保留旧队列／旧清理不删新贡献与原参数／usage／绑定回归 | transport 与资源 owner。signal、结果返回、fiber 开始 UNLOADING 都不等于实际停止；范围不扩大到完整宿主恢复 |
| PH-V8：RT5-H6；SYS-OPEN | 构建并打包后在两个新建仓库外消费者中仅用公开入口执行上述合法／非法 literal 和可控 TLS；执行 README.md／README_ZH.md 全部修改的例子。至少实际编译四类行为变体：数组 join／取首、取得头后取消删 H、从旧双源补头、把头当首 token；原版 oracle 成功，变体以对应 AssertionError 非零，编译失败／超时不算命中 | 独立验证 owner，分别变异真实承担行为的 transport 或 runtime 制品。若 core 仍从 MR4 入口拒数组，另负控断言公共精确 MR5 消费失败；源码类型通过不能代替实际制品 |
| PH-V9：RT5 S-20/S-58⑤/S-59/S-53/S-56；PH-AR1 | 真实 TLS 2xx 回显 secret／片段／指定头／形态哨兵并暂停正文；显式 S-20 政策已令 send.rawHeaders 安全，**reader 尚未进入**。实际 JS 消费者检查 R 的直接取值、`in`、Reflect.ownKeys、属性描述符、Symbols、原型及可达自定义成员，确保只有 stop/stopped、无原始 stream/request/socket/redactor/headers；不能用 TS 访问报错、非枚举或 JSON.stringify 当证明。另一次调用 stop，断言返回严格 undefined，await stopped 的履约值也为 undefined；检查返回／拒绝信息和诊断不携原始对象／秘密。句柄复制／伪造／错 plan／错 host 被拒；真实句柄只允许一个 reader，保持原取消／实际停止／lease track 排空。打包根与 plugin exports 不导出私有表或解包函数，未声明的包子路径不可作公开旁路 | transport 实施与独立制品验证 owner，完整政策仍依 PH-G2。至少两项真实 compiled 负控：重新公开 stream（含不可枚举／Symbol 等旁路变体）和恢复表达式 stop 返回 req，分别以预期可达性／返回值 AssertionError 非零；不以编译失败算命中。观察限正常 JS 公共面，不声称同进程调试器／内存沙箱 |
| PH-J1：RT5 S-17/S-20/S-68～S-73；MR5 S-20～S-22；RT5-H5 | 同次 H 经 runtime 完整响应构造、MR5 公共接收、共同 codec、全部真实写方：runtime rsp＋账和 persisted msg＋rsp＋账；真实 append 后关闭原物理 writer 再 reopen，完整批身份／费用／binding／头原值一致，秘密哨兵不出现在输出或日志。raw.body 独立缺席及原附件责任另验，不增加 transport IO | **其他 owner pending**；runtime／共同 codec／消息写方／session-log-jsonl／验收装配。transport 单包通过不关闭它；旧 mrr/1 解释和混用政策必须先由 codec owner 明确采用 |
| PH-J2：RT5 S-17/S-33/S-36/S-64/S-68～S-73；RT5-H5 | 已提交批 H 与后来候选 H2 竞争，保留原完整批；unknown opened／response、迟到提交、原写方未停、进程丢失未持久 H：沿原强门／恢复且不重发，不凭 H 绕过锚点。全部实际写方和共同 tail/判重边界参与 | **其他 owner pending**；耐久 runtime／日志／Run 与消息写方。G28/G29/G30/TL-G1 未闭合不由本页豁免；未持久且进程丢失的头不要求伪造恢复 |

### v5 响应头覆盖缺口

| 缺口 | 精确受阻处／事实 | owner、闭合条件与仍可继续部分 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PH-G1 | RT5 S-58 的 SendResult 与 MR5 RawHeaders 公开消费；新旧结果／头出口的现行消费须以实际公开边界核对，不能沿旧观察基线推定 | core、runtime 公共类型 owner、主线明确采用与实际构建／pack；transport 按本稿同步，不能先靠断言或私有路径开工。局部采集和竞态设计仍可完成 |
| PH-G2 | RT5 S-20/S-58/S-63；当前缺 credential_header_names／credential_patterns 的公共接线及匹配实现，只有片段最小长度与字符串 redactor | runtime 政策实现与主线明确完整构件、参数解释及出值前交付机制；验收装配显式给值。本文不选默认名单、regex 方言或新的失败政策；完整秘密符合性和 PH-V4 受阻 |
| PH-G3 | RT5 S-54/S-59；公共 rawHeaders 到四种 outcome 的接线须沿实际当前入口核对 | runtime 节点投影／实际 invoke 接线及 PH-V5/V6，先于 joint 验收；本节点单独传输结果通过不冒充函数链闭合 |
| PH-G4 | RT5 S-17/S-68～S-73；完整 MR5 响应的 codec 格式、mrr/1 历史解释、全部写方与真实日志链 | 对应原 owner 明确采用并跑 PH-J1/J2；本稿不改 wrapper、业务键或混用语义。G31 仍开；不妨碍独立 transport 测试 |
| PH-G5 | RT5 S-53/S-56/S-58；Node 实际关闭次序与 header map 采集边界须以当前实现独立验证 | transport 验证 owner 以采用 Node 版本真实 TLS 及行为负控取证；basis 中有 probe 的 Cordis条目只支持相应内核性质，不代证 HTTP |
| PH-G6 | RT5 S-20/S-58⑤；rev1 未封装原始 stream，stop 若返回 ClientRequest 则类型 void 不能隔离它，必须由真实公开面负控拒绝 | rev2 已起草私有响应所有权／真实句柄及迁移，**独立复评与 PH-V9 源实现／实际制品验证均待**；transport owner 闭合。不将本行与 PH-G2 的政策解释合并成一个假通过 |


## 当前验证范围与限制

本页维护验证义务、方法、前提与覆盖限制。单次运行输入与输出留本工作树 `tmp/`。公开构件的有限验证不证明耐久 service、完整请求运行时或全部 37 个模型的生产认证；精确采用范围归 [README.md](README.md) 与各增量正文。

完整声明/配置、八项参数值与缺席、精确域、Unicode extra 原项名、全值同 key 比较、零 HTTP 拒绝、贡献换代及 owner 排空须分别验证。旧默认定义与 pilot 的删除不把测试 fixture 升为正式来源。ND-V1 正式来源值、ND-V6 全部 official role/配置、全部布局真实附着及 ND-G1～3 仍需其自身验证。

T-16 覆盖不同 id/index、未知 metadata、null/缺席及超过 2^53 的值。同 metadata 文本可拼接，但同路由回放须比完整 JSON 值；换路由不得复用。LosslessNumber 私有字段的表面相等不证明精度。T-8 保留首次实际报告的值及 serving_provider_changed 诊断。T-12/14 的逐事件接收须经真实 stream-assembly/3。T-19 的 socket reset、无码带内错误、异常 finish_reason、未结束 SSE 帧和 DONE 后数据均不得伪造正常封口或费用。

贡献生命周期需实际 acquire/retire、空闲后重新 acquire、幂等 release、旧清理不删新贡献、超时 fiber 保持 UNLOADING，并等 HTTPS、读循环及 track callback 实际收口。控制 endpoint assembly 只证明受控组合，不认证固定 OpenRouter 插件的实际网络。正常路径和负控各有自己的最终资源状态，不能泛称 socket/queue 全部归零。

输入窗口与单图计量、跨参数约束、模态来源、G22 上限、缓存 TTL 冷暖/到期、完整 T/SC/G、全部诊断/脱敏/查询矩阵、宿主 service 换代、目录耐久采用及逐模型 public/service 认证仍有未闭合范围。函数面、打包公开消费与两种语言示例的局部通过，不代替这些义务。

## 证据义务

义务从契约 [S-38](../../../../spec/capabilities/model-request-runtime/v2/contract.md#s-38-装配给的保证-vs-协议须给的保证) 传输适配十一条、生产者一侧的数据契约条款与 D-019 的比较门产生，不从已有测试反推。**T 系列**是本包的符合性测试：不装 Cordis、不连外网，只用函数面对一个本机脚本化 HTTP 端（按脚本回状态码、首部与 SSE 字节，并记下收到的每一个请求）；**G 系列**是比较门，必须对真实 OpenRouter 实测。

| 来源条款 | 需要什么证据 | owner 与闭合条件 |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-38 第 1 条；S-22；`data.model-response/v2` S-24 | **T-1**：脚本端回 `503`、`429`、首部后断开、正文中途断开各一次 ⇒ 每次收到的请求恰 1 个；请求体 `provider` 恰为 `{ order: [那一家], allow_fallbacks: false, require_parameters: true }`；`extra` 带 `models`／`route`／`provider` 时这三键不出现在请求里、记进丢项 | 本节点；独立函数面验证 |
| S-38 第 2 条；S-18 | **T-2**：`400`、`401`、`402`、`403`、`404`、`408`、`413`、`429`、`500`、`502`、`503`、`504`、`418`、`302` 各一次 ⇒ 交回 `http_status`、状态码逐字相同、首部原样；响应体超过 `maxErrorBodyBytes` 时停读且不截改已读部分的含义（只交状态码与首部、记诊断） | 本节点 |
| S-38 第 3 条；D-035 保留前提 1、2 | **T-3**：工具参数分多片到达（含一片把一个多字节字符切成两半、含中途是不合法 JSON 的前缀）⇒ 交出的 `fill` 片段相接**逐字节等于**上游各片 `function.arguments` 相接；工具调用块封口不带块。**SC-1** 静态检查：参数路径上没有任何 JSON 解析调用 | 本节点 ＋ 承载仓库 `tools/ts-checks`（规则未写） |
| S-38 第 4 条；S-16 | **T-4**：脚本端先回首部、停 500 ms、再发第一片内容 ⇒ 首部到达时 `readStream` 不交任何事件，第一个事件是 `open` | 本节点 |
| S-38 第 5 条；S-19 | **T-5**：进程环境里放一把 `OPENROUTER_API_KEY`、交空凭据或全空白凭据 ⇒ `local` 失败、脚本端**零请求**。**T-5b**：交一个哨兵凭据串，跑完全部失败支 ⇒ 本包交出的任何值（失败事实、`StreamEnd`、诊断事件）里找不到它或它任何不短于 `credential_fragment_min_length` 的片段（取值是契约 G-6，测试配置自带）。**SC-2**：包内没有 `process.env` 的读取 | 本节点 |
| S-38 第 6 条 | **T-6**：抓到的请求里没有 `x-session-id`、`session_id`、`user`、`prompt_cache_key` | 本节点 |
| S-38 第 7 条；S-11 末段 | **T-7**：消息里有图而快照 `inputModalities` 只有 `text` ⇒ `{ rejected: "modality_not_carried" }`、零请求；工具结果里的图同样；出现语音块 ⇒ 同样拒绝；`PI_AI_CARRIABLE_MODALITIES` 恰为 `{ text, image }` | 本节点 |
| S-38 第 8 条；`data.model-response/v2` S-9 | **T-8**：SSE 带 `id`、`model`、顶层 `provider` ⇒ `serving` 三项原样；`model` 从没出现 ⇒ `upstreamModel` 缺席（不以路由名填）；`provider` 中途变了 ⇒ 保留第一个、记 error 级诊断 | 本节点 |
| S-38 第 9 条 | **T-9**：脚本端回 `302` 带 `Location` 指向另一个本机端口 ⇒ `http_status` 302、那个端口**零请求**。这一支同时是「`node:https` 不跟随重定向」这一假设的 probe | 本节点 |
| S-38 第 10 条；S-29 ④；`data.model-profile/v2` S-17、S-21 | **T-10a**：`planRequest` 交出的改值与丢项，与 `sendRequest` 实际发出的请求体逐项对得上（发出的 = 合并后的，换掉改值项、去掉丢项项）；`planned` 冻结后改不动。**T-10b**：参数处置表逐行——缺席的项不出现；`reasoningEffort` 缺席 ⇒ 请求里没有 `reasoning`；`max` ⇒ 记丢项；`extra` 里落在本包握着的键或统一项上游拼法的 ⇒ 记丢项 | 本节点 |
| S-38 第 11 条 | **T-11**：工具条目名（含 `__`）原样进 `function.name`；回来的调用块头 `tool` 与上游 `function.name` 逐码点相同 | 本节点 |
| S-51（生产者一侧）；`data.arrival-events/v2` S-7、S-11、S-13 | **T-12**：一组录制的 SSE 夹具（纯文本、思考＋文本、思考只有 `reasoning_details`、单个与并行工具调用、`finish_reason = length`、`stop`、`tool_calls`）⇒ 交出的序列逐个交给 stream-assembly 的 `accept` **一个都不被拒**；`length` 那一支没有任何 `close`，`stop`／`tool_calls` 那一支每个开着的块都有 `close` | 本节点与实际 stream-assembly 提供者 |
| `data.arrival-events/v2` S-8、S-9；`data.content-blocks/v2` S-14 | **T-13**：`BlockId` 在一条流里两两不同；每个 `open` 都带两位 `visibility`；工具调用块头带 `callId` 与 `tool`；`CallId` 形如 `call_` 加 32 个 `[A-Za-z0-9_-]` 字符、同一（`ModelCallId`，发出，索引）恒得同一个值。**「在一份会话日志里两两不同」没有测试能证**：它建在 SHA-256 抗碰撞与三元组会话内唯一之上，这里只登前提，不登成已证 | 本节点 |
| `data.arrival-events/v2` S-20 | **T-14**：性质测试——任意切分的片段序列，封口块内容 = 片段按到达次序相接（那份契约写明这条的证据只能落在生产者一侧） | 本节点 |
| `data.arrival-events/v2` S-15 | **T-15**：带 `usage` 的流恰交一个 `account`、且在生成器返回之前；没有 `usage` 的流不交；`usage` 来两次 ⇒ 取后一个、记 info 级诊断 | 本节点 |
| `data.content-blocks/v2` S-9 | **T-16**：`reasoning_details` 进 `opaque`，经严格无损读写回来、同一路由名再请求时 `reasoning_details` 与上游原样**逐值相等**（含一个超过 2^53 的整数）；换一个路由名时不带 `reasoning_details` | 本节点；回放在真实上游上是否被接受归 G 系列 |
| `data.messages/v2` S-35、S-36 | **T-17**：`SystemReminderMessage`、`CompactionMessage` 各落成一条带系统标识的 `user`（`routeWireHints` 写了 `developer` 的路由落 `developer`）、不丢；`ToolInternalMessage` ⇒ 规划拒绝；有调用无结果 ⇒ 规划拒绝，**请求里没有凭空造出的结果** | 本节点 |
| `data.call-accounts/v2` S-4～S-8；那份契约 G-9 | **T-18**：`cost` 为 `0.000000123456789012345678`（超过 17 位有效数字）⇒ `cost_usd` 精确相同；`cost` 缺席、为字符串、为负 ⇒ `cost_usd: "unknown"`、`source: none`；`prompt_tokens` 小于缓存读加缓存写 ⇒ 三项输入都 `"unknown"`；缺席的 token 数不记 0 | 本节点；换算规则本身的真伪归 G-9 |
| S-18 的来源分支（本包交的事实） | **T-19**：DNS 失败、拒绝连接 ⇒ `connect`；正文中途断开且无 `finish_reason` ⇒ `stream_broken`（不封口）；`finish_reason` 之后又来内容、单事件超过 `maxSseEventBytes`、一帧 JSON 有重复成员、名字始终没到的工具调用、`delta.images`／`delta.audio`／`delta.refusal` 非空 ⇒ `protocol`；首帧带 `role`、`refusal: null`、`annotations: []`、`content: ""` ⇒ **不交任何事件、不以 `protocol` 收场**；HTTP 200 之后帧里带 `error: { code: 500 }` ⇒ `in_band`，**`statusCode = 500`、`inBand: true`、`httpStatus = 200`**（断言 `statusCode` 不是 200、不缺席；契约 S-38 第 2 条）；帧里 `error` 没有整数 `code`、或只有异常的 `finish_reason` ⇒ `in_band`、`statusCode` 与 `inBand` 都缺席、`upstreamError` 原样；`maxConnections = 1`、一条流占着连接时第二次 `sendRequest` 在排队中收到中止 ⇒ `local`、带 `queued` 留痕、脚本端对第二次**零请求**；拿到连接之后调用方中止 ⇒ `aborted`、此后不再交任何增量 | 本节点 |
| 装卸（[design](design.md#成对的装载与撤除)） | **T-20**：用 kernel-basis 的测试装配起本插件：配置缺席 ⇒ 取初值；配置不合形状 ⇒ 插件 `FAILED`、`modelTransport` 不可见；一条流在途时撤除本插件 ⇒ 那条流**不断**、继续交增量直到调用方中止或自然收尾；撤除之后再 `sendRequest` ⇒ `local`、零请求；最后一条在途结束后连接池被销毁 | 本节点 ＋ kernel-basis |
| SC-3 | 静态检查：网络 API 只在 `sendRequest` 所在模块里出现；`planRequest` 与 `createPiAiTransport` 不开连接 | 本节点 ＋ `tools/ts-checks` |
| **G 系列：D-019 比较门**（十五项）与请求差异四项（最大生成长度字段、`store`、`reasoning`、`strict`） | 对每条目标路由用同一份输入实测，逐项记结果：请求路由四项、原始工具参数与结果回传 ID、流终态与无尾随事件、实际执行方与响应 ID、`usage.cost` 质量（按 generation id 查 `/generation` 对账）、私有 replay、重定向、错误、断流（首 token 前后各一）、abort（首 token 前后各一，含是否仍计费）、无隐藏重试 | 主线与实施 owner；真实付费调用须另有明确授权。密钥只由脚本读取，不进会话或日志。任何费用或身份丢失先报告反例 |
| G 系列：本页新增的比较项 | `max_tokens` 与 `max_completion_tokens` 是否等价；`store: false` 与上游缺省；`require_parameters: true` 在单家路由下的实际效果；`transforms` 的缺省；`anthropic/*` 走 chat-completions 时的思考回放、缓存断点与中途 system；`reasoningEffort` 的取值集；`402`／`403`／`404`／`413` 是否出现、含义；带内错误的形状，带内 `code` 与 HTTP 状态是否同一套码（契约 G-5）；`delta` 内容成员闭集是否完备、各家首帧实际带哪些非内容字段、`refusal` 何时非空；`cost` 的单位；`prompt_tokens` 是否含缓存读写；`is_byok` 下 `cost` 的含义；`CallId` 在上游的词法上限 | 同上；结果回填 design 的 PAT-N3、N5～N7、N10、N12、N13 |

## 覆盖缺口

- **逐模型比较门**（PAT-N2）：未获完整真实认证的模型不能据本机测试宣称其产品发出语义全部闭合。
- **`CallId` 的会话内唯一**只能登前提（SHA-256 抗碰撞、`ModelCallId` 会话内唯一），给不出会失败的测试；若评审认为这不够，退路是让 P-2 把 `CallId` 的登记落在会话日志的判重键上——那是 model-request-runtime 一侧的改动，报主线。
- **状态码表、费用单位、用量换算**都是待核对主张（PAT-N3、N5、N6）；T 系列只核本包照表与照规则做，不核规则本身对不对。
- **PAT-N4、PAT-N9 已由契约闭合**（D-060 §八 N-40 ④、N-41）：T-19 的带内一支从「两样都交出来」改为断言 `statusCode` = 带内 `code` 且带 `inBand`；T-7、T-17 仍只核本包拒绝且零出站——拒绝值到 `undispatched{modality_mismatch}`／`invalidInput{reason}` 的收场在 P-2，证据归 model-request-runtime 一侧。
- **P-2 对 `local{queued}` 与无码带内错误的分类已有判据**（PAT-N18）：MRR v2 S-18/S-21/S-36 已闭合；T-19 仍只核本包交出的事实，P-2 最终成因及撤除收场的场景证据归 model-request-runtime，其真实场景覆盖沿 runtime 验证与绑定。
- **跨 fiber 的撤除次序与等待**未核实；本设计的结局不依赖它，T-20 只覆盖同一装配里先撤本插件的那一种。**跨依赖撤除的机制探针**（机制名 `dispose-order-across-inject`，owner kernel-basis 节点）：提供者 fiber 撤除时，inject 它的依赖方是在提供者的异步撤除函数完成之前还是之后被卸载；它决定本插件撤除的等待是否要等到在途流自然收尾（[design 的撤除等待上界](design.md#成对的装载与撤除)）。

## v3 增量验证

[v3-design.md](v3-design.md) 的精确采用状态沿正文；T/SC/G 义务仍全部保留。本文区分“旧义务继续”与“版本怎样改变输入/判据”，不借新适配器免掉比较门。下文 runtime 指 `capability.model-request-runtime/v3`，profile/messages/response 分别指 `data.model-profile/v3`、`data.messages/v4`、`data.model-response/v4`；arrival-events、call-accounts 为 v2，content-blocks、tool-definition、stream-assembly 为已接受 v3。

### 原验收逐项接续

| 既有编号 | 保留的失败判据与版本影响 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-1 | 一次 send 至多一 HTTP；三项固定路由、extra 禁用键不变。新增 37 个 definition 的规划逐项不得改写这组保护字段 |
| T-2 | 原状态码/首部、错误体上界不变；新版事实对象仍不能用 HTTP 200 覆盖带内 code |
| T-3 | 工具参数逐字节拼接不变；家族/窄适配不得加一次解析或 schema 改写；使用 content-blocks/3、tool-definition/3 |
| T-4 | 首部不算内容；任一家族不得以适配初始化、usage、空首帧制造 open；内容可见门另外由 runtime S-55 验 |
| T-5 / T-5b | 明确凭据、零环境回退、全部失败与诊断的完整/片段哨兵；新增注册配置错误、未知版本与 sink 故障支 |
| T-6 | user/session_id/x-session-id/prompt_cache_key 全禁；逐家族启缓存后再抓线核对 |
| T-7 | 模态不承载就规划拒绝；声明 text/image 不自动支持音频/视频；每个模型定义实际输入范围都要验 |
| T-8 | 上游 id/model/provider 原样，不以请求填缺席。仍保留 provider 中途变化诊断；若实际执行方与固定路由不符，保留原值并交协议来源，业务分类归 runtime S-18 |
| T-9 | 302 不跟随，重定向目标零请求；依旧是真实 Node probe，家族不可自建绕行发送器 |
| T-10a | 实际 wire、planned、改值/丢项一致，规划后修改源输入/配置不改变发送；新增完整 binding 原值、跨字段相等与旧版本引用 |
| T-10b | 原参数表逐行继续；缺席 reasoning 不补值，extra 无权覆盖统一项。模型仅允许统一词表内的支持值，不偷塞 xhigh；原 max 未核实处理不可静默改变 |
| T-11 | 工具名字/调用头逐码点原样，无逆转写；tool-definition/3 的生产者输入必须来自真实公共入口 |
| T-12 | 真实 stream-assembly/3 接收全部合法增量；length 不封口，stop/tool_calls 对应封口；增加 8 家录制样本和生产解析器实跑 |
| T-13 | 块标识、visibility、callId 的本流性质不变；会话内唯一仍只列其明确前提，不由有限测试证明全局唯一 |
| T-14 | 任意切分、多字节、reasoning opaque 与工具参数的拼接性质；每一家窄适配不能变动原文 |
| T-15 | usage 最终一次 account、缺席不造事件、重复 usage 取值与诊断规则继续；缓存两项各自未知，不由模式补零 |
| T-16 | opaque 严格无损、同路由回放、换路由不误复用、超 2^53 值保真；各家受支持的推理回放须过真实 G 门 |
| T-17 | 旧消息不丢/不补工具结果/拒 ToolInternalMessage 的判据保持。提醒不再由 routeWireHints 判：OpenAI developer，其余适用专用类型否则 user；所有 37 项配对验证，system 为负控；Compaction 单列 |
| T-18 | 原高精度金额、非法/缺席未知、缓存计数一致性保留；另加已知零/未知/正读、只报读不报写，response/4 不得出现第二份缓存镜像 |
| T-19 | 原 DNS/连接/带内/断流/协议/非内容首帧/queued 分支全部保留。首内容时限中止 queued 由 runtime 归 unrecognized；取消与触达未知不猜值；取消后须观察 socket 和读循环停止 |
| T-20 | 原配置非法启动失败、撤除停止新 send、在途跑完/明确取消后再销毁池保持；新增实际 Cordis 模型贡献热更新与直接消费者、宿主替换、多次 acquire 空闲间隔，不靠 disposer 次序 |
| SC-1 | 工具参数路径无中间 JSON 解析；家族、窄适配也在规则范围内 |
| SC-2 | 包内无 process.env 凭据或 TTL 回退；配置必须来自显式 binding/装配 |
| SC-3 | 唯一网络出口是 send；plan/factory/注册均不开连接，模型插件没有第二出口 |
| G：D-019 全十五项及原新增项 | 原表所有路由、身份、费用/generation 对账、私有 replay、重定向、错误、首内容前后断流和 abort、无隐藏重试，以及 max_tokens/max_completion_tokens、store、reasoning、strict、transforms、require_parameters、状态码含义、delta 闭集、cost 单位/BYOK、token 组成、CallId 词法均保留 |
| G：新增逐模型适配 | 对 37 模型分别用生产函数与服务路径取角色、参数、工具回传、推理、缓存/精确费用证据；每个指定路由独立认证，禁止一次族代表通过后把整族判通过 |

### 增量证据义务与覆盖缺口

| 编号与来源条款 | 必须失败的反例 / 所需验收 | owner 与受阻消费者 |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| PAT-V3-1：profile S-29～S-31；runtime S-53/S-57 | 工厂/manifest 恰覆盖确认的 37 模型；精确 implementation/definition/configuration 可解释；未知版本、modelId 不等 routeName、缺必需 TTL、非法配置均零 HTTP；同 revision 不同档案 values 不混用 | 本节点与目录/core owner；阻断所有新 binding 生产消费 |
| PAT-V3-2：runtime S-53/S-64 | 真实 Cordis：register→adopt→retire 各失败窗口；acquire/retire 两种次序；旧 runtime/direct 不换版本；重复 release；空闲后再次 acquire；正常排空、超时 remaining_active、强制取消后实际停止；旧清理不得删新版 | 本节点；阻断模型贡献热替换接受 |
| PAT-V3-3：runtime S-54④/S-57④；messages S-49；response S-11/S-36 | 真实计划器→实际 send 抓线→耐久已出门→响应 binding 原值逐值对照；旧输入外部变异、配置更新、plan 与 send 之间发布版本都不能改变旧计划；生产入口无二次规划 | 本节点 + runtime/sessionLog 提供者 + 验收装配；阻断“锚点记录就是实际请求”的声称 |
| PAT-V3-4：response S-37/S-38；call-accounts S-4～S-8 | 每一指定模型路由冷暖运行，read > 0 才命中；automatic 与 explicit 分验；TTL 配置值原样发出，另验 expiry 才可声称保留期；正写不能代读命中；实际 provider 不由请求值补，名称对应未知不猜别名；精确金额与 generation 账一致 | 本节点 + 主线实测；阻断各模型 official 认证 |
| PAT-V3-5：runtime S-20/S-63 | 所有生命周期与传输失败支的关联齐全；默认无正文/参数/推理/凭据及片段；慢/抛错/满 sink 有界、独立降级计数可见；相同模型输入正常 outcome 不因 sink 故障改变 | 本节点采集、独立验收装配 sink/权限/查询；阻断全链路观测覆盖声称 |
| PAT-V3-6：runtime S-53⑤⑥/S-56/S-58/S-59/S-61 | 真实 HTTPS 延迟/不主动 EOF 流；宿主替换、transport 撤除、贡献强制撤除与直接调用交错；abort 后等 socket close/读取终止及回调收口才释放；仅 signal.aborted 或解除 effect 不能通过 | 本节点 + runtime + kernel-basis + 验收装配；阻断停止已完成及资源不泄漏声称 |
| PAT-V3-7：runtime S-38、D-019 | 原 T/SC/G 全门生产实现通过，pi 采用片段的许可与适用来源齐；费用/身份丢失即保留反例，不用新 adapter 名称绕过采用门 | 本节点与主线；阻断产品真实发送采用 |
| PAT-V3-8：runtime S-64；profile S-30；response S-20 | 精确 catalog/采用及 core 新版本就绪；发布管理方、配置政策、诊断 sink、时钟、凭据注入与入口身份核实由装配点名；原始响应附件留存依旧需附件 owner | 主线/spec/core 与实际验收装配 owner；本节点单独不能完成整条纵线 |

配置修订历史判重只由目录负责；本节点测试只核其收到的完整 values 原样解释，不伪造跨目录/注册表事务。有限版本模型中的“一名消费者最多取得一次”由模型构造吸收，不能绑定成可重复 acquire 保证；该缺口必须由生产并发测试覆盖。

### 有限模型与机制的适用前提

Adaptation 模型只取两个版本、runtime/direct 两名消费者及两个档案范围；Stop/Release/Dispose 使用弱公平。它覆盖分步采用失败、固定 binding、停准入及不在持 lease 时销毁的有限交错；不证明真实网络、持久提交、重启、超时或任意消费者数。

AcquireRetired、DisposeActive、Rebind 三项负控必须分别击穿 NoAcquireRetired、NoDisposeWithLease、BindingPinned。可失败的模型断言不证明生产代码实现了守卫。连续 acquire A→release A→acquire B→dispose 必须保留 B 的在途责任；retiring 后的等待不能复用先前已经完成的等待。仅模拟停止的 Cordis 原型不证明 HTTP、生产 registry、超时或耐久事实。

T-13 增补的 IS-2 核对精确编码、无界整数、等值写法与特殊字符串的确定性。非法 target、CallId 判重／恢复与原比较门不因该采用闭合。

## v12 响应校准增量

对象为 [v12 revision 2](v12-usage-calibration-design.md)，MR9/RT10；下列是义务定义，不授予模型认证。revision 2 的 B1 缓存元数据边界与 UCT-V12 性能行为门须分别验证。既有形式任务与源码测试不改版本标签。

| 编号／条款 | 必须会失败的场景与负控 | owner／消费者 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
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
| ---------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UCT-G1 精确采用与 full/φ/δ/readFacts 公共面接续 | MR9 S-41～45，RT10 S-59/S-77～83；所有新消费者 | 主线独立评审/采用后，runtime/core/transport 同批公开面迁移，不留旧格式旁路 |
| UCT-G2 逐模型事实未闭合 | MR9 S-42/S-43，RT10 S-78/S-82；各不具依据的型号发送/增量 | 厂商 owner 完成 UCT-V11；无依据 estimated 不允许，unknown 不填零；其他已具依据型号不受牵连 |
| UCT-G3 真实异常/热换/日志组合未验 | RT10 S-53/S-59/S-81；真实 service 与装配 | 实施与 verification owner 完成 UCT-V4/V8/V9，形式模型不替代实际资源停止 |
| UCT-G4 新路径百万 token 成本未知 | RT10 S-79；性能交付声明 | verification owner 执行 UCT-V10 和 tokenizer 调用计数负控；不引入额外持久索引补故事 |
| UCT-G5 estimated 不能给 compaction 硬 fit 保证 | MR9 G-17、RT10 G-36；未来压缩硬保证消费者 | 归相关产品/规格 owner 处理；本节点如实保留估算语义，不实现压缩、不把该缺口扩成当前全量交付前提 |
| UCT-G6 Anthropic 稳定增量尚待复评/实施/验证 | MR9 S-41，RT10 S-77～79；四型号常规 append 的增量供给 | 采用 revision 2 精确窄投影、发布新适配修订并通过 UCT-V12；owner 为 transport 与逐模型验收。此门不阻 MR9/RT10 规范本身或纯 core 实现，不能用每轮 full 假称闭合 |

## 注册表诊断源读面增量

采用与实际覆盖范围沿 [v11](v11-registry-diagnostics-design.md)及节点 README。必需场景为实际registry+collector/Cordis贡献生命周期、未停旧lease、force请求与真实停止区分、cleanup失败、无端口/合法拒收/throw/非法值、重复pending Promise停投及拒绝吸收、溢出unknown和最终inspect快照；源/network/collector同值不能相加当多个失败。不以这些场景替代完整D6或逐模型认证。

## ZAI 五叶可见推理历史义务

对象为 [ZAI 可见推理计量 revision 1](zai-visible-reasoning-estimate-design.md)（缺口 GG-12），消费 RT12/MR11 的 full-only 规则，精确采用范围沿对应正文。五叶的精确坐标与 ZV0～ZV5 验证义务如下；本机受控验证不关闭 ZV4 真实多轮认证。

GLM-5.2、Prime、FlashX 坐标（`pi-ai:zai@mp4-18` 首次使用；φ/δ 仍为 `unsupported-marginal/1`，transform `openrouter-wire/2`）：

| 叶 | definition | implementation | algorithm | tokenizer（显式钉在未变依据） |
| --------------------- | ---------- | -------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| `z-ai/glm-5.2` | `3` | `mp4-18` | `glm-5.2-public-template-2` | `tokenizer-basis/glm-5.2-public-template-1` |
| `z-ai/glm-5.3-prime` | `4` | `mp4-18` | `prime-public-glm53-declared-effort-route-fit-3` | `tokenizer-basis/prime-public-glm53-declared-effort-route-fit-2` |
| `z-ai/glm-5.3-flashx` | `3` | `mp4-18` | `flashx-public-glm53-route-fit-2` | `tokenizer-basis/flashx-public-glm53-route-fit-1` |

GLM-5.3 与 Flash 的单轮原始观察只支持可见推理 details 同形：恰四键 reasoning.text、无 id/signature/显式 signature:null、并行 reasoning 逐帧同文、推理为一段连续。它不证明任何一叶多轮回放的上游接受或计量口径。两叶的坐标：

| 叶 | definition | implementation | algorithm | tokenizer（显式钉在未变依据） |
| -------------------- | ---------- | -------------- | --------------------------------- | ------------------------------------------------- |
| `z-ai/glm-5.3` | `3` | `mp4-18` | `glm-5.3-public-template-2` | `tokenizer-basis/glm-5.3-public-template-1` |
| `z-ai/glm-5.3-flash` | `3` | `mp4-18` | `glm-5.3-flash-public-template-2` | `tokenizer-basis/glm-5.3-flash-public-template-1` |

可见推理分流按精确 implementation 修订，不能借一个开关补默认证据。GLM-5.3 的本机回放有借用同路由模板族 Flash 片段的有限前提；此夹具不是 GLM-5.3 独有归档或真实多轮认证。五叶声明、tokenizerRevision、完整值与私有 replay 需分别验证，旧坐标不得继续构造。

| 编号／条款 | 正向、反例与必须失败的负控 | 门类 | owner／受阻消费者 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------ |
| ZV0：RT12 S-74③ | GLM-5.3（缺省或 `max`）、Flash（缺省）各一次当前绑定单轮真实流，题面能激发可见推理、输出上限足以 `stop`；逐帧核 details 恰四键、无显式 `signature: null`、并行 `reasoning` 同文、推理恰一段连续。形状不同则修订对应的逐叶承诺，仍无推理则该叶维持现拒绝。 | 释放前置，付费 | root 唯一账本；两叶释放 |
| ZV1：RT12 S-74、S-79；MR11 S-43 | 已释放叶 × 当前 effort 发送域 × 有/无 tools × {public，Cordis transport service} 三轮：第 2、3 轮 full/`estimated`，每轮恰一次 HTTP 且字节等于计划，wire 保留 details，资源实停；Prime 带显式 5m `last_message`。`zai-three-round-invoke.spec.ts` 等既有拒绝用例按对应页 ZV1 改期望，混合 opaque／明文与异路由 opaque 仍规划拒绝。 | 本机 | transport 实施者；已释放叶真实多轮 |
| ZV2：RT12 S-74③、S-78 | 反例 1–8、10–13；模板预言扩到 GLM-5.3、Flash、GLM-5.2 三套固定模板（`clear_thinking=false`，推理 assistant 在末条 user 前后各一），GLM-5.2 另存缺省口径黄金值；夹具由两批原件片段经真实 reader 合成。变异负控各自单独施加须失败：去掉并行 `reasoning` 同文检查、把显式 `signature: null` 当缺席、放行非 0 index、GLM-5.2 渲染器漏渲槽位、Prime／FlashX 对历史多减一次常数。 | 本机 | transport 实施者；同上 |
| ZV3：RT12 S-77、S-79⑥；H13 | 直接调用三个 factory 为五叶返回的 full／φ／δ：非法显式 history 由共同包装拒绝，body-only 合法 full 为 `estimated` 且数值与接线前相同，包装无递归；不以规划器或独立包装函数的测试代证。 | 本机 | transport 实施者；直接调用公开函数的消费者 |
| ZV4：RT12 S-74③、S-78 | 已释放叶有／无 tools 各至少一组当前绑定三轮真实流，第 2 轮起回放 details，记录上游接受、`prompt_tokens` 残差、cache 与 cost、逐帧形状。**必做**同路由对照：同一第 2 轮历史以 (A) details、(B) `reasoning` 字符串、(C) 无推理发送；A＝B＞C 闭合该叶 ZG1，A＝B＝C 记为路由清除、后继改口径，A≠B 由后继撤回该叶 details 映射。残差不引入修正常数 | 认证门，付费 | root 唯一账本；五叶 D7 逐模型真实多轮 |
| ZV5 | 已释放叶 definition／implementation／algorithm 唯一修订、显式 tokenizerRevision、`evidence` 字串、包 README／README_ZH 双语段与制品消费；删除 `zai-candidate.ts` 并迁移其消费者；未知与失败的执行原件留本工作树 tmp。 | 交付 | 实施者＋主线；包文档读者 |

覆盖缺口与受阻消费者见对应页 ZG1～ZG9，本节不复述。ZV0、ZV4 的付费观测不因本节登记而获授权。本机有限覆盖不关闭 ZG1 上游转换与路由清除口径、ZG3 真实回放、ZG5 托管模板误差或任何一叶的 D7 真实多轮认证；演示装配 `examples/model-invocation-minimal-demo/tests/zai-prime-effort-service.spec.ts` 按导出定义取修订，其局部运行不代表正式模型认证。

## H13 多个历史输出组

对象为 [v13 revision 1](v13-output-history-design.md)，消费 MR9/RT10 与 runtime v19 唯一来源账本。本节定义方法与判据，不以文档登记证明源码、模型或上游已兑现。

| 编号／条款 | 正向、反例与必须失败的负控 | owner／受阻消费者 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
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
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| H13-G1 | RT10 S-79：本节点与 runtime v19 的采用范围沿正文，未获准部分不能驱动公共迁移 | 主线联合 architecture/spec 表达复核和精确采用；起草者不接受 |
| H13-G2 | MR9 S-43、RT10 S-78～S-82：H13-V1～V9 未运行，不能以旧单 observation 的通过结果代证多组 full/δ | runtime/transport/verification 完成实际正反例、独立制品及双语 README |
| H13-G3 | MR9 S-43、RT10 S-78：O 到当前输入没有无条件恒等；仍缺依据的每个模型不能借接口齐全称完成 | 模型 owner 明确固定 route/binding/mode、转换/边界、精度及真实留出；没有依据保留 unavailable |
| H13-G4 | RT10 S-77/S-78/S-81：现 UsageCalibration.tla 有锚/失效/原批性质，但未表达多组 target 分配及 aggregate 转换守卫；NoDoubleOutput 不证明实际覆盖互斥 | 主线明确新组级形式证明范围；若要求此保证，spec owner 发布后继形式工件与负控，不改冻结版本。H13-V2/V3/V4 是必要实现证据，不能冒称已有 TLA 已证 |

H13-G4 不改变 MR9/RT10 的原接受状态，不将旧形式任务重绑给未建模性质；组级来源映射以本节真实反例和后继正式证据分别兑现。新增 store/持久事务/服务均为零，仍须验证原 batch 发布与旧 lease 交错，不靠进程锁或时间谓词补来源门。

## Google 推理历史 revision 4 的 GS 义务

对象：[Google 有限适用页 revision 4](google-reasoning-history-output-group-candidate.md#验证义务与逐叶采用矩阵)。逐条验收与不能冒用的范围以该页为准。本机机制与真实上游接受、计入量和 id 失配后果分别验证。V4 工厂接收显式 definition/implementation release；坐标钉定前不能把测试标签当官方绑定，projection 与 replay 版本亦须分别核表。

| 义务 | 覆盖什么 | owner |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| GS-V1 | 两叶 V3/V4 工厂坐标导出核表、旧 factory 删除、适用依据与实际绑定相符。具体判据：V3（当前构建）与 V4（未钉定 release）逐字段导出核表，含规划写入 basis 的 projection `/3`；tokenizer 显式等于 V3、replay 不升；适用依据须明确「counted once／no error bound」；退役行（1／`mp4-2`、2／`mp4-3`、3／`mp4-17`）与其任一半、空值、多余成员的 release，以及修订、实现名、能力、路由、模型 ID 不符的声明均无 factory。真实坐标导出核表与「旧 factory 删除」须由钉定发布步骤验收（K7，GS-V9 A 之后），届时 V4 成为唯一官方 factory、删除 V3 factory 并以真实坐标替换测试标签 | 实施者 |
| GS-V2 | E（单条、多条）为 `wholeGroup`；T-only 为 `uninterpretable`；TS、S、混排、E 缺 id、`[REDACTED]`、多余成员等逐一负例；夹具经真实 reader。具体判据：流按 实际观察帧序（帧 0 恰一条 E、id 等于同流工具调用 id、等长合成 base64）与 已有片段序经真实 reader 合成；单条 E、并行两条 E、分两片的完整 E 为 `wholeGroup` 且下一轮 full/`estimated`；E 缺 id、id 为 null／空串／数字、data 为 `[REDACTED]`／空串／数字、缺 index、index 为字符串、带 signature／text／未知成员、异 format、混合 format、E＋T、E＋TS、summary、T-only（K2 a）、TS、S 均 `uninterpretable`，规划与 invoke 都 `input_size_unavailable`、零新增 HTTP；非 assistant、同带 `reasoning`、空或非数组 details 直调分类为 `uninterpretable` | 实施者 |
| GS-V3 | full＝G4(剩余)＋ΣO，O 与 reasoning 不双加，密文与 id 不进 tokenizer，变异反控。具体判据：第 2 轮 full 等于现 V3 counter 对剩余 body 的结果加原 O、不加 reasoning、组内工具调用不另计，余量只在门上一次；第 3 轮两个 E 组各计一次；tokenizer spy 不得有任何密文、E id 或 details 成员名；无完整组时 V4 与 V3 逐值相等（F1／F2／H1／H2 与可见推理历史）。变异反控 | 实施者 |
| GS-V4 | 部分选择、篡改、伪造、截断回复、独立 `measureFull` 失败不产计量。具体判据：部分选择与未认领 details 单元 `input_size_unavailable`；乱序、跨消息、消息缺块、重复认领、未同步摘要的篡改为 malformed；自洽伪造不报 malformed（合法形状照常计 O，计量不背书密文真伪；域外形状只走 unavailable）；`length` 截断不带 opaque、分类为 `visible`；直调 factory 返回的 `measureFull`：合法输入等于规划值，缺 span、部分 span、越界、无 history、块乱序、来源矛盾、序列化不一致、空 messages、非对象输入均 `{kind:'unavailable'}` | 实施者 |
| GS-V5 | basis 关系与身份对（同缺放行、单字段与一边缺 unavailable、冲突 malformed）。具体判据：原 V3 组在 V4 下 full 且值同原 V4；2／`mp4-3`、V3 配 V4 算法、未知算法、未知 implementation、V3 在 projection `/2` 下均 unavailable；当前 effort、max_tokens 改变仍 full 且值不变；origin 与 basis 同为 `google-ai-studio` 以外、origin effort 越界、`parameters.extra` 非空均 unavailable；与自身 basis 矛盾的 origin provider 为 malformed；当前 basis 为 V3 时 unavailable；跨模型 opaque 在投影处 `unavailable`（R-K）；身份整对或同缺放行，slug、`Google`、大小写与首尾空白、带日期、另一叶、单字段、origin／provenance 一边缺均 unavailable，同名值冲突 malformed | 实施者 |
| GS-V6 | 本机 TLS 工具路径三轮，public 与 Cordis 两入口；E 逐字节回放，工具调用 id 照实断言为投影生成值；TS 用例保留为负控。具体判据：两叶 × 三档 effort × {public transport，Cordis lease 服务}，第 1 轮按 实际观察帧序、第 2 轮再一个 E 工具回复、第 3 轮文本；第 2、3 轮 full/`estimated` 且数值等于剩余 counter＋先前各组 O，发送字节等于计划，每个 E 逐字节恰回放一次，basis 的 replay 为 `unsupported-marginal/1`，φ/δ 从未被询问；展示名 `Google AI Studio`。**GG-14 观察断言**（非语义保证，修复后应反转）：回放的 `tool_calls[].id` 与 `tool_call_id` 是 reader 生成的 CallId，不等于 E 的 id。负控：slug provider（φ/δ 被询问且 unavailable）、T-only、TS、`[REDACTED]` E 的第 2 轮均 `input_size_unavailable`、零新增 HTTP；原 V3 TS 用例保留 | 实施者 |

必须失败的变异包括：addOutput 漏 O、E 单元当 visible、T-only 当 wholeGroup、删身份守卫、放行 [REDACTED]。正反例须分别击穿相应算法与域边界，不能以编译失败或超时算命中。包内构建/类型/行为检查与 GS-V7/V9/V10 的真实观测及坐标钉定分开报告。

| GS-V7 | 真实认证：两叶 public 与 service 工具路径三轮，逐帧记录第 2 轮 E 与第 3 轮文本回复形状 |
| GS-V8 | 旧证据只复用于可见 counter，在 V4 构建上重跑 |
| GS-V9 | P2 同路由对照（必做）：A 带 E、C 不带推理、条件性 D 只改工具调用 id；读 Δ_E、上游接受与 id 失配后果；A 的接受读数建议先于坐标钉定 |
| GS-V10 | K2 对照：非工具路径当前绑定首轮 raw；若为 T-only，做 details／同文 `reasoning` 串／不带推理三变体 |

### Google revision 4 覆盖缺口

| 缺口 | 精确限制 | 受阻消费者 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 回放从未出网（GG-4） | 两叶第 2 轮都在计划期拒绝；E 组能否被上游原样接受、计入多少输入均无读数 | 坐标钉定；GS-V7 |
| E 的 id 失配（GG-14） | E 的 id 等于首轮工具调用的上游 id，投影写回的工具调用 id 由 reader 生成，回放时两者不等；上游后果未知，本机用例只能照实断言、不能证明无害 | GS-V7 通过；工具续接的实际语义；owner 为 transport reader／投影 |
| 非工具路径形状（GG-2、GG-13） | 现有有限适用范围没有非工具完整回复的 raw 推理详情依据；唯一样本是 T-only 领域结果 | 文本回复之后的下一轮；K2 映射 |
| 签名语义（GG-3） | Google thought signature 与 E 的关系、是否绑定前缀或工具调用 id 无来源核对 | K1 置信度；`requiresSignedPrefix` 取 false 的依据 |

## MV5：Moonshot 空串文本段窄修复

采用范围见 [v16 revision 1](v16-moonshot-empty-text-design.md)。仅当前两条官方完整绑定改规划字节；投影 /3、wire /2 与计量算法保持。

`tests/moonshot-empty-text.spec.ts` 覆盖图前／后及多处空串、纯文本混合、全空串／空数组／空白、system／reminder／compaction、原输入、完整绑定反控、非目标官方叶旧字节、真实本地 invoke/TLS 与最终 meter/body 一致。跨修订夹具是实际旧规划器的四条 requestInput；附加 observation／usage 明确是 synthetic，分别要求 prefix_changed 与 basis_changed，不冒充上游历史。

CB3 要求合法 transcript 至少一个字符，无法通过正式输入构造 transcript 空串；实际反控保留非空 transcript 的投影，同时去除相邻空文本。有限探针不证明纯文本或全部历史位置的上游接受。

### MV5 适用范围与未覆盖项

有限采用只覆盖当前两条官方完整绑定的空串文本段窄修复。单次上游确认仅覆盖当前 Kimi K3；全部历史位置/全空串、另一叶及 37 模型认证不得由它推定。既有 Pro 不适用图像例不进入本修复的图像覆盖。元模型登记不等于实际 TLC/Alloy 执行。

受影响包、公开制品及真实本地 TLS 的验证义务继续成立。修正前后的原失败夹具/断言与执行日志放任务 tmp；既有生产观测不能替代修后发送认证。
