# 可复核的来源与观察

所有原文固定于官方 deepseek-ai/deepseek-harness commit `639ed015397290b3745d163aafe02ffee4aa3f84`。以下均为2026-09-29的源码/文档/测试文本阅读，不是执行结果。URL行号使用raw文件行号，而非浏览工具重新排版后的行号。短标识符只用于定位，正文以转述为主。

## E0 固定源码取得与校验

- 消费对象：[研究正文](research.md)C1–C7。
- 来源与精确修订：`639ed015397290b3745d163aafe02ffee4aa3f84`；[commit API](https://api.github.com/repos/deepseek-ai/deepseek-harness/commits/639ed015397290b3745d163aafe02ffee4aa3f84)实际返回同一完整SHA；tree `ac66a6a3e77f6fa396509ddfecc7beacf0cf642a`。
- 来源立场：上游作者的一手公开仓库，非独立第三方。元数据证明取得哪份内容，不证明软件正确。
- 取得方式：先以web工具打开官方固定GitHub页面/两份raw；再以Python 3 urllib.request对三份pinned raw发HTTPS GET，计算SHA-256与Git blob SHA-1；独立请求各文件contents API带同一ref，比较blob SHA及byte size。三项均HTTP 200且相等，未使用分支HEAD代替SHA。
- 实际时间：`2026-09-29T11:38:57.910808+00:00`。元数据及每个请求的最终URL见[source-manifest.json](source-manifest.json)。
- 环境与前提：未安装/运行DSH或依赖；只访问公开官方HTTPS；未读取token/密钥/账本。HUB起始HEAD为`ce5f2c6b0f0f381b7a0cc1a0256a836b7aa59996`。工作期间其他agent可继续修改HUB。
- 支持范围：精确源定位与字节匹配。不提供签名真实性证明、构建可复现性或测试通过声明。
- 后续核对：更换SHA或raw字节哈希变化时，重新核对受影响结论。当前长期包仅保留 URL/哈希，不承诺离线原文归档。入库者另行重新取得三份 raw，SHA-256 与清单全部相等，并复读 E1～E5 的关键方法与冲突段；上游测试仍未执行。

| 文件 | 行数 / 字节 | SHA-256 | Git blob SHA-1（与API相等） |
| --- | --- | --- | --- |
| [src/index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/src/index.ts) | 689 / 31340 | `9979fdae64fd0a342067981c39de9cde2da7066d28f8506a501fd51e8f9068b9` | `54dd8a805dd7be26953b31cc97864900f7da3fc9` |
| [README.md](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/README.md) | 189 / 16788 | `e7a7d599ea893bccd66dfdd8081b46c1323a0456534eec5471b53999d8db5abc` | `be003d7b899306b58c4ddc88e720c18dde9ce33b` |
| [tests/agent.spec.ts](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/tests/agent.spec.ts) | 380 / 16032 | `53a1eb832b58c4fe6c19b5c5f4d1780607cdb8fdbe58f5d12ef3d03ff2c0fa44` | `c31acf5c66133bf7c0c91d2fd6342b1c52a36dbf` |

最小再取证步骤（不是产品测试）：对清单每条url读取raw字节，验证sha256；计算 `SHA1("blob " + byteLength + NUL + bytes)` 与git_blob_sha1相等；再请求contents_api_url确认返回sha/size相等。GitHub网页与raw均固定完整commit，不以README宣称的包版本替代实际修订。

## E1 服务门面与 typert 引用

- 消费对象：C1、C2。
- 来源：同SHA [index.ts:245–270](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/src/index.ts#L245)，[:376–415](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/src/index.ts#L376)；[README:28–32](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/README.md#L28)、[:79–81](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/README.md#L79)；[tests:42–66](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/tests/agent.spec.ts#L42)。
- 来源立场/取得方式：上游作者源码、作者接口说明与作者测试断言；E0方式完整读取三份原文。
- 实际观察：构造器发布agents Service。typert存在时，lookup带agent参数和agentId wire名，解析到get(id)；Context host解析get(id)?.ctx。create/resume调用requireFactory并委托；无factory时抛缺席错误。README将具体构造/驱动归driver。
- 测试写下的覆盖：先装AgentRegistry再装TypertRegistry，注册stub后lookup与Context resolve分别返回同一Agent和ctx；撤entry后resolve undefined；撤registry fiber后typert贡献消失。本轮未执行，不能说hotload行为已在本机通过。
- 支持范围：门面和所注册resolver的实际函数体。未读typert registry内部，不能推论wire传输安全、租户权限或序列化远程handle。
- 后续核对：Service key、resolver、wire声明或依赖生命周期变化触发重读。

## E2 Map 身份与 exact-entry detach

- 消费对象：C3、C4。
- 来源：同SHA [index.ts:210–220](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/src/index.ts#L210)、[:437–559](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/src/index.ts#L437)、[:566–600](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/src/index.ts#L566)；[tests:68–224](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/tests/agent.spec.ts#L68)；[README:106–108](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/README.md#L106)、[:177](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/README.md#L177)。
- 来源立场/取得方式：官方源码及作者测试；按E0取得。
- 实际观察：
  - enter检查agent.id与session.id完全相等，当前Map有键则拒绝；成功时即插入AgentEntry。
  - owner字段保存显式Agent引用，roots筛owner缺席，isOwnedBy使用引用相等；该方法不是按parent session lineage判断。
  - detach闭包有一次性entered门，最终删除前比较Map当前entry对象；旧闭包不能删除后来同ID entry。
  - announce核entry.agent为同一对象，标记announced/announcing后串行created；finally处理延迟detach。登记存在先于announce完成。
  - register使用effect组合enter与announce；advanced enter本身返回plain detach，未自己调用ctx.effect。
  - emitDisposed逐监听捕获同步异常并接Promise拒绝处理，不等待监听Promise作为资源排空屏障。
- 作者测试断言：身份错配拒绝；父子关系独立于登记次序；创建监听同步/异步失败配对disposed并回滚；串行await；stale/idempotent detach保留replacement；创建监听内detach延后到两个监听完成。本轮仅读断言。
- 支持范围：单实例、同进程对象关系与源码生命周期分支；没有并发进程唯一性或持久注销证明。enter并未检查owner自身当前登记存在，调用前提与动态验证分开。
- 后续核对：改ID域、entry对象比较、announce事件次序或effect组合方式时重查。

## E3 factory effect 与 caller Context

- 消费对象：C1、C5。
- 来源：同SHA [index.ts:171–202](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/src/index.ts#L171)、[:228–231](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/src/index.ts#L228)、[:346–441](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/src/index.ts#L346)；[tests:284–380](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/tests/agent.spec.ts#L284)。
- 来源立场/取得方式：源码、注释与作者使用stub的测试；E0。
- 实际观察：setFactory以effect包单槽注册，双注册拒绝；保存symbols.original或原目标，清理设undefined；原effect disposer不加wrapper直接返回。create/resume先取ownerCtx=this.ctx，再getTraceable(ownerCtx,target)，Reflect.apply传receiver和显式ownerCtx/options。注释要求实际factory以此caller owner承载创建事务和返回的生命周期。
- 作者测试断言：无factory create拒绝；调用发生在inner plugin时factory收到inner.fiber；parentAgent独立保留；注册factory的owner dispose后后续create无factory；已trace Service经canonicalize仍能访问原WeakMap状态。
- 支持范围：代码转发关系与作者测试意图。具体Cordis context tracing、effect single-shot/idempotence及原disposer identity-nesting规则仅有本文件注释/所读测试，未核Cordis源码或运行区分probe。当前setFactory清槽代码不自行枚举活agent停止；不能把provider全量排空算它做的。
- 后续核对：修改getTraceable、symbols.original、effect或factory实现时重查；不得把此DSH版本读数自动记为本项目当前Cordis版本事实。

## E4 handle dispose 与文档次序冲突

- 消费对象：C6。
- 来源：同SHA [index.ts:146–163](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/src/index.ts#L146)、[:171–202](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/src/index.ts#L171)；[README:32–40](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/README.md#L32)、[:108](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/README.md#L108)、[:116–118](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/README.md#L116)；[tests:284–300](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/tests/agent.spec.ts#L284)。
- 来源立场/取得方式：作者声明与接口形状，不是实际factory操作跟踪；E0。
- 实际观察：AgentHandle类型包含agent与Promise<void> dispose；get返回Agent。注释将consumer holder和factory provider分别赋予销毁能力/结构共同所有权；裸Agent仍暴露cancel（测试stub第33行也体现控制接口）。
- **同版本文档冲突**：index.ts:152–153的说明顺序为loop停止/等待、Agent撤除、Session移除、最后scope清理；README:108为loop停止/排空、scope清理、Agent撤除、Session撤除。两份描述都不能单独证明具体factory实际顺序。README:40的概括与接口注释近似，不消除implementation段的差异。
- 支持范围：销毁句柄形状、裸对象与句柄区分，以及存在表述冲突。指定测试factory使用立即resolve的stub dispose，没有stop/drain/unregister次序断言；不验证provider unload已排空全部handle。
- 后续核对：依赖完整次序前需读同SHA真实factory及相应测试，必要时执行有限probe。此次不选边、不自行修上游文档。

## E5 live-only 查询与耐久边界

- 消费对象：C2、C7。
- 来源：同SHA [index.ts:246](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/src/index.ts#L246)、[:497–509](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/src/index.ts#L497)、[:561–600](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/src/index.ts#L561)；[README:32](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/README.md#L32)、[:175–176](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/README.md#L175)；[tests:76–84](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/tests/agent.spec.ts#L76)、[:184–205](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/tests/agent.spec.ts#L184)。
- 来源立场/取得方式：完整index.ts正文、包README和指定测试的有限源码审计；E0。
- 实际观察：get直接读Map entry.agent；删除后无tombstone留在store；list/roots只枚举当前store。此类没有durable terminal表、结果读取端口或磁盘写。resume入口转交factory，接口注释要求sessionPersistence。
- 条件推导（未执行）：空registry对X查询undefined；登记X再detach也查询undefined。查询结果不足以区分两种历史。已经撤除对象的外部引用并不被Map.delete自动改写，故lookup消失亦不证明所有外部执行停止。
- 支持范围：仅AgentRegistry的查询表达力，不能推广为DSH项目没有持久Session/消息日志，也不能把ambient initiator当liveness/authorization；README明示其进程内归因限制。
- 局限检索：已读README Known Limitations与整个指定index/test；未检索外部issue/独立复现/竞品评价，未读别的包的持久实现。负面结论强度是源码范围内的结构缺席与条件推导，不是运行反例或全面不存在证明。
- 后续核对：新增查询、墓碑、耐久投影或改变detach行为时重查；领域终态/恢复语义由本项目设计材料决定。

## E6 测试声明覆盖及未执行范围

- 消费对象：C1–C7的证据强度。
- 来源与精确修订：[tests/agent.spec.ts](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/tests/agent.spec.ts)，`639ed015397290b3745d163aafe02ffee4aa3f84`。
- 来源立场/取得方式：官方作者测试源码完整阅读，未作为测试命令执行；E0。
- 实际观察与支持范围：

| 作者测试段 | 测试写下的区分 | 此轮不能声称 |
| --- | --- | --- |
| 42–66 | typert lookup/context安装与移除 | 当前安装版本组合已通过 |
| 68–116 | exact登记、冲突ID、SessionID一致、runtime parent | 分布式唯一性/父对象live授权 |
| 118–182 | 同步与异步created失败、串行等待、disposed失败隔离 | 外部副作用回滚、资源全部排空 |
| 184–224 | replacement保护、重入detach等待 | 跨进程旧令牌 fencing |
| 227–275 | agentEvents异常隔离、串行注入subject | durable事件流与持久结果回放 |
| 278–281 | cancel cause静态类型 | 真取消执行行为 |
| 284–346 | factory缺席、caller fiber、parent选项、owner清槽 | 实际loop/factory handle lifecycle |
| 348–379 | traced Service规范化后保留receiver状态 | 所有Cordis版本同等保证 |

- 执行记录：无测试命令、无build、无依赖安装、无付费请求。实际执行只有公开原文HTTP取证、hash比较与临时草稿写入。
- 后续核对：正式设计若依赖这些行为，区分仍可直接引用的固定源码事实与须补实际组合/probe的行为；本研究没有替代后续验证。
