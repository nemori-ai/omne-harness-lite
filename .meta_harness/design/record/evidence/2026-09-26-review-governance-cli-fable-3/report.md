Write 不可用，直接给出结论。三项处置均已按源码核对完毕。

**结论：三项 P3 处置成立，未发现新的阻塞性反例。**

**P3#1 成立，记作已记录限制。** `apps/tenancy-host/deploy/README.md:42` 的四句话与 `workspace.ts:63-77` 的 mkdir→取锁→marker 顺序逐一对应。竞态下 A 得 busy、B 得 unavailable，"after both refuse" 准确；"a crash during initialization can do the same" 准确；"已 marked 根并发被拒为 busy" 对应第 72-75 行。第 44 行"root or marker is damaged 则保留改选新路径"覆盖了 marker 写到一半的情形。首次创建竞态本身未消除，README 也未宣称消除。

**P3#2 成立。** `boot.ts:345` 只说 "remains / restoration is not confirmed"，不再说恢复失败。`failure.ts:14` 与 `:36` 注释同步。新测试 `maintenance-startup.spec.ts:91-158` 是真实子进程，preload 让 marker 句柄 close 抛错且 fd 仍开，走 `workspace.ts:132` 的 Incomplete，再到 `owner.ts:233-241`；无注入时子进程会正常起来并被 15 秒 SIGKILL，所以 exit 1 的断言确实依赖注入生效。断言的 "ownership is retained" 是三条保留路径共有文本，"restoring the upgrade snapshot failed" 排除断言指向旧措辞。快照位置 `${file}.upgrade-snapshot` 与 `sqlite/owner.ts:41` 一致。重启恢复依赖 marker 已 writeFile+sync 后才 close，成立。依赖 `dist/cli.js` 与既有 process spec 一致。

**P3#3 成立。** `owner.ts:333-360` finish 先存具名恢复错误，release 抛出时以 AggregateError 保两 cause，否则单抛。`abortStartup:289-315` 同样保 result 与 inspection/release 错误。组合测试两支：startup 支走 abortStartup（marker 由 markIfAbsent 落下，snapshotOnDisk 为真），dispose 支走 `provider.ts:211` 的 finish；spy 打在 prototype 上，`open.ts:50` 用 `new SqliteOwnerSite` 构造，spy 可生效；"实际 release 后再抛"由包装真实 lock 实现。

**残留观察，均非本次范围、不阻塞：**
- `owner.ts:285-286`：非 maintenance 路径（host 不走）句柄关闭失败后 release 再抛会覆盖 closeError，同类双失败，未在此次修补内。
- `boot.ts:345` 的 "remains at" 在 `guard.pending()` 看不清磁盘的 catch 分支（`guard.ts:130-132`）是推断非观测，措辞略超一点。

**实际读过：** r2 报告；deploy README 全文；boot.ts 120-380；failure.ts 全文；maintenance-startup.spec.ts 全文；upgrade/owner.ts 全文；upgrade-failure-combination.spec.ts 全文；maintenance/workspace.ts 全文；maintenance/failure.ts 全文；sqlite/owner.ts 55-125、185-231；guard.ts、provider.ts、open.ts 只 grep 相关片段。

**未覆盖：** 未看 git diff，只看当前文件态；未重读 lock.ts、resources.ts、Hosts 测试支撑；未运行任何测试，两份日志与 typecheck-r2 按用户陈述采信；D057r2 制品未看。
