# W2 写回评审（review-docs，相对 ff17f7701）

对象：PR #1117（w2-writeback-skill，7aa026548 + reduce c2e418ec5）、PR #1118（w2-writeback-mcp，26d5c57a4 + reduce 2da4cf020、03505c68f）。

## 五面

- 落盘遗漏：写回清单每行要么写回要么有理由；10 条更正裁定全部落盘。建议 S-L1：`open` 答 `entry-unreadable` → `source-unavailable` 只在源码，契约与成员 SPEC 都没有条款——交 W3 prep。
- 表达：E-1 「资格与换代」先列三个任务操作再说例外；E-2 映射表键列混进理由；E-3 把实现方测试的两个夹具世界写成套件性质；E-4 时限起点在认证为 `none` 时不明确；E-5 不变式 6 一长段；E-6 「只有内存实现」缺时间范围。
- 断链：两棵工作树 `check:docs`/`check:design` PASS；新锚点逐个存在。
- 下层与上层：**阻断 B-1** 组页四处残留「第一波」内存实现说法；**阻断 B-2** Skill README `skill-host-local` 行残留「在第一波」。建议 L-1 `close()` 列表缺释放句柄一步；L-2 组页「模型」仍写 `ActionCatalog` 聚合与 `open()/markLost()/close()`（实现是 `Connection`/`InFlightCalls` 与 `attempt()/ready()/lose()`）——交组页拥有者作设计与实现差异记录。
- 图：无必要补图；建议 D-1 并发段加时序图；D-2 F-MC03 把四项核对拆成异步与同步两段。

## reduce 处置

- B-1、B-2、E-1、E-3、E-4、E-6、L-1 由 reduce 直接改（c2e418ec5、03505c68f）；E-2、E-5、D-1、D-2、L-2 记 W3 写回清单；S-L1 进 W3 prep。
- 两份写回合入父分支（#1117 → 3248c271a，#1118 见补记）。
