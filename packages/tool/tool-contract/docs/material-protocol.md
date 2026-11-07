# 最终事实与材料保管协议

状态：[#1168](https://github.com/nemori-ai/omne-harness-lite/issues/1168) 的 W3-A 实施规格，已采用，尚待实现验证。本页补充 [P05](../SPEC.md#p05-执行事实与原输出) 和[有限期正文保管](../SPEC.md#有限期正文保管)。它不宣布当前公开类型或生产装配已经支持。

## M01 材料身份与责任

Tool 自有材料以 tenant、call、objectId、generation 和 provider adoption 唯一定位，身份不可复用。材料引用不授予读取或删除资格。字节提供者负责不可变字节、封存、范围读取、持久写入围栏及精确代次删除；Tool 负责用途、结果关联、期限、页租约和删除授权。原生引用的外域目标不进入此集合。

Tool 在写字节前持久记录原准备操作、输入摘要、材料身份和用途。准备意图不证明字节已耐久。写入或封存未知时查询原操作；元数据没有最终结果关联不构成孤儿删除依据。唯一源在封存前不可恢复时，记录真实输出丢失，不重新执行业务补造结果。

原操作同输入认回，异输入冲突。已封存材料不原地改写。用途有独立身份和责任依据，不能只维护一个无法解释的计数。独立程序或过程用途不因正文到期消失。首版不做跨调用去重。

## M02 精确 final 与重放

绑定保管该次真实 final 的封存 envelope，覆盖 raw 引用、实际 ToolResult、terminal 和 effect。raw 经 renderer 重新计算不能替代此 envelope。事实流及宿主已完成缓存使用受信封存引用，不能另存完整正文抵消清理。

首次采用必须核对封存字节、codec、摘要、租户、原调用及原执行。final 事实的身份与其可删除材料分开：pending 保存 envelope 引用，settled 保存结果版本及结算凭据。事实身份、terminal、effect 及原 raw 身份不因结算变化。

事件值指纹覆盖整个原 fact，不包含 event ID；调用 final 指纹用于同 invocation 的重复 final 判定。批次指纹覆盖 start、source、batch、after、cursor 和有序 event ID/值指纹列表。三者采用下述 `tool-canonical-json-v1` 编码及 SHA-256。摘要等值判定依赖无碰撞前提。外来指纹须经受信封存验证，不能直接相信作者值。

已接收事件和批次先按持久身份、指纹认回原回执，不重新读 envelope。同身份异值拒绝。调用已经结算后到达的原 final 别名，只能依据已核验的原材料身份和 final 指纹建立 settled 记录，不能采用一份未经验证的新材料冒充原事实。

### M02.1 指纹编码 v1

本版本编码经边界校验和显式身份编码后的 JSON 数据。输入仅含 null、boolean、string、有限的 IEEE-754 binary64 number、稠密数组及具有自有字符串数据属性的普通记录。身份使用所属 codec 的公开数据，不编码运行时对象。拒绝 undefined、非有限数、bigint、symbol、function、循环、稀疏数组、访问器和非数据对象。可选字段必须显式省略，不能靠编码器静默删除非法值。

规范文本按下列规则递归构造。数组以原顺序编码。对象键按 UTF-16 码元升序比较，较短前缀在先，不用 locale 比较，不做 Unicode 归一化。按此顺序直接写键值对，不能先重建 JavaScript 对象再整体 stringify，因为整数键会被重新排序。重复键不是合法输入。

null 和 boolean 分别写 `null`、`true`、`false`。字符串及键采用 ECMAScript `JSON.stringify(string)` 的 JSON 字符串表示，包括未配对 surrogate 的转义。数值采用 `JSON.stringify(number)` 的表示，负零写 `0`。容器仅写 JSON 标点，不加空格、换行、BOM 或尾部字节。最终文本编码为 UTF-8。

`ToolResult.data.value` 中的 JsonValue 是原结果的带标签数据，不能在此解包成业务 JSON。其 `lexeme` 字符串保持原值。实现可以把上述输入转换为 JsonValue，再复用 [canonicalJsonText](../src/dynamics.ts) 和 json-text 的写出能力，但转换时必须遵守本页的数值和数据规则。现有 Tool `canonicalDigest` 不作为本版本的编码定义，不改变其他既有证据的编码。

指纹为 `{codec:'tool-canonical-json-v1', algorithm:'sha256', digest, bytes}`。digest 是规范 UTF-8 字节的 SHA-256、小写 64 位十六进制且无前缀。bytes 是同一字节串长度的十进制字符串，无正号、空白或前导零，零写 `0`。摘要输入不包含指纹自身。

final 事件编码完整 `FinalEnvelope`，调用 final 指纹使用同一值，不能改为编码 pointer 或重新渲染 raw。其他事件编码原 fact。批次编码 `{start, source, batch, after, cursor, events:[{event, value}]}`，其中 value 是上述事件值指纹，events 保持原顺序。接收、恢复及提供者换代必须使用记录内的编码版本；未知版本返回 unsupported，不能尝试另一编码后认回。

以下文本是固定向量，不由待测编码器生成预期。实现须检查其文本、UTF-8 长度和摘要，并分别测试非法输入拒绝。

| 输入 | 规范文本 | UTF-8 字节数 |
| --- | --- | --- |
| 对象先插入键 `2`，再插入键 `10`，值分别为 `two`、`ten` | `{"10":"ten","2":"two"}` | 22 |
| 对象含 a=负零，b=[true,null]，插入顺序相反 | `{"a":0,"b":[true,null]}` | 23 |
| 字符串 `中🙂` | `"中🙂"` | 9 |
| 带标签数值，lexeme 为 `1.0` | `{"kind":"number","lexeme":"1.0"}` | 32 |

## M03 最终结果提交

结算先查询原 operation。已经提交则认回原版本及剩余职责，不重新读取 raw/envelope，也不续期。只有可靠未提交的准备才继续材料读取；未知保留原任务。

准备器分别保管最终 content、程序 data、attachments 元数据和 original.summary。content 与 summary 不假定相等。卸载正文有独立封存材料。材料槽由原 settle operation 和槽名固定，重试不换身份。校验、输出屏障和各最终材料耐久是提交前提。

一个 Tool call 域提交同时固定最终版本、通道用途、原 consumer/delivery、activatedAt/expiresAt、原操作回执、全部原 final 别名的 settled 状态，以及被替代 raw/envelope 的用途解除与清理任务。字节 IO 不在这个事务内。提交后不以同一版本改写正文、摘要或 data。

恢复快照只返回结果版本与来源凭据，不把完整 ToolResult 嵌入 loadRecovery。材料仓暂时不可用不能阻断原操作认回、队列收尾或清理任务恢复。完整内容通过受当前资格约束的结果读口取得。

原结果账本只持有最终通道引用与必要元数据。完整 ToolResult 只为合格交付或读取临时还原。交付解除同提交撤去该交付用途；卸载正文保持固定期限，读回不依赖已释放的完整结果材料。独立程序用途与必要过程保管按各自依据解除。

## M04 页与删除

页准入在原 call 域核当前资格、结果/正文关联、有效时间、全部用途与删除状态，并提交有限页租约。字节 IO 在事务外执行。完成时再核当前资格及租约有效性；正文期限已过但租约仍有效的一页可以完成。租约失效时丢弃该页，明确失败，不返回部分成功。后续页重新准入。

删除候选扫描只有定位权。Tool 在同一 call 域提交中重核全部用途结束、有效租约为空，再写删除授权和任务。该提交之后不再允许新用途或租约。byte provider 在对象顺序中先持久围栏，再删字节和载荷清单；迟到 write/seal 必须被该围栏拒绝。物理删除与 Tool 完成确认是独立步骤，均以原 key/generation/operation 恢复。

`ToolMaterialStore.erase` 每次只推进一个有界持久步骤。返回 pending 表示仍未完成，只有 deleted 分支携带删除回执。`inspectErase` 仅观察原操作，不推进删除。观察到 pending 或 unknown 后，维护方重新核验资格，再以原授权和操作重试 erase；不能只轮询，也不能换操作。提供者不得在一次 erase 内循环清空任意大的对象。

维护索引与相应账本写入同事务更新，扫描有界，不逐次载入无关调用历史。索引不代替本调用的权威守卫。provider 替换须保留原 adoption 的地址解析，或显式迁移；不能把缺席当作材料不存在。

## M05 有效时间

时间提供者输出同进程非递减样本。Tool 在每个 call 域持久保存已采用样本的高水位，并与初次准备意图、结果激活、页准入/完成及到期裁定同提交。低于水位的样本不得用于初次准备、新激活、读页或新的基于时间的删除授权，返回 unavailable。CAS 冲突重试重新取样。

到期答复之前先持久记录 expired 及新水位；提交未知不返回可读或确定到期。已经记录的 expired 和已结束租约不复活。重启、提供者换代及不同宿主的样本均核原水位，原期限不重算。已经成立的提交认回与删除围栏不因新时间样本缺席失效。

本地提供者的具体墙钟/单调源组合归 [宿主时间机制](../../tool-host-local/SPEC.md#w3-材料时间源)。墙钟可信、单调源前进和存储可恢复是进展前提；本协议不提供校时服务，不保证任意坏钟下的真实停机时长。实现不得隐藏这些前提或用进程内 Map 替代持久水位。

## M06 失败和验证边界

保存、Tool 提交、Agent 接收及物理删除分别可失败。任何未知都保留原身份与尚有效责任，不能自动换键、重执行业务或抹去待办。资格先于存在性披露，完整结果读取仍要求完整 data 资格。正文读取另按固定 body 身份核验。

[FinalReceipt 与 MaterialTime](../verification/models/body-custody/README.md) 是局部有界检查。真实实现须验证大正文不进入单条账本载荷、重放不访问已删除 envelope、时间与用途的同提交、部分删除重启、旧写迟到、provider 替换及 Agent 独立恢复。有限模型不替代这些证据。
