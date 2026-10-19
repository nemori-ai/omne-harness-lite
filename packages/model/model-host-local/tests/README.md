# tests

本目录维护单元与契约测试，仓库的测试责任与边界见[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 测试文件，以及 `fixtures/` 下的固定输入。

## 边界

[credential.spec.ts](credential.spec.ts) 用真实文件系统、子进程和注入的文件系统故障覆盖五种解析结果、租户隔离、轮换与撤销、文件损坏、关闭、保存确认未知、文件锁、发布路径关闭文件描述符与跨进程更新，并在真实 Cordis 4.0.4 下核对注入发送。[custodian-options.spec.ts](custodian-options.spec.ts) 覆盖建库采用已有文件、诊断容量、锁等待与超时的 `ELOCKED` 代码、非锁错误、三种不可用原因及其 `cause`、快照字段类型不对判为损坏，以及选项取值的拒绝。[credential-service.spec.ts](credential-service.spec.ts) 核对服务实例只暴露 `present` 与 `resolve`，保管库不可达。[cordis-entry.spec.ts](cordis-entry.spec.ts) 核对插件的发布、空路径建库并服务、撤除、配置校验，以及损坏文件上 `present` 返回不可用与撤除不报错。[deliver-injected.spec.ts](deliver-injected.spec.ts) 在真实 Cordis 4.0.4 下核对注入发送不导入保管库、提供者缺席时不发送、撤除重装后恢复与结果不变、更替提供者与非服务对象。[public-entry.spec.ts](public-entry.spec.ts) 核对根入口的导出清单。

判定的行为由 model 的测试覆盖，这里只经保管库间接覆盖。这些测试不覆盖网络文件系统、跨机器的锁语义和崩溃后残留锁的自动恢复。

## 维护

公开行为或 SPEC 条款变化时，同步对应测试与本目录 `index.md`。运行命令为 `pnpm --filter @omne-harness/model-host-local test`。

## 本包事实

测试通过不代替规格或验收。固定输入见 [fixtures](fixtures/index.md)，目前没有固定输入文件。
