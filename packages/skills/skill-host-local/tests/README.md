# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

说明每类测试用到的真实依赖与替身。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。

## 本包事实

测试使用 `mkdtemp` 在系统临时目录下建的真实目录，每个用例建自己的目录，用例结束时删除。权限类失败经 `fs-double.ts` 注入的接缝制造，不依赖文件权限位，所以以 root 运行也有效。`fs-double.ts` 包装来源的默认接缝，所以替身与默认接缝履行同一份契约。读取期间的替换由替身在确定的一步之后执行。访问预算的用例使用内存中的目录树，不写出 65536 个文件。命名管道用 `mkfifo` 命令建，主机没有这个命令时该用例跳过并标为 NotApplicable。套接字用 `node:net` 的 unix socket 建。测试经包名导入 `dist`，所以先运行 `pnpm run build`。`examples.spec.ts` 在一个临时目录里放两个合法包与一个非法包，运行 `examples/directory-journey.ts`；读取判定与对应是 `@omne-harness/skill-contract/testing` 的内存替身，读者的租户是替身不读的占位值，`@omne-harness/skill` 经 devDependency 取用。义务与测试的对应见 [SPEC「组合与验证」](../SPEC.md#组合与验证)。
