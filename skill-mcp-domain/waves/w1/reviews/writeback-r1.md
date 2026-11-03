# 写回评审（review-docs，第 1 轮，相对 c247b873a）

只读子代理，五面。对象：PR #1112（w1-writeback-skill，68102be46 + 7add84807）、PR #1113（w1-writeback-mcp，c03889ba7 + 041b2a131）。

## 落盘遗漏

阻断（都在写回清单漏列的 `key-flows.md`）：
1. `packages/mcp/docs/key-flows.md:139`：任务操作「都带 access，核采用、核资格」是被 M3-17/S2 取代的旧说法；缺 `provideTaskInput`、`cancelTask` 例外、`effect-unknown(no-connection)`。
2. `packages/mcp/docs/key-flows.md:12–13、35`（F-MC01 图）：`acquire` 交回对端账号、先取句柄再组键，与 K1 矛盾。
3. `packages/skills/docs/key-flows.md:15–18、40、117`（F-SK01 与读取时序图）：`snapshot` 失败集合仍是旧的封闭集合，缺 `entry-unreadable`、`outside-package` 及其两侧映射（E10、S3-6、S3-4）。

建议：Skill key-flows `inspect(locator, { expectedName? })`、C22′ 例外、`aborted` 分支；Skill 组页快照行与 `DirectorySource` 第 1 步（`sealSnapshot` 收字节算事实、`invalid-root-name`、进程内单实例）；组页 66 行补 C18（无框架用例列表）；MCP 领域页 48 行与领域 key-flows F-MC04 表补 `provideTaskInput`/O2；两份 SPEC 差异表已成过程状态（行号偏移、「随后写回」），建议改为节锚点并标已写回——归成员 SPEC，W2。

写者自述未写回项（S7 四态、D4、`actionName`、Q-MC06）核实都不在差异表里，不算遗漏；已记 W2 检查项。被更正的五项裁定在差异内全部落实。

## 表达（建议）

「W1」过程标签进正文状态句（四处）→「第一波」；Skill README 把已接受的 `skill` 类别端口也写成候选 → 分开写；「尚未技术接受」与「尚未取得技术接受」不一致；三处用被删旧概念的否定下定义（组页 428、316、546）；Skill 组页 239 行后摘要与本页自有要求分不清。

## 断链

两棵工作树 `check:docs`、`check:design` 均 PASS；新引用的 25 个 SPEC 锚点全部存在。

## 下层与上层

无矛盾。记录一处先前就有的张力：`docs/domains/mcp/README.md:27`「连接时限和调用时限分别维护」vs 组页 427、603「本组不设调用时限，由 `signal` 给出」。

## 图

必要：F-MC01 图改成 `peerAccountOf` → 组键 → 复用或新建 → `acquire` 只交句柄；F-SK01 两图补 `snapshot` 两答复与 `aborted` 分支。建议：状态口任务操作取连接的判定图；两种凭据句柄流向的时序图（本波不加）。

## 处置

第 2 轮修复：两写者各在原分支补一个提交，修 3 处阻断 + 建议中的小项（见 SendMessage 简报）；SPEC 差异表改法与新图留 W2。
