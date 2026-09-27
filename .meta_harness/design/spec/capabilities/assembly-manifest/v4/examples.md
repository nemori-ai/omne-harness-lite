# 规范实例：走通的路径与每个失败值的反例

属于 `capability.assembly-manifest` v2 的规范工件。本契约**不附 Schema**，这里是**操作层面的输入 → 预期结果 → 依据条款**。

- **标识只是占位**：`s1`、`e1`、`t1` 不承诺任何词法（`data.identity-values/v1#S-31`）；`tN` 按时间先后。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。
- **记录写成** `⟨evaluation, tables, content⟩`；`tables` 只写 `类别@filledAt`，构成与内容只写种类——**它们的形状归写入方**（会话资产注册表），本契约原样存。

## 1. 装配、reload、收窄

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `readHead(s1)` | `{ head: 0, latest: {} }`——空列是读得到的事实；注册表据此答它自己的 `sessionNotFound` | [S-5](contract.md#s-5-一个会话一列换表记录) 第 3 条 |
| 2 | `append(s1, 0, ⟨given{e1}, {tool@t1, skill@t1, slash_command@t1, loop_extension@t1, mcp@t1, plugin@t1}, 装配⟩)` | `{ seq: 1, evaluationRef: e1, head: 1 }` | [S-17](contract.md#s-17-append条件追加一条换表记录) |
| 3 | 人发 `omne-official:reload-slash_command`：`append(s1, 1, ⟨mint, {slash_command@t2}, reload⟩)` | `{ seq: 2, evaluationRef: e2, head: 2 }`，`e2` 由本能力铸 | [S-8](contract.md#s-8-求值引用-evaluationref) 第 3 条 |
| 4 | 一条 ③ 型命令失败：`append(s1, 2, ⟨reuse{e2}, {slash_command@t3}, 自动刷新⟩)` | `{ seq: 3, evaluationRef: e2, head: 3 }` | 同上第 4 条 |
| 5 | `readHead(s1)` | `head: 3`；`latest.slash_command` 是序号 3、`latest.tool` 是序号 1 | [S-16](contract.md#s-16-readhead读头与每一类最后一条) |
| 6 | 一次尝试的报告依的是 t2 那份，此后被顶替：`readHistory(s1, slash_command, t2)` | 序号 2 那一条 | [S-18](contract.md#s-18-readhistory按表时刻读回一条) |

## 2. 装配那一次的回执丢了

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `append(s9, 0, ⟨given{e7}, {…@t5}, 装配⟩)`，写下之后回执丢了 | —— | —— |
| 2 | 以同样参数重交 | **`alreadyRecorded{record: 序号 1 那一条}`**——不看期望头；什么都没写 | [S-8](contract.md#s-8-求值引用-evaluationref) 第 2 条、[S-17](contract.md#s-17-append条件追加一条换表记录) ⑦ 与末段 |
| 3 | 另一种时序：第 1 步收到 `unavailable` | 结果未知；重交得成功即上次没写、得 `alreadyRecorded` 即上次已写 | [S-22](contract.md#s-22-回执丢失与结果未知) 第 1 条 |

## 3. 两路并发：旧实例在途的 reload 与新实例的换表

接第 1 节（头为 3）。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | 旧实例 `append(s1, 3, ⟨mint, {tool@t4}, reload⟩)`；新实例同时 `append(s1, 3, ⟨mint, {mcp@t4'}, reload⟩)` | 恰一路 `seq: 4`；另一路 **`headMismatch{head: 4}`**，什么都没写 | [S-12](contract.md#s-12-条件追加判定与写入是同一步) 第 3 条 |
| 2 | 落败的那一路 `readHead(s1)`、按清单重建、重算、以 `expectedHead: 4` 再交 | 成功，`seq: 5`（重做是写入方的事） | [S-3](contract.md#s-3-本契约明确不承诺什么) |

## 4. 依赖在场

装配给出的事实：对 `s1`，`svc-a` 在场、`svc-b` 不在场；`svc-c` 没有事实。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `dependencyPresence(s1, [svc-a, svc-b])` | `{ presence: { svc-a: present, svc-b: absent } }` | [S-19](contract.md#s-19-dependencypresence依赖名此刻在不在场) |
| 2 | `dependencyPresence(s1, [svc-a, svc-c])` | **`unavailable`**：`svc-c` 判不出，整次不答；**不是 `svc-c: absent`** | 同上 ⑧、[S-10](contract.md#s-10-在场事实) 第 1 条 |

## 5. 每个失败值的反例

| 失败值 | 调用 | 为什么 |
|---|---|---|
| `invalidInput` | `append(s1, ⟨mint, {tool@t9}, …⟩)`（缺 `expectedHead`） | **不补成「不管头」** |
| `invalidInput` | `append(s1, 3, ⟨mint, {}, …⟩)` | `tables` 为空 |
| `invalidInput` | `append(s1, 3, ⟨mint, {session@t9}, …⟩)` | 类别不合 `data.asset-model/v3#S-1` |
| `invalidInput` | `append(s1, 3, ⟨…⟩)` 且记录带了 `seq` | 序号由本能力给 |
| `invalidInput` | `dependencyPresence(s1, [])`、`dependencyPresence(s1, [svc-a, svc-a])` | 空、重复 |
| `alreadyRecorded{record}` | 第 2 节第 2 步 | 同一会话同一个 `given` 引用 |
| `evaluationRefConflict` | `append(s2, 0, ⟨given{e1}, …⟩)` | `e1` 已指认 `s1` 的记录 |
| `evaluationRefConflict` | `append(s1, 3, ⟨given{e2}, …⟩)` | `e2` 是本能力铸的，指认的是 `mint` 那一条 |
| `recordNotFound` | `append(s1, 3, ⟨reuse{e7}, …⟩)` | `e7` 不指认 `s1` 的记录 |
| `recordNotFound` | `readHistory(s1, tool, t2)` | 序号 2 那一条不含 `tool` |
| `headMismatch{head}` | 第 3 节第 1 步落败的那一路 | 期望头已过时 |
| `filledAtNotIncreasing{categories}` | 头为 3 时 `append(s1, 3, ⟨mint, {slash_command@t2}, …⟩)` | `slash_command` 上一条是 t3，t2 不大于它 |
| `unavailable` | 清单存储读不到时的任一操作 | **读不交回头 `0`、空映射或 `recordNotFound`**；`append` 结果未知（[S-22](contract.md#s-22-回执丢失与结果未知)） |

## 6. v3 求值投影的读取

以下为规范场景，**不表示已经执行**。`E1`、`E2`、`E3` 必须分别由真实 `evaluate(I1)`、`evaluate(I2)`、`evaluate(I3)` 的成功结果取得；输入均为相应版本合法 `EvaluationInput`。`O1`、`O2`、`O3` 是调用者明确给出的各自 composition 全排列。表示层的负例可以故意经旧追加面保存畸形投影，但不得把这些负例当生产求值来源。

| 步 | 已成立事实或调用 | 预期 |
|---|---|---|
| 1 | A 可读、从未追加，`readEvaluation(A)` | `recordNotFound`；`readHead(A)` 仍为成功的头 0 |
| 2 | A 追加合法 `given{R1}`，content 带 E1/O1，随后读取 | `{evaluationRef: R1, evaluation: E1, compositionOrder: O1}`，数值逐值无损 |
| 3 | A 局部 reload 只换一类表，追加 `mint` 带 E2/O2，根设置已改变，返回 R2 | R2/E2/O2 |
| 4 | A 收窄另一类仍以 E1 为基准的旧表，追加 `reuse{R1}` | `readEvaluation` 仍为 R2/E2/O2；`readHead`/`readHistory` 保留该旧表的 R1/E1 来源，不改写历史 |
| 5 | 继续提交 E3/O3，与读取并发 | 固定当前头的同一读视图内，只能为 R2/E2/O2 或 R3/E3/O3 的完整三项；不可读取上界外的提交，不可拼接；只读不写 |
| 6 | B 有自己来源，A 读源失败 | A 为 `unavailable`；不借 B 的结果回答 |
| 7 | 用损坏注入让 A 已选定的最新新求值源确定缺失 | `recordNotFound`；这是确定缺源，不等于普通存储读失败，不因此重选较早 E1 |
| 8 | A 新追加 `given{R4}`，content 为合法 JSON `{}` | 原 append 成功，原 readHead 原样返回；readEvaluation 为 `unavailable{reason: invalid_evaluation_content}`，不回退任何较早合法源 |
| 9 | 同样将 content.evaluation 置为不合 S-8 的值，或让 compositionOrder 缺项、重复、有额外项 | 同一个具名不可用诊断，没有部分成功 |
| 10 | 请求缺少会话身份 | `invalidInput`，不从当前租户或上次会话补 |
| 11 | 不同类别的各自 `filledAt` 均递增，但跨类别时刻大小与新求值的提交序号不一致 | 按 `seq` 最大选源，不按时刻；两种排序必须由此反例区分 |
| 12 | 各层配值改变、尚未提交新的 `given`/`mint` | 本面仍回答最近已提交结果，不能宣称当下层配值已核实；运行时每次发出的新鲜输入另由其契约兑现 |

原追加的严格 JSON 要求仍生效：重复对象键必须拒绝；数字不得舍入。`content` 是合法 JSON 但不构成求值投影，与输入连严格 JSON 都不成立，是两个不同阶段。

默认重试与时限的组合验收沿 [S-35](contract.md#s-35-投影缺席与畸形不能成为成功求值)：来源输入、真正求值、写方提交、读方消费均须有实际证据。一次成功 `append`/读回只能证明记录读写，不能独自证明模型锁或运行时设置已有产品生产者。

## 7. v4 固定头读取最后 given

规范操作见 [S-36](contract.md#s-36-readgiven固定上界内最后的给定求值记录)，规范证据义务见 [S-37](contract.md#s-37-固定上界与原记录的规范场景)。以下均为待执行期望。G1/G2 是原完整 S-6 记录，E/O 沿第 6 节真实生产条件；不是新增 DTO。T1～T10 是各类别严格递增的真实 Instant。

| 步 | 输入／已提交事实 | 预期与不可替代关系 |
|---|---|---|
| 1 | `readHead(A)` 得 0；`readGiven(A,0)` | `none`，无写入；不是 recordNotFound |
| 2 | A seq1 `given{F1}`，六张表、完整 E1/O1/assembly | `readGiven(A,1)` 返回 G1 全壳、全部表和全部 content |
| 3 | A seq2～7 依次六类 reload，各自 mint，最后 E7；seq8 收窄仍依 E1 的表为 reuse F1 | `readHead(A)` 为 H=8，latest 可全无 G1；`readGiven(A,8)` 仍为 G1，readEvaluation 为最近 mint E7，收窄表历史仍 E1 |
| 4 | 关闭/重开后沿同公开调用读取 | G1 的 seq/ref/表/内容严格不变，不依赖旧实例定位缓存 |
| 5 | 已取得 H=8，另一调用以新 given F2 成功追加 G2 为 seq9 | `readGiven(A,8)` 仍 G1；`readGiven(A,9)` 为 G2。原头上界不会被当前头9替换 |
| 6 | B 的头与 A 相同，B 有另外的 given | `readGiven(B,H)` 只选 B；不得按裸 seq 或 ref 文本解析去 A 找 |
| 7 | 新会话 C 只提交合法 mint、其头1 | `readGiven(C,1)` 为 none；MF 并不要求首条一定 given |
| 8 | 参数头缺席、负数、1.5、true、字符串；即使存储不可用 | `invalidInput`，请求表示检查在读之前 |
| 9 | A 实际头9，请求 head10 | 先实读：可读则 invalidInput；无法读出实际头则 unavailable，不能猜范围 |
| 10 | A seq10 given F3 的 content={}；此前 G2 合法 | append/head/history 原样成功；`readGiven(A,10)` 为 `unavailable{reason: invalid_evaluation_content}`，绝不返回 G2 |
| 11 | 所选 given 壳/ref/会话损坏或记录不可读，或不能核选择完整性 | unavailable，不归 none、不回退、不修复 |
| 12 | 所选 given 投影合法，但 filledBy 不是 assembly 或 tables 只有一类 | MF 按本范围原样返回完整记录；AR 固定根消费者必须自己判用途不合格 |
| 13 | 所选 E 中合法数值含 9007199254740993 与 0.10000000000000000001；数组次序不同或 true 与1 | 数无损，数组有序、布尔与数字不同；重复对象键不是合法严格输入；对象成员重排不改变值 |

负控分别把选择改成“最近 given/mint”“忽略输入 H”“最新非法则回退”“跨会话最大 seq”“不可读当 none”“G1 壳配 G2 内容”，必须被上述期望否定。任何成功/none/失败都不得增加记录、铸引用或推进头。
