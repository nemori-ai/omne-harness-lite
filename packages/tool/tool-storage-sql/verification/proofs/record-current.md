# Tool 原记录核回：条件安全性证明

承诺归 [SPEC TS-12](../../SPEC.md#ts-12-原记录的同事务核回)，Worker 实现归 [record-current.ts](../../src/worker/record-current.ts)。这是一份人工条件论证，不是模型检查器穷尽证明。

## 模型与前提

记录关系 R 的主键为 `(tenant, kind, name, key)`。原 Tool owner 验证请求 q，观察记录集合 O；每项保存完整记录摘要 D(R[k])。直接来源集合含原 binding；转发集合还含父 call 与父 binding。集合由 host 的原 guard 实际读取产生，不由请求者指定。外部身份与启动资格仍有各自拥有者。

前提：D 抗碰撞；持久 JSON 编码与 D 的 canonical JSON 相容；原 guard 对该请求的核验有效；同一 SQL 操作事务串行执行，tool 写先于 guard；消费者声明 fact 依赖且核对完整 q 到 O 的对应。数据库及 SQL 材料目录是受信基础，不假设外部提供的摘要可信。

## 安全性

guard 对 O 的每个主键点读，只有每项存在且摘要相等才发布 fact。因此在上述前提下，fact 表明此事务此刻的每条记录与原 guard 所用记录相同。消费者在同事务中检查完整 fact 后提交，使用的是同一份原 Tool 依据。

若改变先提交，至少一个摘要不同或记录缺失，guard 返回 conflict，消费者写入回滚。若捕获先提交，后续变化不改变已提交的历史结果。本批 tool 写在 guard 前执行，所以本批删除或替换也无法绕过检查。无关主键的变化不进入 O，不产生虚假冲突。

如果一次资格读取重复观察同一主键但内容不同，host 拒绝整个资格结果，不能拼成不一致的观察。输入请求在首次 await 前快照，异步调用期间改变原参数不改变获验请求。

## 反例与边界

- 只核 domain revision：无关来源绑定增加会误拒绝，故选原记录。
- 只核子 binding：父 call 改变后仍可能放行，故转发包含三条依据。
- guard 在写入前执行或消费者不声明 fact 依赖：同批修改可破坏保证，因此装配顺序是必要前提。
- 老 receipt 重放：返回的是过去的结果，不是新时刻的观察；新检查必须用新 operationKey。
- 删除后恢复完全相同内容：摘要相等成立。此机制证明当前内容，不证明历史从未改变。

## 可执行守护

[record-current-real.spec.ts](../../tests/record-current-real.spec.ts) 运行真实 SQLite Worker、原来源签发与资格读取。覆盖首次无 call、无关签发、关闭重开、错租户/地址/摘要、同批删除回滚、原 receipt 重放及转发的三条记录。EXPLAIN 检查完整主键 SEARCH。主体与应用权限捕获不是这组测试的真实生产装配；完整 capture 验收另由应用拥有者完成。
