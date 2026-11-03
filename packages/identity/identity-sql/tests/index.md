# tests 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖、替身与每个文件的义务
- [public-entry.spec.ts](public-entry.spec.ts)：公开入口
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：Cordis 绑定入口
- [operations-contract.spec.ts](operations-contract.spec.ts)：identity 契约套件
- [restart.spec.ts](restart.spec.ts)：重启
- [credential-storage.spec.ts](credential-storage.spec.ts)：秘密只以派生形式保存
- [register-transaction.spec.ts](register-transaction.spec.ts)：注册单事务与输入上界
- [standing.spec.ts](standing.spec.ts)：资格读口
- [stopped.spec.ts](stopped.spec.ts)：停止后
- [scrypt-mapping.spec.ts](scrypt-mapping.spec.ts)：scrypt 映射与假材料
- [governance-contract.spec.ts](governance-contract.spec.ts)：identity 治理契约套件
- [governance-negative.spec.ts](governance-negative.spec.ts)：治理套件的负控
- [last-admin-concurrent.spec.ts](last-admin-concurrent.spec.ts)：两位管理员并发互相移除，50 次
- [governance-restart.spec.ts](governance-restart.spec.ts)：撤销跨进程保留与从 001 升级
- [list-limit.spec.ts](list-limit.spec.ts)：名单上限
- [governance-mapping.spec.ts](governance-mapping.spec.ts)：治理提交结果的映射与空闲刷新
- [order-key.spec.ts](order-key.spec.ts)：时刻排序键
- [combination-version.spec.ts](combination-version.spec.ts)：组合版本覆盖参加者的导入闭包
- [governance-login-bounds.spec.ts](governance-login-bounds.spec.ts)：到期目标的撤销与签发时刻下界
- [fixtures/](fixtures/index.md)：夹具与子进程脚本
