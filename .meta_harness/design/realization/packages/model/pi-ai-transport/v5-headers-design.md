# pi-ai-transport：同次响应头交接增补

2026-09-27，rev 2，**candidate，未采用、未实现、未验证**。这是 `packages/model/pi-ai-transport`（provider）的窄增补，按现有节点四件套接续；不新建节点。本稿已读机制，不声称双盲。rev 2 处置独立架构评审 PH-AR1：rev 1 仅移除头字段，仍可由公开 `RawResponse.stream.headers` 取得未脱敏值；本次补真正的运行时句柄封装，不将修稿当成复评通过。下文当前源码符号只用于定位；拟修改的成员、签名和内部构件均是**候选**，不是已交付 API。

## 输入、状态与取代范围

| 精确输入 | 本节点消费与状态 |
| --- | --- |
| baseline `omne-harness-lite-design-2026-09-15`；[RT5](../../../../spec/capabilities/model-request-runtime/v5/contract.md) S-18/S-20/S-38/S-53～S-59/S-63/S-64 | catalog `accepted`，由 D-090 接受。S-58 是本节点的头事实出口，S-54/S-17 为接收与完整响应写方义务 |
| 同 baseline；[MR5](../../../../spec/data/model-response/v5/contract.md) S-20/S-21/S-22/S-26 | catalog `accepted`，同一 D-090；头值含义及秘密边界唯一来源。本节点不构造完整 ModelResponse |
| [原设计](design.md)、[v3-design](v3-design.md)、[v4-definition-design](v4-definition-design.md) | 分别沿 D-062、D-076、D-082 的接受范围；历史 candidate 标签不取代这些决定 |
| 头交接采用理由、[core v5 投影](../../core/model-response/v5-design.md) | D-090 采用表示 A、交接 A 和 core 显式 `./v5`／`./schema/v5`；D-090 明确尚未采用本 transport 增补 |
| 产品与其余数据输入 | 继承 RT5 的 PF-013 rev13、PF-012 rev15、PF-009 rev8、PF-004 rev12、PF-001 rev19、PF-015 rev11 与既有提供者精确依赖；不据产品新 rev 自动变更本节点 |

语义接受已有；**本页的提供者选择未采用**。现有源码包已建，观察基线为 `965604ea96f036b0cc8a0b38109c941bd1eb3553`，公共 implementation revision7；本稿不预占下一修订号。新增绑定 **0 条**；实际验证只有既有修订各自的有限证据，本增补尚无源码、TLS 或制品运行。可实施输入还缺 PH-G1 的公共类型及 PH-G2 的完整脱敏接线，见 [覆盖缺口](verification.md#v5-响应头覆盖缺口)。

本增补一旦单独采用，只在 RT5 新采用链上替代原设计“2xx 首部留给 `StreamEnd.headers`”及“`StreamEnd` ＋ headers”两处、非 2xx 从 `failed.headers` 交头的路径。**RT5 S-58 是唯一公共头事实权威，read 不补第二条路径。**旧设计原字节、旧制品及其验证范围保留，不把旧测试重新标成 v5 通过。

## 实现路径、公开面与唯一事实

沿既有 pi-ai 0.86.1 定向 fork（提交 `3390bd93630965a12a0a1a5c36ce890ec22f7e1d`）及 Node HTTPS，来源、许可、上游追踪仍归 [fork 边界](design.md#fork-边界)。不增加 SDK、原厂出口、隐式重试或新的第三方依赖。公共 `planRequest`／`sendRequest`／`readStream`／`createPiAiTransport` 留在包根，插件仍在 `./plugin`。

头值的唯一域复用 D-090 采用的 `@omne-harness-lite/model-response/v5` 公共 `RawHeaders` 类型，不能从仍为 MR4 的根导入后用断言放宽。`TransportAdapter`／`SendResult` 类型继续由 model-request-runtime 的公开入口拥有；其 owner 须在自己的 RT5 投影中明确 MR5 类型导入及公开版本采用，本节点仅作类型依赖，不运行时 import runtime 或复制另一套头定义。core 类型可经 runtime 的明确公开类型复用，最终声明图必须指回 MR5 公共入口；具体接线是 PH-G1，不能先假称已有。

| 当前源码／公开位置 | 窄增量候选及消费者影响 |
| --- | --- |
| `src/http.ts` 的 `sendRequest`／response 回调；根导出的 `RawResponse` | 在 response 回调中，任何异步错误体读取之前，取得一次 `IncomingMessage.headers` 的 map，按已明确 S-20 政策处理、建立自有深度不可变值；同次 `SendResult.rawHeaders` 交出。`RawResponse` 当前确实由 `src/index.ts` type-export，并非私有 API；新采用实现将它收窄为下节的真实句柄，运行时对象与声明都移除 `stream`／`headers`／`statusCode`／`redact`，不把原对象按窄类型原样返回 |
| runtime 的 `src/types.ts`：`SendResult<R>`、`TransportFailure` | runtime owner 给 response／failed／aborted 的同次公共结果加可选 `rawHeaders`；rejected 不能带它。新采用实现移除 `TransportFailure.headers`，只保留来源／阶段／状态／错误事实。本节点不能代改类型拥有者；不得以 `R.headers` 或 `failed.headers` fallback 猜版本 |
| `src/http.ts` 的 `settle`、request error、`readError` | 同一 send 闭包拥有“尚无已保留头值”或“已保留 H”两种技术状态；所有已执行的结算分支从同一闭包附带 H。状态不是新领域对象、事件或持久记录，不与正文成功与否绑定 |
| `src/stream.ts` 的 `readStream` | 经包内私有响应表验证句柄身份、同次 plan 并恰一次取得读权，再取私有 stream／状态／redactor；沿现有到达增量和最终 serving/account/error 路径。不读取、重造或返回头，不产出 header 增量，不把 H 塞进 `StreamEnd` 或 `TransportFailure` |
| `src/transport.ts`、`src/registry.ts`、`src/plugin.ts` | 静态工厂及每个固定 lease 的 send 原样交同次公共结果，不复制／过滤 H；原 plan 所有权检查与关闭准入保持。完整脱敏政策通过可信显式装配接入，不能只升级 type 却漏动态路径 |
| `src/index.ts`、`package.json`、声明制品、README.md／README_ZH.md | 根仍导出四个构件，`RawResponse` 的新形状随明确实现修订发布；所有依赖旧两个头字段的调用者改读公共结果。双语例子显示 send 成功／失败／取消后读取可选 H、真实停止责任，实际编译运行后才可称示例通过 |

当前 `tests/https.spec.ts` 读取 `failed.headers`，`tests/boundaries.spec.ts` 读取 `response.headers`，`tests/parameters.spec.ts` 构造旧 RawResponse；实施时保留其原形／脱敏／资源断言并迁移观测口，不删除断言来通过编译。`src/stream.ts` 对 `response.stream/statusCode/redact` 的所有访问迁到私有记录；`registry.ts` 及 conformance／boundaries 中的 `response.stopped` 保持公开停止等待，类型消费者仍使用新 RawResponse 句柄。伪造旧对象、复制句柄或重新套一层方法不获得读权。主线盘点 runtime、脚本化传输、独立包消费者及实际宿主；全文检索只是辅助。新旧制品不可靠探测字段猜采用，旧固定版本／lease 的排空仍沿 v4 迁移责任，不让新 implementation 接管旧请求。

### 公开 R 的运行时边界与私有响应所有权

本增补的候选 `RawResponse` 保留公开名字，但公开成员恰为 `stop: () => void` 与 `stopped: Promise<void>`。它是 send 为本次成功响应新建、冻结、无原型的普通句柄对象；无 stream、headers、rawHeaders、request、socket、statusCode、redact、迭代器或属性 getter，也不以 Symbol／不可枚举属性／自定义原型藏这些对象。**安全边界靠返回对象的实际可达图和私有状态，不靠 TS 的 readonly、Omit、断言或 private 修饰。**成功响应的安全 H 只在 send 结果的同级 rawHeaders 中。

本包私有 WeakMap 以真实句柄为 key，持有原 `IncomingMessage`、实际 HTTP 状态、同次 plan 身份、读取权占用状态、停止控制及已绑定 redactor。没有公开返回该记录的函数或可遍历强 Map；`claimResponse`／内部读取辅助即使为模块间复用而导出，也不进入包根、`./plugin` 或任何新增 package exports。包内 `readStream` 按当前同步占用语义核对 key 与 plan，一次成功占用后第二个竞争 reader 仍 `invalidInput`，不重发；调用者拿到的句柄本身没有读原始字节或挂原始 response 事件监听的能力。

send/read 的资源 owner 保持原分工：send 创建网络资源并把记录登记在返回句柄对应的私有表中，read 取得独占读取权后消费内部 stream；取消监听、错误体任务、实际请求停止、read finally 与 lease track 仍各自收束。WeakMap 只是隐藏可变运输对象的表示机制，不是生命周期机制；不得靠 GC 关闭连接、解除监听或完成 lease。句柄仍可达时可保留原单次记录以供正确判重／延迟 reader；实际资源按原 close/stop 清理，不增加全局强引用、独立持久保留或后台队列。2xx 正文已到而 reader 尚未启动时，不能因 request 的停止通知先到就删掉仍需消费的记录或清空已保留 H。

`stop()` 仅发出原本的停止请求，重复调用仍安全；它必须实际返回 `undefined`，不能使用会把 `req.destroy()` 的 `ClientRequest` 返回值泄露出去的表达式箭头。本次源码当前就是 `stop: () => req.destroy()`，即使类型写 `void`，JavaScript 调用者仍可取回 request，故也在 PH-AR1 的修复面内。闭包可持私有引用，但函数对象本身不得有指回它们的属性或可公开返回它们的方法。`stopped` 实际履约值必须为 `undefined`，拒绝信息若有也不能带原始运输对象或凭据；它保持原停止边界，不因新句柄就宣称所有读循环／track 回调／持久写方均已完成。

直接调用者不读正文时仍可 `stop()` 并等待 `stopped`，资源 owner 的 close 仍能收口在途请求；消费正文只能用本包公开 `readStream(handle, samePlan, signal, deps)` 或所属 transport 的 read。反射复制句柄、伪造相同两个成员、跨宿主／跨 plan／跨制品递交时，私有身份与现有 plan 所有权检查必须拒绝，不从对象形状猜合法性。既有静态 plan 与固定 lease 的校验、取消和排空责任不改变。

这里约束的是维护中的 JS 公共对象／方法／导出面，不承诺同进程任意代码、调试器或直接读内存的沙箱隔离；调用方原本拥有的 `NetworkResources.agent` 等显式资源也不是本次 R 偷渡的新能力。验收必须在正常 public import 的实际 JS 制品上观察句柄属性、描述符、Symbols、原型、方法返回和停止 Promise 值，不能只证明 TypeScript 无该字段或 JSON.stringify 看不见它。

### 采集、留存和交接的时点

1. 计划、凭据、signal、资源准入检查仍在出网前；错误和取消不制造 H。到达 Node response 回调才有已取得的响应头；socket 被分配、请求写完或收到了诊断均不证明取得头。
2. 以 `IncomingMessage.headers` **实际提供的 map** 为本次采集边界；不读取 Node `rawHeaders` 线序再自造另一种表示。Node `undefined` 表示未提供的项，不变成字符串 `"undefined"`。这种 Node API 语义须按 PH-V1 在采用运行时实际核对；公开 S-58 端口不能带 undefined 头值。
3. S-20 处理发生在公共结果可见前。成功留存后，独立复制对象及每个数组，保留字符串／数组形状、元素顺序、重复、空串、空数组、空 map；各层冻结且不与 Node 的可变容器别名共享。普通键不能因对象原型赋值、凭据键遮罩碰撞或特殊字符串而丢失，沿既有安全键构造／碰撞处理验证。除原凭据规则要求的替换与整头剥除外不改写；不引入头名归一化、trim、join、取首、排序、去重、序列化数组或拆逗号。
4. 2xx 在返回含不透明 R 的 send 结果时一起交 H，早于调用者开始 read。非 2xx 在读错误正文前先把 H 留在同次闭包，错误体成功、损坏、超界或取消收场都从该闭包交出；无需等一份完整错误正文才认为 H 存在。
5. 已交出的 H 不依赖 R 的寿命。runtime 在收到 send 后、进入 read／检查门／取消后续路径前，从**公共 rawHeaders** 接过值，保留到 S-54 原四种终局；不得等 reader 返回再找。该接收时点是 runtime owner 的实施责任。尚未取得或确实未留存时缺席，不补 `{}`；已保留的空 map 也不能被当作缺席。

MR5 允许真实留存失败后继续原收场，但不能用它掩盖“已经保留却主动丢掉”。不合规提供者给出非法头值属于端口违约，不通过强转／滤坏项／默认值伪装合规；本稿不增新的失败码、第五种 outcome 或非法输出恢复政策。运行异常必须仍可见，禁止笼统 catch 全部错误后当作没有头。具体可识别留存故障若需要额外 API，先向原 owner 报缺口。

## 契约责任到兑现点

| ID／契约责任 | 操作、服务或贡献 | 实现与采用版本 | 符合性依据或缺口 |
| --- | --- | --- | --- |
| PH-P1：RT5 S-58 ⑤／交接责任；MR5 S-20 | `sendRequest` 的同次 `SendResult.rawHeaders`（候选） | 当前 http response 回调＋同次闭包；MR5 公开类型；尚未实现 | PH-V1/V2/V3；PH-G1。失败与取消均不靠解开 R |
| PH-P2：RT5 S-20、S-58；MR5 S-21/S-22 | 传输出值前执行 S-20；runtime 继续承担函数及写前边界 | 同一显式凭据政策，无新增默认。当前代码只覆盖已用 secret 及片段；公开 R 改真实句柄，原始 response／request 留在私有 owner | PH-V4/V9；PH-G2 阻断完整 S-20 合规声称；PH-AR1 修稿仍待独立复评及真实运行 |
| PH-P3：RT5 S-54/S-59，S-16/S-55/S-63 | read 不给头；runtime 从 send 保留到 outcome | `stream.ts` 不加事件／观察者／诊断内容，runtime owner 改接收 | PH-V5/V6；PH-G3，transport 单包不能代验 invoke |
| PH-P4：RT5 S-18/S-38/S-58/S-59 | send 留来源、状态和取消，read 沿原分类事实 | http error／readError 协调同次结算，最多一次发送 | PH-V2/V3/V7；本节点不把 HTTP 成功码填成带内错误码 |
| PH-P5：RT5 S-53/S-56/S-64 | 既有 `modelTransport`、固定 lease、read／socket／回调收束 | Cordis 4.0.4；没有新 fiber／服务；现有资源拥有者保持 | PH-V7；退出或关闭不删已交 H，不以 H 证明停止 |
| PH-P6：RT5 S-17/S-33/S-36/S-68～S-73；MR5 S-20～S-22 | transport 只交 H，完整响应构造、原批优先和日志由原写方承担 | runtime／共同 codec／消息写方／session-log-jsonl 的明确 MR5 采用 | PH-J1/J2、PH-G4；非本节点存储保证，不登记为本节点 pass |

## 各收场分支与并发

表中 H 一律指**同次已按 S-20 处理并成功保留**的值；不是未脱敏采集容器。候选 `settle` 只决定一次公共结果，附带头事实不能改写已经成立的 outcome 或来源。

| 实际路径 | 头交接 | 结果与资源责任 |
| --- | --- | --- |
| 表示错误、已关准入、plan 未通过 | 无 H | 沿原 invalidInput／unavailable／规划拒绝；零 HTTP，不把它们变成已发出失败 |
| signal 在发送前成立、等待连接中取消 | 无 H | 保留原 aborted／queued 事实；invoke 的 cancelledBeforeSend 只用于其自身零次 send 分支，不由头字段重判 |
| DNS／TLS／connect 失败，未进入 response 回调 | 无 H | 已知本地／connect 阶段照实，不能捏造 HTTP 码；等本次网络停止收口 |
| 2xx，reader 尚未进入或从未进入 | send 已交 H | R 仍由持有者停止或读完；不消费正文也不能抹 H。send 返回不是 socket 已停 |
| 2xx 后 complete／truncated／带内错误／解析或断流失败 | send 的 H 不变 | read 只交原 serving／usage／错误事实；先后内容与失败成因仍由 runtime S-18 判，不用头触发首 token |
| 非 2xx，错误体正常读完、无合法 JSON 或超界 | 已采时保留 H | 沿 http_status 与真实 HTTP statusCode；错误体能保留多少按原界，头不随正文截断丢失；不补假的 upstreamError |
| 非 2xx，错误体读取中网络断裂／可识别读取失败 | 已采时保留 H | 已取得 HTTP 非 2xx 事实仍在；request error 回调不能抢成一个无头的 connect 失败。状态及来源保持 http_status，错误体未完整的事实不冒充完整上游原文；实际停止后收口 |
| 取得 H 后明确取消，包括非 2xx 错误体未读完 | 同次取消结果带 H | 原明确取消分支不改；不因无完整错误体退成发送前取消，不捏造 failure 或给 aborted 新增状态码字段。若失败已先定则保留原失败及真实状态；后到取消不得改写。诊断不携带 H |
| 头已交，门失败／门等待取消／消费者提前结束 reader | runtime 保留原 H | 门失败、blocks／firstTokenAt 与取消规则归 S-54/S-55；reader.return、response.stop、stopped 和 callback 各由原 owner 收束 |
| 终局已定后晚到 error／abort／close／dispose | 不覆盖已交值 | 不第二次 settle、不重发、不改归新版本；清理仍完成，外部请求和已发生费用不回滚 |

当前源码 `req.once('error')` 及 `readError` 都可能尝试结算：实施须让 response 已出现后的错误体路径拥有其收尾，request error 只唤醒／停止该路径，或以等价的同次事实归约统一决定。不能让“哪个 Promise 的 then 先排队”把已知 http_status 改成 connect。普通非 2xx 后合法终结与后到 cancel 的胜负仍按既有实际终局确定，不为本增补另选优先级；PH-V3 要分别控制先后。所报 HTTP 状态必须来自实际 response；当前 `res.statusCode ?? 0` 不能被当作可填写 failure 的真实码，若上游对象未给则按既有未知规则处理，不合成 0。

两条必须实际演练的交错：A 收头并保留 H → error-body 暂停 → cancel／request error → reader 结束 → closed，结果带 H；若在 req.error 先交无 H，测试必须失败。B send 已交 H → 获得 H 的调用者暂停 → read 解析失败或 R 被释放 → 调用者读 outcome，H 仍相等；若只在 StreamEnd 取头，这条必失败。再对照 cancel 先于 response 时 H 缺席、complete 先定后的晚 cancel 不改原结果。

## 脱敏、依赖与装配责任

RT5 S-20 的三项政策由 runtime／可信装配拥有：`credential_fragment_min_length`、`credential_header_names`、`credential_patterns`。transport 负责在**它自己的公共返回**之前执行同一政策；仅在持久写入前清洗太晚。runtime 的 S-54／S-17 秘密边界继续存在，但不能后补掩盖 send 已泄漏，也不能用不同规则把已安全保留 H 再规范化成另一形状。

当前 `TransportPolicy` 只有 `credentialFragmentMinLength`，`credentialRedactor` 只处理本次 secret／片段；runtime 的 `InvocationPolicy.redact` 只是字符串口。这些源码不是头名名单与形态政策已接通的证明。**本稿不裁定名单、匹配大小写、pattern 语法／引擎或生产值，也不发明默认 pass/drop/redact。**PH-G2 交回 runtime 政策实现与主线：先明确可复用的完整政策构件及其公共接线，再让本节点的静态／动态 send 消费它；测试显式输入的政策只证明该次。该缺口不阻止 H 的单一权威和错误分支设计，阻止完整秘密边界实现被签收。

基础配置缺失／非法继续使 factory 配置失败或 Cordis 插件启动失败，不发布半套服务；每次调用输入按原具名拒绝，零 HTTP。没有政策时不得先发送，再以“留存未成”为由省略原本可采的全部头来绕过配置门。政策寿命在一次 send 开始前绑定，不能在错误体读取中换成最新值；凭据来自同次显式输入，不读环境或再次取另一把。

| 依赖或装配事项 | owner 与缺席后的影响 |
| --- | --- |
| MR5 公开 RawHeaders，runtime 公共 S-58 类型和 S-54 接收 | core/model-response 与 model/model-request-runtime；各自明确采用、实际 build/pack 到场前 PH-G1 不闭合 |
| 完整 S-20 政策、真实凭据来源、时钟／取消／诊断输出 | [model-request-acceptance](../../../retired/model-request-acceptance/design.md) 承接技术验收装配；独立调用者承担同样显式输入，产品装配由其 owner 采用。应用设计已沿 D-076 接受但源码未建，不能以测试夹具冒充真实租户来源 |
| OpenRouter endpoint、固定版本贡献、配置 | 原 transport 插件固定 OpenRouter；本机 TLS 仅用于显式受控函数测试，不把任意 endpoint 配置交给产品插件；模型家族、完整窄定义和 TTL 不因 H 变化 |
| 完整响应及附件 IO、共同 codec、全部实际写方 | runtime／session-log-jsonl／调用方原 owner；`raw.body` 不归 transport 新增 IO，头不使旧历史解释自动升级 |

**对存储提供者的直接要求清单为空。**本节点不新建表、不持有 append 权，不宣称跨 owner 同一提交。RT5-H5 的 msg／rsp／账共同对象仍是日志 owner 控制的同一 `entries.jsonl` 完整批及其判重／tail 条件；该存储与全部写方迁移须在对应节点核实，transport 的闭包、Promise 或进程锁均不能替代。

## Cordis 与成对的装卸

采用 D-025 的 Cordis 4.0.4。稳定服务 `modelTransport`、贡献插件、lease 与网络 owner 的边界不变；H 是单次函数值，没有独立 plugin、fiber、service、effect 或事件。头采集不增加 inject 边，也不触发模型贡献换代。

| basis 或待核对主张 | 本增补的采用界限 |
| --- | --- |
| [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md) | 原服务被替换仍可能重跑必需消费者；H 不靠新 fiber 的当前状态保全。条目有 probe，不推导业务无中断 |
| [effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md) | 清理次序仍由原单个组合 disposer／引用协议控制，不拆一个“头清理”effect；错误不可靠 Cordis 自动上抛。条目有 probe |
| [plugin-throw-fails-fiber](../../../../basis/cordis/plugin-throw-fails-fiber.md) | 非法基础配置不发布；部分初始化资源由原 owner 收口。条目有 probe，不代证本包错误分支 |
| Node response/error/close 先后、取消后实际 socket／reader 停止 | **假设，须按 source-check 及 PH-V1/V3/V7 在采用 Node 版本取证**；本增补不从 Cordis 推导 HTTP 语义，不声称 req.close 单一信号覆盖所有回调 |

| 取得的资源／值 | owner、可见时点与部分失败 | 撤除、静止和仍然为真 |
| --- | --- | --- |
| policy 快照、Agent、连接准入和服务 | 原静态工厂／稳定传输 fiber；完整配置校验后发布。构造半途失败释放已取得资源，不发布可用对象 | 原 stopAdmission → 按已选退役政策取消／排空 → 实际工作收束 → 释放资源。关闭准入不等于取消，超时不得假成功 |
| 本次请求、response、错误体任务／reader／监听 | 原始 IncomingMessage／ClientRequest 归包内私有 owner；send 只交 stop/stopped 句柄，read 经私有表独占取得。response 到来即登记原停止责任，错误体读任务有拥有者和错误去向 | R 未被 read 消费时也由持有者 stop／close；stop 和 stopped 不返回原始资源。req／socket、读循环与 track 回调分别确实结束才释放对应使用权，不靠 WeakMap／GC 代收束。已交 H 不因 stop/close 被清空 |
| 已处理的 H | send 闭包在读取正文前拥有；公共结果交出独立不可变值；未成功保留不能伪造 | 正常生命周期交给调用者持有；仅随其结果的普通内存可达性消失，不建立后台保留队列。进程丢失前未持久的 H 不承诺恢复 |
| 模型贡献、固定 lease | 原贡献 fiber 和各持有者；完整定义登记／acquire 之后可用 | retiring 后拒新引用，现有调用照原绑定收口，强制取消仍等实际停止／回调；旧清理不删除新贡献，不给 H 另持永久 lease |
| 诊断借用端口 | 原装配 owner；输出仍只含既有受控阶段事实 | H 不进入 detail／默认日志／trace 原文；sink 异常不改 outcome，独立退化可见；不给头新添观察者或无界缓存 |

## 关键选择、反向核对与交接

| 关键选择（候选） | 落选方的最强论证 | 本方弱点、置信度 |
| --- | --- | --- |
| 在同次 send 结果交不可变 H；移除旧两个公开头出口 | 保留旧成员可少改既有调用者；只等 StreamEnd 则贴近读取者 | 必须协调 runtime 类型及全部实际消费者；D-090 已选单一权威，置信度高。没有隐式兼容 fallback |
| 真实最小句柄＋包内 WeakMap，原始 response 不在公共可达图 | 保留公开 IncomingMessage 能供独立用户自行读流，少一层内部查找 | 独立消费者须使用公开 readStream，内部生命周期与句柄身份需实际验证；只隐藏类型仍泄密，置信度高。没有选择另一种任意原始网络客户端公共能力 |
| response 回调先保留，再让错误体异步完成 | 最终统一从 R／错误对象拿头可少一次局部持有 | 同次闭包须处理 error/cancel 竞态并保留实际来源；置信度高，真实异常交错尚待验证 |
| 复用已有资源 owner，无新 fiber 或头服务 | 单独头服务便于后续独立查询、保留或跨进程消费 | 本方案只交一次函数事实，不支持独立查询；现契约没有该消费者，置信度高；未来需求另走精确契约 |
| 头值不经事件／diagnostic 交接 | callback 可以更早让调用者知道非 2xx 的头已到 | send 的最终失败仍须等其既有收束，不能即时广播；换来一个明确秘密边界和无新队列，置信度高 |

反向核对：dispose 时旧请求与 H 仍归原 send／调用者，费用不回滚；依赖撤回不让新实例取代旧绑定；头不进入任何到达／内容／诊断广播；跨进程只能以明确序列化协议重建 H 的值保真和所有权，不能沿本机冻对象推导，未持久头的崩溃恢复不承诺。这里只冻结采得的 map，不声称 HTTP 原始线序或凭据政策天然正确。

本稿允许后续实施者在已经明确的语义内选择局部复制／冻结与错误协调手段，不授权另写状态码业务政策、脱敏默认值或日志历史格式。依赖输入闭合并由主线独立评审／采用后，施工范围为本包 `http.ts`／相关类型接线、工厂／插件传递、对应测试和两份包 README；其余源文件只有受影响调用需要才改。runtime 的类型／invoke、core 制品、codec／writer 均由各原 owner 实施和验收。

验收按 [PH-V1～V9、PH-J1/J2](verification.md#v5-响应头证据义务) 执行；本节点通过最多闭合 transport 自身和已实测 joint 分支，不能把 RT5-H5、mrr/1 历史解释、全部写方、G6/G28～G31、十三操作或 37 模型认证一并签掉。正式源交付必须给出精确修订、公开打包消费者、双语实际例子、真实停止及有针对性的行为负控；本次起草不声称它们已发生。
