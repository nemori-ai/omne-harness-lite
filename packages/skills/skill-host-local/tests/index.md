# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [conformance.spec.ts](conformance.spec.ts)：契约的来源符合性套件
- [snapshot.spec.ts](snapshot.spec.ts)：条目集合、根名与定位种类
- [links.spec.ts](links.spec.ts)：链接、根内判定、管道与套接字
- [permissions.spec.ts](permissions.spec.ts)：经注入接缝的权限类失败与错误分类
- [open.spec.ts](open.spec.ts)：`open` 对目录、文件之下的路径与管道的答复
- [race.spec.ts](race.spec.ts)：取快照后修改，无缓存
- [swap.spec.ts](swap.spec.ts)：读取期间条目被换成根外链接
- [encoding.spec.ts](encoding.spec.ts)：不是 UTF-8 的名字与路径，名字开头的 BOM
- [budget.spec.ts](budget.spec.ts)：一次遍历的访问预算，内存中的目录树
- [types.spec-d.ts](types.spec-d.ts)：失败类型封闭与运行时导出
- [public-entry.spec.ts](public-entry.spec.ts)：公开入口的运行时导出
- [examples.spec.ts](examples.spec.ts)：真实目录示例 `examples/directory-journey.ts` 作为测试运行
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：`skillPlugin` 在真实 Cordis `Context` 上的装载、端口缺席与换代、撤除与配置
- [scratch.ts](scratch.ts)：临时目录与目录树的测试辅助
- [fs-double.ts](fs-double.ts)：包装默认接缝、可注入拒绝的文件系统接缝
- [fixtures/](fixtures/index.md)：测试固定输入（不适用）
