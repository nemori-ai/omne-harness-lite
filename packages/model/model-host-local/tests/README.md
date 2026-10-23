# tests

本目录维护单元与契约测试，仓库的测试责任与边界见[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 测试文件，`support/` 下的测试支撑，以及 `fixtures/` 下的固定输入。

## 边界

[credential.spec.ts](credential.spec.ts) 用真实文件系统、子进程和注入的文件系统故障覆盖五种解析结果、租户隔离、轮换与撤销、文件损坏、关闭、保存确认未知、文件锁、发布路径关闭文件描述符与跨进程更新，并在真实 Cordis 4.0.4 下核对注入发送。[custodian-options.spec.ts](custodian-options.spec.ts) 覆盖建库采用已有文件、诊断容量、锁等待与超时的 `ELOCKED` 代码、非锁错误、三种不可用原因及其 `cause`、快照字段类型不对判为损坏，以及选项取值的拒绝。[credential-service.spec.ts](credential-service.spec.ts) 核对服务实例只暴露 `present` 与 `resolve`，保管库不可达。[cordis-entry.spec.ts](cordis-entry.spec.ts) 核对插件的发布、空路径建库并服务、撤除、配置校验，以及损坏文件上 `present` 返回不可用与撤除不报错。[deliver-injected.spec.ts](deliver-injected.spec.ts) 在真实 Cordis 4.0.4 下核对注入发送不导入保管库、提供者缺席时不发送、撤除重装后恢复与结果不变、更替提供者与非服务对象。[public-entry.spec.ts](public-entry.spec.ts) 核对根入口的导出清单。

[send-resources.spec.ts](send-resources.spec.ts) 用观察凭据槽的传输工厂代替会离开进程的 pi 发送，核对槽只在 `start` 期间有值、正常返回与抛出后都为空、两个资源互不见对方的值、异物与释放后的物化传输被拒绝、`release` 与 `close` 幂等；它还用真实 pi 传输与 OpenAI 家族核对异物物化传输被拒绝，这一步只编码，不发送。[assembly.spec.ts](assembly.spec.ts) 核对装配对路由、网络、尝试容量与准备配置的拒绝，准备租约经配置的家族取得绑定，`close` 开始后的取得返回具名不可用，关闭前取得的租约在关闭后仍能计量并释放，以及 `close` 幂等。[local-model.spec.ts](local-model.spec.ts) 属于慢层：本地 HTTPS 服务只代替网关，回放两个家族录制的 SSE 正文；保管库、装配、发送边界、pi 传输、家族、model 运行时与内存 `ModelCommands` 都是真实实现。[continuation.spec.ts](continuation.spec.ts) 同属慢层，在同一组真实实现上让调用 X 收场、确认并清理，再经装配的 `preparation` 取得真实租约，用真实 `rules.plan` 与家族计量器计量延续 X 的请求，核对锚点、余量、方法名与跨租户的逐字节相同。[support/](support/) 里的 `records.ts` 经声明的开发依赖读取家族录制夹具，`https-server.ts` 起本地 HTTPS 服务并记录请求头与正文，`profiles.ts` 把家族记录的官方档案存成工厂档案，并给出测试用的 `supplierOf`，`local-host.ts` 为一次调用装配保管库、本地装配、内存 `ModelCommands` 与 model 运行时。`metering.ts` 用真实租约和租约自己的 `rules.plan` 计量请求，并读取账目里已知的用量。

`local-host.ts` 的运行时配置按真实回复设定。真实回复大约每个 token 一个事实。内存 `ModelCommands` 把调用的每个已确认快照都计入调用容量，而每个快照含有到此为止的全部块。所以运行时按批保存事实：一批最多 16 KiB 事实，或从该批首个事实起最多 100 ms。调用容量是整个内存存储的容量，因为一个宿主只有一个调用。逐个事实保存时，约一百个事实的真实回复会超出原来的 100 000 字节容量，调用不能收场（#466）。

真实请求的录制器在 [support/recorder.ts](support/recorder.ts)。它经 `local-host.ts` 的同一条装配路径发出一次请求，把收到的 SSE 正文原样写进回放件目录，并写一个旁注。录制器的规则如下：

- 正文取自 Node 的 `http.client.response.finish` 诊断通道。[support/body-tap.ts](support/body-tap.ts) 只包装目标请求那一个响应的 `push`，所以写下的是 Node 去掉分块编码之后交给响应流的字节。录制器不改装配，也不改传输。
- 录制器不写请求头、响应头与请求体。旁注 `recording.json` 只有 `model`、`payloadDigest` 与 `recordedAt`。`payloadDigest` 取自物化回执，是请求体的 SHA-256。
- 写入之前，[support/secret-scan.ts](support/secret-scan.ts) 检查正文与旁注。命中任一密钥模式时，录制器不写任何文件，拒绝结果只给出模式名。AWS 模式按访问密钥 ID 的完整格式匹配，因为单独的前缀会在加密推理状态的 base64 中偶然出现。
- 以下情形同样不写文件：状态不是 200，目标响应不是恰好一个，调用没有收场（拒绝结果给出失败的种类，不含细节），发出记录不是恰好一个，终止不是恰好一个，或要求推理状态的用例回复里没有推理状态。录制目录已经存在时，录制器在发送之前拒绝，不覆盖已有录制。
- 两个文件先写进同级的私有目录，再整体改名，所以录制目录要么完整，要么不存在。

[support/recording-cases.ts](support/recording-cases.ts) 定义四个用例：两家各一个带推理状态的首轮（`openai-reasoning` 用 `openai/gpt-5.6-sol`，`anthropic-reasoning` 用 `anthropic/claude-sonnet-5`），以及两家各一个延续首轮的第二轮（`*-reasoning-continued`）。第二轮的请求由三部分组成：首轮请求、首轮回复与下一个问题。首轮回复不随录制保存。录制器在本机起 HTTPS 服务，把首轮录制的正文经同一条装配路径回放并读出回复。回放的请求体摘要必须等于首轮旁注的 `payloadDigest`，否则录制器拒绝。

[recorder.spec.ts](recorder.spec.ts) 属于慢层。本地 HTTPS 服务分段写出回答，核对录制的字节与服务写出的字节逐字节相同，旁注摘要等于服务收到的请求体的 SHA-256。它还经本地 CONNECT 代理（[support/connect-proxy.ts](support/connect-proxy.ts)）核对同样的结果，并逐一核对上述不写文件的情形与第二轮的输入形状。它还用 pi-ai-openai 的真实网关流 `tests/fixtures/captured` 录制 `openai-reasoning`，核对首轮写出并带推理状态，第二轮把加密项连同真实 id 带回。[secret-scan.spec.ts](secret-scan.spec.ts) 属于快层，核对每个密钥模式、占位值放行，以及结果只含模式名。测试源码中的伪造密钥在运行时拼接，源码本身不含完整的密钥模式。

[live/record.spec.ts](live/record.spec.ts) 是录制器的真实入口。它只在 `OMNE_LIVE_TESTS=1` 并且 `OMNE_RECORD_CASE` 给出用例名时运行，否则在用例体内跳过。它读取以下环境变量：

- `OMNE_RECORD_CASE`：用例名。第二轮从同一输出根目录读取首轮录制，所以首轮必须先录。
- `OMNE_RECORD_OUT`：录制的根目录。缺省为 pi-ai-transport 的 `tests/fixtures/recordings/`。
- `OMNE_RECORD_TARGET`：网关源。缺省为 `https://openrouter.ai/`。
- `OMNE_RECORD_CA`：本地目标的证书文件。给出时，宿主只信任这个证书。
- `HTTPS_PROXY` 与 `NO_PROXY`：代理与直连列表。缺少 `HTTPS_PROXY` 时用例失败。

入口不读取任何凭据变量。保管库存占位值，代理把占位值换成真实凭据。

判定的行为由 model 的测试覆盖，这里只经保管库间接覆盖。这些测试不覆盖网络文件系统、跨机器的锁语义和崩溃后残留锁的自动恢复。持续运行的测试不发出经真实厂商或代理的请求，只有手动运行的录制器入口发出真实请求。慢层对两家各有一条回复含推理状态的调用，核对它收场。

## 维护

公开行为或 SPEC 条款变化时，同步对应测试与本目录 `index.md`。运行命令为 `pnpm --filter @omne-harness/model-host-local test`。

录制一个用例的真实请求，在仓库根运行：

```sh
OMNE_LIVE_TESTS=1 OMNE_RECORD_CASE=openai-reasoning pnpm --filter @omne-harness/model-host-local run record:live
```

这条命令发出真实请求，会产生费用。经 turbo 运行时，严格模式滤掉未声明的环境变量，入口总是跳过。

## 本包事实

测试通过不代替规格或验收。固定输入见 [fixtures](fixtures/index.md)，目前没有固定输入文件。
