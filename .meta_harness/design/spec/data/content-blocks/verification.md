# 验证义务与方法

本页维护验证义务、方法、前提与限制，不保存单次执行台账。精确采用版本与接受状态从本专题入口和 registry 读取；提供者与装配的当前实现从实际成员入口读取，不从旧的执行摘要推断。单次配置、输入、结果与反例留本工作树 `tmp/`；可复跑资源由当前承诺或实现拥有者维护。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 责任与限制 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v2/examples.md) 第 1～13 节（带「校验对象」的那些）逐行过 Schema，比对「Schema」一列。第 14、15 节与第 3 节的相等用例不参与 | Draft 2020-12 校验器（须支持 `unevaluatedProperties`、`dependentRequired`，并能按 `$id` 解析到 `data.identity-values/v1` 的 Schema）＋ 该文件按节绑定的 `$defs` | [S-1](v2/contract.md#s-1-七类块)、[S-2](v2/contract.md#s-2-块底座)、[S-4](v2/contract.md#s-4-两个标注)、[S-7](v2/contract.md#s-7-媒体类型的规范形式)～[S-13](v2/contract.md#s-13-半截的工具调用)、[S-15](v2/contract.md#s-15-工具结果块)～[S-21](v2/contract.md#s-21-attachmentref)、[S-25](v2/contract.md#s-25-判别式与枚举闭合) 的**形状那一面** | 只支持形状；拒绝值须按 V-2 独立验证。 |
| V-2 | **拒绝值的具名与优先级**：对 `examples.md` 每个拒绝行，接收边界给出的拒绝值等于「拒绝值」一列；第 12 节六行专验优先级 | 接收边界的一致性用例（同一份输入跨实现比对） | [S-26](v2/contract.md#s-26-表示层拒绝值)、[S-27](v2/contract.md#s-27-表示层拒绝不是判定也不修补) | 接收边界提供者：须核具名拒绝值；只验 Schema 通过与否不足。 |
| V-3 | **Schema 管不到的四条形状约束**：一条消息内 `id` 重复（含嵌套）、引用形状下两处媒体类型不逐字相同、派生块与原块同一模态、非规范写法不被改写 | 接收边界的校验 ＋ [`examples.md` 第 14 节](v2/examples.md#14-schema-挡不住但同样非法的)前四行 | [S-3](v2/contract.md#s-3-blockid)、[S-7](v2/contract.md#s-7-媒体类型的规范形式)、[S-10](v2/contract.md#s-10-语音块与图块)、[S-19](v2/contract.md#s-19-派生表示与-transcript)、[S-27](v2/contract.md#s-27-表示层拒绝不是判定也不修补) | 接收边界提供者：`id` 唯一须在可见整条消息的边界检查，落点归 `data.messages`。 |
| V-4 | **规范场景** [S-28](v2/contract.md#s-28-标注缺一即拒)～[S-33](v2/contract.md#s-33-派生表示不含文件块)：每条一个正例一个反例；**三条条件约束**（[S-29](v2/contract.md#s-29-半截调用两边都不给) 半截调用的标注、[S-30](v2/contract.md#s-30-结果里不发起调用) 结果里不发起调用、[S-31](v2/contract.md#s-31-语音与图的模态要对) 语音与图的模态）各在其中 | 规范场景演练：真实接收边界、真实落盘 | [S-4](v2/contract.md#s-4-两个标注)、[S-10](v2/contract.md#s-10-语音块与图块)、[S-13](v2/contract.md#s-13-半截的工具调用)、[S-16](v2/contract.md#s-16-结果里不发起调用)、[S-18](v2/contract.md#s-18-占位原因与它落在哪一格)、[S-19](v2/contract.md#s-19-派生表示与-transcript) | 接收边界与落盘提供者：S-31 两个反例必须同跑；S-29 还须观察 `rawArguments` 从未解析，只看拒绝值不足。 |
| V-5 | **合取取用**：工具结果块给模型、里面一块标着不给模型；派生表示里的块只给模型 | PF-010 组装的规范场景 | [S-5](v2/contract.md#s-5-嵌套的块按合取取用) | PF-010 组装提供者：块契约只拥有规则，演练归组装。 |
| V-6 | **`opaque` 原样回传**：写入一份含大整数（`9007199254740993`）、嵌套对象与 `null` 的不透明数据，经落盘、读回、每一跳传输后与原值比对；另验缺席与 `null` 各自保留 | 规范场景 ＋ 跨实现一致性用例 | [S-9](v2/contract.md#s-9-思考块与不透明数据) | 日志与传输适配提供者：须真实落盘、读回与逐跳比对，不以一次形状校验替代。 |
| V-7 | **落盘之后整块不变**：压缩、转换件、卸载各走一遍，前后逐字节比对已落盘的块 | 规范场景 ＋ 日志写路径的静态检查（[SC-1](#静态检查义务)） | [S-22](v2/contract.md#s-22-落盘之后整块不变) | 日志提供者：真实转换、压缩、卸载与写路径静态检查配对。 |
| V-8 | **消费者路径走查**（[CS-1～CS-6](v2/contract.md#消费者核对场景)） | 结构化走查（评审对象）；有提供者之后升级为真实演练 | [S-3](v2/contract.md#s-3-blockid)、[S-5](v2/contract.md#s-5-嵌套的块按合取取用)、[S-6](v2/contract.md#s-6-模态由媒体类型判定)、[S-9](v2/contract.md#s-9-思考块与不透明数据)、[S-12](v2/contract.md#s-12-完整的工具调用)、[S-13](v2/contract.md#s-13-半截的工具调用)、[S-15](v2/contract.md#s-15-工具结果块)、[S-17](v2/contract.md#s-17-六种收场)～[S-19](v2/contract.md#s-19-派生表示与-transcript)、[S-22](v2/contract.md#s-22-落盘之后整块不变)、[S-26](v2/contract.md#s-26-表示层拒绝值) | 消费者与评审者：走查不依赖提供者；存储解引用的 gap 仍按 contract G-1 的 owner 处理，不能靠示例关闭。 |
| V-9 | **跨进程**：[第四节](v2/contract.md#四装配给与协议给)右列八行逐行演练 | 规范场景演练 | [S-3](v2/contract.md#s-3-blockid)、[S-4](v2/contract.md#s-4-两个标注)、[S-9](v2/contract.md#s-9-思考块与不透明数据)、[S-10](v2/contract.md#s-10-语音块与图块)、[S-14](v2/contract.md#s-14-callid)、[S-21](v2/contract.md#s-21-attachmentref)～[S-23](v2/contract.md#s-23-块不携带租户身份)、[S-26](v2/contract.md#s-26-表示层拒绝值) | 跨进程协议与接收边界：同进程传参不能替代；跨进程演化时须逐项演练。 |
| V-10 | **静态检查**（[SC-1～SC-4](#静态检查义务)） | 实现语言的静态检查（具体形式归 realization） | 见下表 | 实现与验证工具拥有者：具体静态检查形式归 realization。 |
| V-11 | **JSON 严格读、数无损**：① 重复成员名的参数串在那一次解析里落「解析不了」（`rawArguments` ＋ `unparseable: true`），不取一个；② 超出 ±2^53 的整数（`12345678901234567890`）在 `arguments` 与 `opaque` 里解析、落盘、回读之后逐字不变；③ 读一段块的 JSON 文本，任一层有重复成员名即 `malformed` | 规范场景演练（①归流装配那一次解析，②③归每一处读写）＋ [`examples.md` 第 14 节](v2/examples.md#14-schema-挡不住但同样非法的)末三行 | [S-12](v2/contract.md#s-12-完整的工具调用)、[S-24](v2/contract.md#s-24-规范表示)、[S-26](v2/contract.md#s-26-表示层拒绝值)、[S-22](v2/contract.md#s-22-落盘之后整块不变) | 流装配、日志与各接收边界：Schema 只看解析后的值，测不出重复成员或数被舍入；①在 stream-assembly S-10 检查，②③须真实读写。 |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。文件存在或义务已列出不能代替实际检查。

| # | 检查什么 | 对应条款 | 责任 |
|---|---|---|---|
| SC-1 | 日志的写路径里不存在修改已落盘块的操作：没有对 `visibility`、`renderings`、`transcript`、`opaque`、`reason`、`blocks` 的就地更新 | [S-22](v2/contract.md#s-22-落盘之后整块不变) | 验证义务 |
| SC-2 | 不存在解析半截调用 `rawArguments` 的调用点；完整调用的消费者只读 `arguments`，不从文本重新解析 | [S-12](v2/contract.md#s-12-完整的工具调用)、[S-13](v2/contract.md#s-13-半截的工具调用) | 验证义务 |
| SC-3 | 除传输适配层外，没有代码读取或改写思考块的 `opaque` | [S-9](v2/contract.md#s-9-思考块与不透明数据) | 验证义务 |
| SC-4 | 不存在从 `AttachmentRef.storage`／`key`、`origin` 的名字或块文本推归属、推收场的代码；收场只读 `outcome` | [S-15](v2/contract.md#s-15-工具结果块)、[S-21](v2/contract.md#s-21-attachmentref)、[S-23](v2/contract.md#s-23-块不携带租户身份) | 验证义务 |

## 结果与反例

### 本地自检

按各节「校验对象」把实例绑定至实际 Schema `$defs`，跨契约 `$ref` 经 `$id` 解析，比对第 1～13 节的「Schema」列，第 13 节须按逐行指明的 `$defs`。完整调用的工具名须按模型面命名规则检查；半截调用不在此处判完整调用的字符集。`contentEncoding` 在 Draft 2020-12 中仅为注解，base64 形状由 `pattern` 判。

形状检查不能替代「拒绝值」一致性 V-2、第 3 节的相等判定、第 14 节行为场景、消费者核对或静态检查。单次输入与结果留本工作树 `tmp/`，不以历史自检或文件存在声明行为兑现。

Schema、具名拒绝值、规范场景、消费者走查与真实组合分别判读，不能互相冒充。

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建。**理由在[契约的性质一节](v2/contract.md#性质)末尾：
没有状态转移；结构约束（闭合判别、条件约束、任意层无工具调用、派生块的限制）Schema 本身就能判，
建 Alloy 模型只会得到一份与 Schema 同义的平行工件；Schema 管不到的三条是一次遍历就能检查的谓词，证据形式是 V-3 与 V-5。
**这不是把义务省掉**：它们被改写成了 V-1～V-11。本契约**不拥有任何进展性质**，没有需要写成有界形式的断言。

## 变化的影响

规范内容归 [v2 contract](v2/contract.md)，不在本页维护形成过程。改变精确依赖、工具名字、占位原因、JSON 读写口径或附件形状时，须同步影响到的消费者与对应验证资源，不能将旧输入的结论外推。

- 存储解引用定型后，按 contract G-1 的 owner 补充 V-8 与 V-9；不把 AttachmentRef 的形状通过当作可解引用。
- 跨进程演化时，V-9 的八项协议义务须实际演练，单机范围的检查不能外推。
- 参数串重复成员的解析失败与读取块 JSON 文本的 `malformed` 分开演练；前者保留已登记的调用和 `callId`，不能把整块删除。按 S-12/S-24 与 V-11 检查，不将这些性质塞入 Schema 形状测试。

## 对齐义务

- **来路标记的两个取值与 `data.slash-command` v2 的 S-21、S-25 对齐**（定义性引用，不登 catalog）：那两条改了展开物或留痕的所指，[S-8](v2/contract.md#s-8-文本块与来路标记) 的 `slash_command_expansion`、`slash_command_record` 同轮复核。
- **`$defs/ModelToolName` 是 `data.tool-definition` v2 同名定义的逐字副本**（[S-12](v2/contract.md#s-12-完整的工具调用)；家在那份契约的 S-6）：`type` 与 `pattern` 两处逐字相同；那份契约改字符集或长度，本契约同轮改、V-1 重跑。本契约不 `$ref` 它、不登依赖——那份契约以 `$ref` 取本契约，反向会成环（registry README「互引成环的登记口径」）。**任何一边改了而另一边没跟，不会报任何错**，这一条只能靠两份 Schema 片段的字面比较兜住。
