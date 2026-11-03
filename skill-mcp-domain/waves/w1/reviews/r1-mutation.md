# W1 第 1 轮评审：差分变异（摘要）

范围：基线 21175c9f9 以来的改动行（工具不能按文件收窄，--since 在首轮用不上）。3 个工作进程，无进程数告警。两次串行，跑完后树干净。

| 候选 | 变异体 | 被杀 | 存活 | 无覆盖 | 超时 | 运行错误 | 分数 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Skill 全成员 | 1463 | 1123 | 295 | 32 | 11 | 2 | 无效（RuntimeError） |
| Skill 热点 | — | 825 | 162 | 9 | 6 | 1 | — |
| MCP 全成员 | 2045 | 1521 | 418 | 56 | 1 | 38 | 无效（RuntimeError、11 超时未复核、类型测试没数到） |
| MCP 热点 | — | 850 | 73 | 20 | 1 | 8 | — |

RuntimeError 都是静态变异改坏模块顶层断言（`new TextDecoder('utf-8')`、schema 文本读取、套件构造）导致收集阶段抛错；按效果算被杀，计数规则不认。

存活分三类：(a) 用夹具能判定的（边界 U+001F/U+007F/U+009F、正则锚点、base64 长度、排序比较器逆序输入、classify 与 content 的缺省分支、endpoint 的成员缺省、catalog 的 ttl 与 maxPages）；(b) 等价（`index <= length` 的 NaN 比较、唯一键下的 `<→<=`、`never` 穷尽分支、SHA-256 之后的防御断言）；(c) 错误说明文字 `detail` 与 schema 文本（`detail` 不是契约字段）。全文清单在 /tmp 的 scratchpad 日志与 tmp/mutation-ledger。
