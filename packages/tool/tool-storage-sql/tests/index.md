# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [大 final 的实际 SQLite 容量回归](final-capacity.spec.ts)：生产单命令上限，含小结果对照；W3-A 实施中的失败用例。

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：公开入口与导入边界
- [ledger-store-conformance.spec.ts](ledger-store-conformance.spec.ts)：两组记录仓套件（G1、P01）
- [tenant-isolation.spec.ts](tenant-isolation.spec.ts)：租户隔离
- [reopen.spec.ts](reopen.spec.ts)：关闭再打开数据库文件
- [atomic-commit.spec.ts](atomic-commit.spec.ts)：原子提交与修订号冲突
- [host-history-independence.spec.ts](host-history-independence.spec.ts)：2000 次历史后新调用能启动，每次调用的宿主读数与历史无关，保留作用域记录不随调用增长，收场事实按键读一条记录（慢层）
- [retention-scope-lifecycle.spec.ts](retention-scope-lifecycle.spec.ts)：保留作用域的开放与已关闭两态在实际 SQLite 上成立：已关闭的记录跨重启保留，之后的 `plan`、`permit`、`adopt` 答 `closed`；作用域关闭后创建者仍能记下自己预留的停止，结束事实保留
- [ledger-asserts.spec.ts](ledger-asserts.spec.ts)：读集断言在 SQL 执行时评估，排队提交与两个连接的用例
- [start-coordinator.spec.ts](start-coordinator.spec.ts)：启动协调器在本仓上的三组套件与重建
- [materials.spec.ts](materials.spec.ts)：材料与组合有效性
- [participant.spec.ts](participant.spec.ts)：参加者模块自身的守卫
- [fixtures/](fixtures/index.md)：测试固定输入



