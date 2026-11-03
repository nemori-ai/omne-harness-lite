# w2-skill-host 第 1 轮评审（head dc81dff83，基线 b0f2ec7fb）

## 交付边界（review-delivery，只读子代理）

- 验收 1–7、9 达到；8 部分：lint:rules/oxlint/format:check 通过，preflight 的 acceptance:lock 与 CRLF 计数 2 是基线既有（主线合入的 7 个验收锁违规提交；legacy 目录两份 LICENSE），本闭包未碰相关文件。
- 写范围越界：空。四个提交作者 PanQiWei，trailer 只有 Harness/Agent-Role。
- 写者 15 条自定裁定：14 条在授权内；第 9 条（`open` 的 ENOTDIR/EISDIR → `entry-not-found`）吞掉「根是普通文件」的情形。
- **阻断 B1**：`open` 在根是普通文件时答 `entry-not-found`，已定事项 12、README 映射表与契约 SPEC 都要求 `package-not-found`。原因 `walk.ts` `readEntry` 没有核对根是目录。
- 建议：补用例与变异；README 表补 EINVAL/ENXIO；目录链接规模上限留后续义务。

## reduce 处置

- B1 是指到文件:行的单点修复，按 `delegate`「何时不派」由 reduce 自己改：`resolveRoot` 合并「解析」与「是目录」核对（snapshot 与 open 共用，一处），补用例「根是普通文件时 open 答 package-not-found」。变红证明：还原源码并重新构建后该用例红（1 failed / 3 passed），修复后 4/4 绿。提交 786c4a70b（Agent-Role: main）。
- 第一次变红核对无效（用例 import 的是含修复的 dist）——记入范式：**证明变红时要重新构建被 import 的 dist**。
- 读数与变异链在 786c4a70b 重跑（`tmp/reduce/r2/`）。

## 正确性 + 设计与实践（只读子代理，head dc81dff83）

- 核对为对的：根外判定按段比较（根是链接时以解析后为准）；悬空/成环分类；权限分类；不缓存；`open` 忽略 digest 由契约 PS7 允许；非阻塞读（O_NONBLOCK + stat）正确；无 as/any/class。
- **C1 阻断**：非 UTF-8 文件名有损解码 → ENOENT → `unavailable`，永久缺陷报成瞬时失败（复现）。
- **C2 高优先（安全）**：readdir 之后、readFile 之前条目被换成根外链接，根外字节进快照（confused deputy）。
- C3：链接扇出指数级（N=14 → 32768 次访问 7.3 s，N=18 超 300 s）；无上限。
- C4：链接列出后消失被判悬空（entry-unreadable）而非 unavailable。
- C5：遍历次序是逐目录按名排序的深度优先，不是全路径序；确定但措辞要准。
- D1 分类表散在三处；D2 接缝替身不履行「拒绝非普通文件」义务；D3 竞争才会出现的错误码没有用例（删表项不变红）；D4 测试基本断言外部行为；D5 SPEC 没先写判据与反例；D6 返回类型与可变累积数组。

## reduce 裁定与第 2 轮

- C1、C2 判阻断；C3 裁定遍历预算 65536 次访问 → `entry-unreadable`；C4、D1–D3、D5、D6 一并进第 2 轮。续用原写者（同闭包、原范围内补做）。追加记录已写进闭包规格。

## 第 2 轮增量复审（只读子代理，head a5be03d1c）

- 11 条追加全部闭合（C2 逐项核源码：每条目 realpath → isWithin → lstat；O_NOFOLLOW + fstat；旧码 3 条红的摘要正是根外 `secret` 的 sha256）；7 条自定裁定成立；无新阻断。
- 建议：S1 导出 `Opened`/`EntryKind`，`readFile` 语义已是「不跟随链接地打开并报种类」，可改名 `open`；S2 根外 + 非 UTF-8 时先解码失败答 `entry-unreadable`（SPEC 写明次序即可）；S3 大文件经 2^k 条链接路径到达会读 2^k 次，README 补一句；S4 台账引用 C3 证据用变异文件而非 r2-C3.txt。
- reduce 处置：放行。S1 的类型导出与 S3 的 README 句由 reduce 在链跑完后补一个小提交；改名留给 W3（公开形状，先让 `@omne-harness/skill` 的示例接上再定）。
