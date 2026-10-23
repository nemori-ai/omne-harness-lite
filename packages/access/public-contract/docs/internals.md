# 系统公开契约内部设计

本页拥有纯协议编解码的内部构造设计。实际实现与验证证据随成员持续维护。

行为唯一源为[成员SPEC](../SPEC.md#公开编解码入口与实现细化)。公开类型归[src主入口](../src/index.ts)及其消息定义。SDK负责传输报告、再送和缓存，server-entry负责业务接入顺序，public-contract只做纯协议类型和codec。

## 固定模块与依赖

| 文件 | 唯一责任 |
| --- | --- |
| src/index.ts | 仅四个纯函数和公共类型的主exports，不加correlation或业务provider出口 |
| src/messages.ts | 正常/阶段操作、请求、按操作/结果关联响应、本地proof与codec结果类型 |
| src/operation-rules.ts | 完整34正常/4阶段封闭规则、信封/body字段和outcome映射 |
| src/codec.ts | 四函数实现、公开参数防护、模型与wire转换、响应验证后匹配 |
| src/correlation.ts | readRequestDocument和recoverCorrelation，私有严格读取门与迭代metadata自动机 |

直接依赖仅实际使用的json-text、legal-identity、utc-instant及jsonc-parser。jsonc-parser使用现行catalog 3.3.1。静态Schema仅作为已核输入，不引入provider、引擎或异步生命周期。SDK、server-entry、identity、authorization、Cordis和数据库不进入依赖闭包。锁文件只更新本成员importer及必要闭包，由同一实施者在根协调下串行维护。

## 关联读取

采用非递归元数据读取，两个pass使用一次核验并冻结的预算。公开codec入口先核验六项预算并冻结快照，再交readRequestDocument。readJsonBytes严格成功才可提供业务树。只有duplicate-key失败调用recoverCorrelation。其他失败立即返回原失败与无关联。严格读取门与补扫同在src/correlation.ts，词法和frame转换由文件内局部函数维护。

recoverCorrelation使用jsonc-parser扫描token与显式对象/数组frame栈，不用递归visitor。它只计算metadata，不重建树。每个frame维护语法下一状态、成员出现次数及是否处于根messageId值。每个容器/标量计maxItems，进入容器前核maxDepth，每次成员出现计maxMembers，包括相同或转义别名的重复键。解码后的键/值字符串受maxStringLength，原始数字完整lexeme受maxNumberLength，整输入先受maxBytes。

扫描器后仍核严格对象/数组语法、原始字符串转义和控制字符，以及完整RFC8259数字字符段。拒绝注释、尾逗号、错误分隔符、截断、多根、尾部垃圾、非法UTF-8和BOM。不使用scanner的浮点数值。完整EOF且单一根对象成立后，只有恰好一个根messageId且为字符串才有可信ID，包括空字符串。嵌套键不影响根计数，相同值的重复根键仍无关联。根键在原duplicate前后都适用。

两个pass使用同一冻结预算。补扫再次检查完整输入，不因第一处duplicate提前停止而遗漏后缀错误。maxMembers按出现次数可比严格读取更早发现拒绝，不能将补扫更宽松地变成允许。整输入字节上限限制token分配，但不是进程RSS保证。没有隐藏第七深度上限，不捕获RangeError后把有效输入悄悄降成无关联。意外内部编程故障不转换成成功、可信关联或预期拒绝。

响应读取从不补扫被拒绝的响应。它按原operation完整验证版本、outcome/body和关联字段，之后才比较expectedMessageId。共同拒绝的无operation编码重载只允许两种共同outcome，带operation重载仍受38项映射约束。

## 字段和对象检查

proof的missing/empty/present是本地协议表示，业务身份由后续拥有者核验。tenant字符串先严格读内层JSON，固定深度1/3值/2成员，再交tenantCodec。外层预算不按子字段重置。Instant编码保留精度，parameters保留tagged JSON与数字lexeme。诊断只输出有限code，不携任意字段、路径或秘密。

编码前核plain对象、自有可枚举数据属性和闭合字段。getter与toJSON不执行。代理trap故障不把原异常交给公开调用者。顶层编程参数或其反射错误用固定TypeError；模型不合规、访问器和模型代理反射错误为invalid/code field。只捕获局部输入反射边界的用户异常，不把内部程序错误改成预期拒绝。已有合法品牌也不能绕过输出字段/秘密检查。

## 持续验证与责任

测试从主exports消费。tests/protocol.spec.ts核共同边界，tests/correlation.spec.ts核完整补扫和预算，tests/operations.spec.ts与tests/responses.spec.ts核完整矩阵，tests/public-consumption.spec-d.ts核关联类型，tests/install-closure.spec.ts核干净安装。tests/fixtures/client.ts与server.ts为纯协议两端fixture，profile.mjs为有界资源观测。它们不实现真实业务provider，不新增./testing。

关联向量必须包括ID在duplicate前后、转义等值ID重复、嵌套键、坏后缀、字符串/数字scanner边角、六预算等界/越界，以及超过原生递归容量但在显式预算内的深度。差分向量比较严格成功与补扫语法的适用一致性，duplicate输入永远仍为拒绝。测试只能证明覆盖范围，不能声称真实权限或持久业务验证。

编码时先复制自有数据属性，再做封闭字段和品牌校验。parameters的tagged树也先复制，拒绝访问器、不可枚举字段与环，再由json-text判断并冻结。复制对象数量上限由调用者maxItems推导，合法树每个JSON值至多引入一个节点、一个容器列表和一个成员记录，不增加协议预算。最终写出的整份JSON再次按六预算严格读取。
