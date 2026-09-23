# `@omne-harness-lite/tenancy-host`

治理中心作为一个可部署应用的装配：一个进程、一个 Cordis 根 Context、八条 fiber
（storage-sql → clock → credential-verification → account-identity → organization-governance → account-registration
→ governance-center-ops → governance-center-entry），迁移合成与升级守卫，两步开闸，逆序撤除。
设计、选择理由与证据义务归实现映射节点
[`realization/apps/tenancy-host`](../../.meta_harness/design/realization/apps/tenancy-host/README.md)；
本页只写**怎么起、怎么停、怎么配、运维要守什么**，以及源码取了哪些常量。

## 命令

```sh
pnpm --filter @omne-harness-lite/tenancy-host run build          # 先 build 全部依赖包：pnpm run build
node apps/tenancy-host/dist/cli.js keygen <directory>            # 一次性生成两对部署密钥
node apps/tenancy-host/dist/cli.js serve                         # 从环境变量起治理中心
```

| 子命令         | 行为                                                                                                                                                     | 退出码                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `keygen <dir>` | 写四份 Ed25519 PEM（`0600`，目录不存在即以 `0700` 建出）；标准输出一行 JSON 给出四个 `_FILE` 变量与路径，**不含密钥内容**；四份里任一已存在 ⇒ 一份都不写 | 0 成功；1 已存在或写失败；2 用法错误                       |
| `serve`        | `boot()`；收到 `SIGTERM`／`SIGINT` ⇒ 按装载逆序撤除 ⇒ 退出                                                                                               | 0 撤完；1 启动失败或撤除总超时（30 s）内没撤完；2 用法错误 |

**本版不轮换密钥。**重生密钥等于换钥：两步之间的注册与清除会以契约已定义的方式收场（重来即可），但换钥必须在中心停着的时候做。

## 配置（环境变量）

`X` 与 `X_FILE` 恰设其一（`_FILE` 给文件路径）；空值按未设处理。任何一项缺、二义、读不到、权限过宽、解析不了 ⇒ **启动失败**，
失败说明点名是哪一项、不含值。

| 变量                                                                                                                                                                   | 内容                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `OMNE_TENANCY_STORAGE_DIALECT`                                                                                                                                         | `sqlite`（缺省）或 `postgres`                                                      |
| `OMNE_TENANCY_STORAGE_FILE`                                                                                                                                            | sqlite 库文件路径（`:memory:` 被拒）                                               |
| `OMNE_TENANCY_STORAGE_URL`                                                                                                                                             | pg 连接串（方言为 `postgres` 时）                                                  |
| `OMNE_TENANCY_ACTIVATION_SIGNING_KEY_PEM[_FILE]`、`…_ACTIVATION_VERIFICATION_KEY_PEM[_FILE]`、`…_PURGE_SIGNING_KEY_PEM[_FILE]`、`…_PURGE_VERIFICATION_KEY_PEM[_FILE]`  | 两对部署密钥；文件对 group／other 可读 ⇒ 启动失败；两对不配对 ⇒ 起插件之前启动失败 |
| `OMNE_TENANCY_UNACTIVATED_RETENTION`、`…_INVITATION_TTL_DEFAULT`、`…_AFFILIATION_REQUEST_TTL_DEFAULT`、`…_COPY_NOTICE_TTL_DEFAULT`、`…_SHARING_INVITATION_TTL_DEFAULT` | 五项部署参数：正整数毫秒或 ISO 8601 时长（`P7D`）；同一组值进各插件与完整体检      |
| `OMNE_TENANCY_TEAM_CREATION_KEY_RETENTION`                                                                                                                             | 团队创建键保留期（同上格式）                                                       |
| `OMNE_TENANCY_CLOCK_READY_TIMEOUT`                                                                                                                                     | 启动时等中心的钟可读的上界，**必须大于时钟租约宽度 10 s**                          |
| `OMNE_TENANCY_CREDENTIAL_POLICY`                                                                                                                                       | 凭据政策 JSON；缺席不是启动失败（此时注册一律得 `credential-rejected`，契约 S-27） |
| `OMNE_TENANCY_ENTRY_LISTEN`                                                                                                                                            | 客户端一面的 `host:port`（IPv6 写 `[addr]:port`），无缺省端口                      |
| `OMNE_TENANCY_ENTRY_TLS_CERT_CHAIN_PEM[_FILE]`、`OMNE_TENANCY_ENTRY_TLS_PRIVATE_KEY_PEM[_FILE]`                                                                        | TLS 证书链与私钥（不是部署密钥）；私钥文件对 group／other 可读 ⇒ 启动失败          |
| `OMNE_TENANCY_OPS_SOCKET_DIR`                                                                                                                                          | 运维面套接字目录（绝对路径）；套接字是其中的 `governance-center-ops.sock`          |

scrypt 派生参数取 credential-verification 的缺省（N = 2^17、r = 8、p = 1），本版没有来源变量。

## 日志

全部记录以**每条一行 JSON** 写到标准错误流（落文件、轮转与保留交给进程管理器）：
`{"ts","level","name",…}`。本装配自己的记录（`name: "tenancy-host"`）是结构化字段，按 `event` 区分：
`manifest-active`、`upgrade-confirmed`、`upgrade-irreversible`（warn，U-3）、`open-signal`、`serving`、`fiber-disposed`、
`dispose-incomplete`、`disposed`，以及**每次启动失败恰一条** `startup-failed`（`stage`、`item`、`errorType`、`message`，恢复失败时另有 `snapshot`）。
其余插件的记录按 Cordis 的格式化规则成一行 `message`。导出阈值到 WARN（Cordis 缺省只到 INFO，warn 会被静默丢掉）；debug 不导出。

`startup-failed.stage` 的取值：`config`、`key-pairing`、`occupied`、`restore`、`preflight`、`snapshot`、`migration`、`storage-open`、
`manifest`、`plugin`、`clock-unreadable`、`upgrade-confirm`、`serving-timeout`、`upgrade-unconfirmed`（含义见 `src/failure.ts`）。

## 运维约定

节点内防不住、只能靠部署与运维守的几条（design「运维约定」「实施缺口」，PF-017 §6.7／§6.8／§6.9）：

1. **生产库不得被非守卫实例打开。**一致性夹具、命令行工具、误配的第二个部署都算：它们不取独占、不看快照，可能在一次尚未确认的升级脚下写库
   （那些写随后被恢复撤掉），或在属主恢复快照时握着被替换掉的文件。两个 `serve` 进程之间的排他由存储的属主锁保证（后起的那个于 `occupied` 启动失败）。
2. **库文件与其中 `clock_lease` 一行不得手工改动，租约表不得删。**删了它，「时间不往回走」就失去依据。
3. **不要直接打开升级快照文件**（`<库文件>.upgrade-snapshot`）：以 sqlite 打开它会在旁边生出 `-wal`／`-shm`，恢复时不处理它们。
   要看快照里有什么，先复制一份再打开副本。快照在「一次升级尚未确认」时才存在；中心停着时看到它，下一次启动会先把库恢复成它。
4. **磁盘要多容纳一份库的大小**：有待跑迁移时，迁移之前先建一份完整快照；确认之后删除。
5. **权限**：运维面套接字目录只属于中心的运行用户、组与其他用户没有任何权限位（否则启动失败，中心不替你改）；
   四份部署密钥与 TLS 私钥文件 `0600`。
6. **断电边界**：sqlite 以 `synchronous=NORMAL` 运行（D-027）。**中心进程自己崩掉或被强行结束（机器照常开着）不丢任何已答复成功的事**；
   **机器断电或操作系统崩溃**之后，崩溃前最后一段已答复成功的事可能不在（中心空闲时这一段可能长到约一小时），且不会出现半份——
   刚注册的账号、刚发的邀请、刚完成的加入与切换可能要重做，**刚退出或撤销的登录状态可能又有效了**，刚移出的成员可能回来了（PF-017 §6.7、§6.8）。
   机器断过电，运维者应告诉同事把断电前不久做的退出、撤销与移出再做一次。
7. **同步驱动下热循环会饿死定时器**：`node:sqlite` 是同步驱动；请求都经 I/O 到达，天然让出事件循环。不要在进程里挂别的忙循环任务。
8. **升级 = 停着的时候换一个版本再启动。**sqlite 上确认之前的任何启动失败都把库恢复到升级前，旧版本照常能起；
   **确认之后开闸那一刻钟读不到**（`serving-timeout`，缺口 U-4）是已接受的残余情形：库已是新版本、旧版本起不来——**核过钟再用同一版本重启**。
   **pg 上迁移提交之后的失败撤不回**（缺口 U-3，本版无手段）：启动日志会有一条 `upgrade-irreversible`。
9. **网络边界**：`OMNE_TENANCY_ENTRY_LISTEN` 默认只填本机或私有网络地址；公网暴露须有前置的网络边界（入口契约不承诺限流与登录试探防护，注册与登录对任何能到达端口的连接开放）。第一版按「自己人开发与实验」定基调（D-029）：登录状态没有寿命、只有撤销，出实验之前那一条必须先闭合。
10. **停机**：`SIGTERM` 后入口层先停收、在途请求至多排空 10 s，再逐个撤其余七条；30 s 内没撤完即退出 1 并记下没撤完的插件。

## 实现映射：本装配的常量

| 量                              | 取值                                     | 约束                                                                     | 源码                                 |
| ------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| 入口层排空上界 `drainTimeoutMs` | 10 s                                     | 须小于撤除总超时（启动时核）                                             | `src/manifest.ts` `DRAIN_TIMEOUT_MS` |
| 撤除总超时                      | 30 s                                     | 盖住入口层排空 10 s + 运维面撤除 3 s + 存储关闭                          | `DISPOSE_TIMEOUT_MS`                 |
| 等 `serving` 的上界             | `OMNE_TENANCY_CLOCK_READY_TIMEOUT` + 1 s | 盖住入口层开闸那一刻再读钟的上界（入口层用同一个 `clockReadyTimeoutMs`） | `SERVING_GRACE_MS`                   |
| 日志导出阈值                    | WARN（2）                                | basis `logger-level-order-error-lowest`                                  | `src/log.ts`                         |
| 中心版本 `version`              | 包版本 `0.0.0`                           | 构建常量，测试核与 `package.json` 一致                                   | `src/version.ts`                     |

入口层包自己的常量（TLS 握手 30 s、接收时限 30 s、运维面撤除 3 s、存储现探 2 s）见
[它的 README](../../packages/tenancy/governance-center-entry/README.md#实现映射包内常量)；本装配的常量没有一个短于它们所盖住的那一段。

## 验证

`pnpm --filter @omne-harness-lite/tenancy-host run test`：真 sqlite 文件库、真 TLS、真 Unix 套接字、真子进程（SIGKILL 模拟崩溃）。
`tests/slow.spec.ts` 按真实时长跑（租约宽度 10 s、撤除总超时 30 s），约 70 秒。
`tests/pg.spec.ts` 需要 `OMNE_TEST_PG_URL`（可建库的 PostgreSQL；每条用例自建一个库），缺它整组跳过——**跳过不是通过**。
各测试与节点 verification 义务的对应写在每个测试文件的开头注释里。
