# w3-skill-catalog 第 1 轮评审（head d62f3ef0e，基线 05f281394）

## reduce 复跑（evidence/w3-skill-catalog/reduce/）

三成员 build/typecheck/test 17/17（402/250/86）；lint:rules、lint:oxlint、lint:deps、format:check 退出 0；metrics：变更函数超 alert 1（`testing-catalog.ts:91 fullwidth` CC 5 覆盖 0% CRAP 30——套件代码在 `skill` 的测试里跑，契约成员自己的覆盖不计）。结构性改动 `grep` 核实：重复定义已删、写范围干净、`src` 无断言；`examples.spec.ts` 有两处 `as unknown as`。

## 三面

- 正确性与 L3（implementation-reviewer，opus@high，探针脚本在 scratchpad/review-w3-skill-catalog/）：无阻断。无披露 8 组 `deepStrictEqual`、整次 `unknown` 54/54、完成次序 4 组、来源判别值 20 种、检索 14 个查询全部通过。N1：答复外形合法、内容残缺时抛出或透传（`adopted` 项缺字段、`open` 的 `ok` 不是字节、`snapshot` 的 `ok` 畸形、W2 既有 `resolve` 残缺）。N2：套件 SC6 只按 name 检索。待裁：空 `capabilities` 与集合 `unknown`；D1 签名；N1 的边界。
- 设计与实践（opus）：阻断 B1（目录与 gate 只按 `kind` 校验，同 N1）、B2（`sourceAnswer` 让 `ok` 原样通过，同 N1）、B3（套件查不出只按 name 匹配或只规范化查询一侧，两个变异 18 条全绿，同 N2）。建议 S1 夹具约束不全（refused 的 name 不可见、SC7 用能力标识 name 检索可能空证明）；S2 同上待裁；S3 host-local SPEC 列了不会变红的反例；S4 `as unknown as`；S5 示例自造 `unsupported` 失败；S6 用例名与断言不符；S7 `LAWFUL_KINDS` 与类型各一份、无穷尽检查；S8 套件形状检查重复。红灯证据 `red/01`、`red/03` 是「模块不存在」，不是行为红。
- SPEC 表达（design-reviewer，opus@xhigh）：阻断 B1（统一处置没写核对到哪一层；伪造快照两头可归；缺同步抛出）、B2（夹具前提不全，正确实现可红）、B3（host-local 示例的两条反例没有对应变异记录）。非阻断 N1 与组页四处差异未登记、N2 空 `capabilities`、N3 次序与「同一输入」、N4「空白」未定义、N5「被拒」两读、N6 `open` 的 `entry-unreadable` 周边条款、N7 新导出无行为条款、N8 SC 编号靠过程稿、N9 依据修订、N10 计数。

## reduce 裁定（第 2 轮输入，写进闭包规格追加记录）

见 delegate/closures/w3-skill-catalog.md 追加记录 2026-11-04T07:00Z。

## 第 2 轮（head 799d3c5e0）

- reduce 复跑：17/17（417/289/88），四项 lint 与格式退出 0；结构性改动逐条 `grep` 核实。差分变异 `--base 05f281394`：`skill` 459 个变异体，被杀 386、存活 61、无覆盖 12，分数 84.1%；存活集中在 `answer-values.ts` 30、`port-answer.ts` 16、`catalog.ts` 8、`match.ts` 6；契约 25 存活（`testing-catalog.ts` 19、`snapshot.ts` 5、`capability.ts` 1），181 无覆盖是套件代码（在 `skill` 的测试里跑）。
- 增量 L3（opus@high，探针在 scratchpad/review-w3-skill-catalog-r2/）：R2–R9 闭合，R1 部分闭合。第 1 轮全部红项转为 `unknown`/`source-unavailable` 不抛出；无披露 8/8、整次 unknown 54/54、次序 4/4 回归通过。阻断 B1：`declared.scripts[].parameters` 原样交出端口对象（多余字段与嵌套字段泄出、端口事后改动影响已交出的值），违反契约「不交出未列字段」与 `skill/SPEC.md`「重新构造」。非阻断 N1 套件实为 21 条；N2「不排序」与实现相反；N3 判别字段 `ok` 的缺省语义两读（`{ok:undefined,failure}`）；N4 D2-1 的代价只写在 docs，深度 5000 的参数树栈溢出后被吞为 `unknown`；N5 夹具约束不满足时是失败不是 `NotApplicable`；N6 第 79 行读作端口许可。待裁：D2-12、D2-5 数字词法、D2-1 可观测性。
