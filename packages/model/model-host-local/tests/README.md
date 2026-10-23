# tests

本目录维护单元与契约测试，仓库的测试责任与边界见[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 测试文件，`support/` 下的测试支撑，以及 `fixtures/` 下的固定输入。

## 边界

[credential.spec.ts](credential.spec.ts) 用真实文件系统、子进程和注入的文件系统故障覆盖五种解析结果、租户隔离、轮换与撤销、文件损坏、关闭、保存确认未知、文件锁、发布路径关闭文件描述符与跨进程更新，并在真实 Cordis 4.0.4 下核对注入发送。[custodian-options.spec.ts](custodian-options.spec.ts) 覆盖建库采用已有文件、诊断容量、锁等待与超时的 `ELOCKED` 代码、非锁错误、三种不可用原因及其 `cause`、快照字段类型不对判为损坏，以及选项取值的拒绝。[credential-service.spec.ts](credential-service.spec.ts) 核对服务实例只暴露 `present` 与 `resolve`，保管库不可达。[cordis-entry.spec.ts](cordis-entry.spec.ts) 核对插件的发布、空路径建库并服务、撤除、配置校验，以及损坏文件上 `present` 返回不可用与撤除不报错。[deliver-injected.spec.ts](deliver-injected.spec.ts) 在真实 Cordis 4.0.4 下核对注入发送不导入保管库、提供者缺席时不发送、撤除重装后恢复与结果不变、更替提供者与非服务对象。[public-entry.spec.ts](public-entry.spec.ts) 核对根入口的导出清单。

[send-resources.spec.ts](send-resources.spec.ts) 用观察凭据槽的传输工厂代替会离开进程的 pi 发送，核对槽只在 `start` 期间有值、正常返回与抛出后都为空、两个资源互不见对方的值、异物与释放后的物化传输被拒绝、`release` 与 `close` 幂等；它还用真实 pi 传输与 OpenAI 家族核对异物物化传输被拒绝，这一步只编码，不发送。[assembly.spec.ts](assembly.spec.ts) 核对装配对路由、网络、尝试容量与准备配置的拒绝，准备租约经配置的家族取得绑定（关闭后不变），以及 `close` 幂等。[local-model.spec.ts](local-model.spec.ts) 属于慢层：本地 HTTPS 服务只代替网关，回放两个家族录制的 SSE 正文；保管库、装配、发送边界、pi 传输、家族、model 运行时与内存 `ModelCommands` 都是真实实现。[support/](support/) 里的 `records.ts` 经声明的开发依赖读取家族录制夹具，`https-server.ts` 起本地 HTTPS 服务并记录请求头与正文，`profiles.ts` 把家族记录的官方档案存成工厂档案，并给出测试用的 `supplierOf`。

判定的行为由 model 的测试覆盖，这里只经保管库间接覆盖。这些测试不覆盖网络文件系统、跨机器的锁语义和崩溃后残留锁的自动恢复，也不发出经真实厂商或代理的请求。慢层对两家各有一条回复含推理状态的调用，核对它收场。

## 维护

公开行为或 SPEC 条款变化时，同步对应测试与本目录 `index.md`。运行命令为 `pnpm --filter @omne-harness/model-host-local test`。

## 本包事实

测试通过不代替规格或验收。固定输入见 [fixtures](fixtures/index.md)，目前没有固定输入文件。
