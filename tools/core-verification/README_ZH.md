# core-verification

本工具不再运行旧的公开面消费者。消费者源码、夹具和测试已从本包删除。`apps.0.0.1.legacy` 与 `packages.0.0.1.legacy` 留在仓库里供阅读。本包不导入它们。

`build` 只删除 `dist`。`typecheck` 和 `test` 只覆盖 `tests/legacy-suite-exit.spec.ts`。该测试核对清单没有旧包依赖，并且旧消费者文件不在。

新包的行为由拥有该包的成员自己验证。
