# 2026-09-23 · 治理中心黑盒端到端运行的独立复跑与四态判定（W4-E）

对[上一次 run `2026-09-23-e2e-governance-center`](../2026-09-23-e2e-governance-center/README.md)（W4-D，套件作者自跑）做一次**不由套件作者执行**的复跑：
干净检出上从零装依赖、构建、跑 `tenancy-host` 的 `test:e2e`；照 `apps/tenancy-host/tests/e2e/README.md` 手动起一个中心、用 `walk.ts` 走一遍；
再把上一次 run 场景表的每一行，按**产品正文原文**（[PF-001 flows](../../../product/PF-001-identity-scope-and-agent-constraints/flows.md)、[PF-017 acceptance](../../../product/PF-017-governance-center-as-deployable-application/acceptance.md)）给出四态结论之一。

**这是一次实现测试的复跑与判读，不是模型检查**：结论只说明构建产物在本机、本次输入下的行为；**不提升任何契约或节点的状态**，
Pass 不等于接受——接受归 [decisions](../../decisions/README.md)。本次**没有改动**任何源码、测试、设计正文、registry 与上一次 run 目录。
客户端仍是套件的**测试客户端**，不是产品客户端（`apps/cli` 的客户端代理尚不存在）。

## 跑了什么

|         |                                                                                                                                                                                                                                                                                                                        |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 源码    | 分支 `panqiwei/tenancy-leg-2-e2e-verdict`，提交 **`2a3ba091358dc4b04c858e575b5c2cd3370808d6`**（HUB 合回 W4-D 的合并提交）。它与上一次 run 的源码 `608a07f` 相比，`apps/` 与 `packages/` 下只差三份说明文字（`apps/AGENTS.md`、`apps/README.md`、`packages/README.md`），**没有代码差异**。开跑前 `git status` 只有本目录未跟踪、没有任何 `dist/`（[原文](output/runner/environment.txt)） |
| 命令    | [`commands/run.sh`](commands/run.sh)：`pnpm install --frozen-lockfile --offline` → `pnpm run build` → `pnpm --filter @omne-harness-lite/tenancy-host run test:e2e`（verbose 与 JSON 两个报告器，`OMNE_E2E_EVIDENCE_DIR` 指向本目录）→ 手动起中心、`walk.ts` → 用本次跑出的秘密值 grep 两个 run 目录 → 与秘密值无关的结构核对 → 工程记录关联号核对；每步一份日志，带命令、起止时刻、退出码 |
| 被测    | 本次 `pnpm run build` 产出的 `apps/tenancy-host/dist/cli.js`，中心 `version` 为 `0.0.0`                                                                                                                                                                                                                                 |
| 套件    | `apps/tenancy-host/tests/e2e/e2e.spec.ts`，46 条；**用例标题与次序同上一次 run 逐条一致**（两份 `e2e.json` 比对）                                                                                                                                                                                                     |
| 环境    | Node **v24.18.0**（内置 OpenSSL 3.5.7）、系统 OpenSSL **1.1.1f**、pnpm 10.28.1、vitest 4.1.11、TypeScript 6.0.3；Linux 5.15.0-1084-aws x86_64，8 核；2026-09-23 18:28:07–18:29:20 UTC。与上一次 run 同一台机器、同一套版本 |
| 存储    | sqlite 临时文件库；`OMNE_TEST_PG_URL` 未设                                                                                                                                                                                                                                                                            |
| 临时区  | 全部临时材料（套件的 `os.tmpdir()`、两份秘密清单、手动中心的库与密钥）放在仓库之外的 `/tmp/w4e-XXXXXX`，跑完即删（[environment.txt](output/runner/environment.txt) 末行 `work dir removed: yes`）。**与上一次 run 的差别**：套件的 `TMPDIR` 指到这个目录——为了让它留下的临时根只属于本次、好让本脚本从里面独立取私钥 |

**`run.sh` 一共执行过三次，入库的是第三次。**第一次（18:22–18:23）同样从没有 `dist/` 的检出开跑，各步退出 0、套件 46 条全过、手动演练走完，
随后改进了测量（独立秘密清单按来源分开、PEM 私钥块改按起始行计数、补上工程记录关联号核对），产出全部删掉；
第二次在构建中途被我中止（第一次留下了 `dist/`，不再是从零），随后删掉全部 `dist/`、清空本目录的输出，再跑第三次。
依赖安装：检出时没有 `node_modules`，开工第一步手动跑了 `pnpm install --frozen-lockfile --offline`（离线成功：75 个包全部从本机存储复用，`Done in 975ms`）；
`run.sh` 里那一步因此是 `Already up to date`（[install.log](output/runner/install.log)）。

## 结果

| 步骤                                     | 退出码 | 秒 | 原文                                                                                                                                                  |
| ---------------------------------------- | ------ | -- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --offline` | 0      | 1  | [install.log](output/runner/install.log)                                                                                                              |
| `pnpm run build`                         | 0      | 17 | [build.log](output/runner/build.log)                                                                                                                  |
| `test:e2e`                               | 0      | 50 | [e2e.log](output/runner/e2e.log)、[e2e.json](output/runner/e2e.json)：**46 条全过**，套件自己的秘密搜查 0 命中（[secret-scan.txt](output/secret-scan.txt)） |
| 手动起中心 + `walk.ts`                   | 0      | 3  | [manual.log](output/runner/manual.log)，输出在 `output/manual/`（见下一小节）                                                                       |

套件在本目录写下的 `commands/commands.txt`、`output/`（除 `runner/` 与 `manual/`）与 `transcript/` 与上一次 run 同构，读法见[上一次 run 的「目录」](../2026-09-23-e2e-governance-center/README.md#目录)。
本次特有的几处数：强行结束之后的 46 次探测里 42 次两张面都「握手成功、请求写出、零字节关闭」（与上一次相同），等钟约 8.6 s（`clock` 的一条 warn 与一条 info）；
那份请求一写出就被掐掉的邀请本次又落在「不在」一支（`unreachable (no bytes)`，发出的邀约数 6 → 6，[racing-invitation.txt](output/kill-restart/racing-invitation.txt)）。

### 手动起一个中心，再走一遍

照 `apps/tenancy-host/tests/e2e/README.md`「手动起一个中心，再走一遍」逐条执行（命令原样写在 `run.sh` 的 `manual()` 里）：三条 `openssl`、`dist/cli.js keygen`、`OPS=$(mktemp -d /tmp/ops-XXXX)`、那一组环境变量、`serve` 放后台、`curl --unix-socket` 读运维面、`walk.ts 127.0.0.1:18443 <D>/ca.pem`、`kill -TERM`。

| 看什么 | 本次 |
|---|---|
| `keygen` | 退出 0；标准输出是一行 `keys-generated`，给出四个 `_FILE` 变量（[keygen.stdout.txt](output/manual/keygen.stdout.txt)），不含密钥内容 |
| 运维面目录 | `mktemp -d` 建出即 `700`；README 说的短路径照做，没有遇到上一次 run O-1 那种路径过长 |
| 就绪 | 运维面答出完整体检（[health-ready.json](output/manual/health-ready.json)）：十项、`defectCount` 0、参数即配置值 |
| `walk.ts` | **退出 0**，走完 11 步：公开体检 → 两人注册登录 → 当前租户是个人组织 → 建团队组织 → 切换 → 邀请 → 被邀请者看到并接受 → 名单 2 位（[walk.stdout.txt](output/manual/walk.stdout.txt)）；标准错误流为空 |
| 走完后 | 完整体检仍 `defectCount` 0（[health-after-walk.json](output/manual/health-after-walk.json)） |
| 撤除 | `SIGTERM` 后 `serve` **退出 0**；工程记录 26 行（[center.stderr.jsonl](output/manual/center.stderr.jsonl)） |

与 README 的出入只在执行方式，不在步骤：`$D` 与 `OPS` 放在临时区；端口 18443 先查过没被占用；就绪用 `curl` 轮询（README 是一次 `curl`）；`serve` 的环境变量放在子 shell 里，不污染后续步骤。

## 四态判定

判据是产品正文原文，不是套件与上一次 run 的说法；传输绑定那六行的判据是它们引的契约条款（HB、D-029）。

- **Pass**：本次复跑同样通过，且断言确实对应正文那一条。
- **Pass with issues**：通过，但断言比正文弱、或前提有界（近似、有限次尝试、只走了一支）。
- **Fail**：本次未通过，或线上结果与正文那一条不符。
- **Unable to verify**：本次跑不出来，或从外面本就触发不了。

「上次」列照抄上一次 run 的三态（通过／失败／未覆盖）；T 号沿用上一次 run 用例清单的编号（本次 `e2e.json` 的次序与之逐条一致）。

### 汇总

| 场景表的分节 | 行数 | Pass | Pass with issues | Fail | Unable to verify |
|---|---|---|---|---|---|
| PF-001 flows §一 主要旅程 | 9 | 6 | 2 | 0 | 1 |
| PF-001 flows §二 分支与异常（含 §四） | 23 | 8 | 5 | 2 | 8 |
| PF-017 acceptance §一 可观察场景 | 46 | 24 | 7 | 0 | 15 |
| PF-017 acceptance §二 绝不能发生的事 | 25 | 12 | 4 | 0 | 9 |
| 传输绑定与信任规则 | 6 | 4 | 2 | 0 | 0 |
| **合计** | **109** | **54** | **20** | **2** | **33** |

**与上一次 run 的差别只在「通过」一格的拆分**：上一次标「通过」的 74 行，本次 54 行 Pass、20 行 Pass with issues，没有一行变成 Fail；
上一次的两行「失败」本次仍是 Fail（现象复现，见[异常](#异常)）；上一次的 33 行「未覆盖」本次都是 Unable to verify，理由与上一次相同，没有一行本次能补上。

### 非 Pass 的逐行

「Unable to verify」一律是上一次 run 写明的原因（从外面造不出、需要另一个构建版本、会影响整台机器、产品客户端不存在），本次核过原因成立，理由列只写简短原因。

**PF-001 flows [§一](../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#一主要旅程)**

| 场景 | 上次 | 本次 | 理由 |
|---|---|---|---|
| §1.4 创建组织：一次提交里组织与第一位超管同时成立 | 通过 | Pass with issues | T15 只断言建成之后「是团队组织、创建者是超管」；正文的要点「不存在有组织但没有管理员的中间状态」没有被观察——没有在创建进行中并发去读，这一格从外面本次是结构性的推断，不是测出来的 |
| §1.5「发出它的那个组织不存在了，它随即自动过期」 | 未覆盖 | Unable to verify | 线上没有删除团队组织的路由 |
| §1.7 两边各做一次才建立；解除单方面；同一人自发自受 | 通过 | Pass with issues | 接受之后才有上级、接受不产生租户、单方面解除、同一人自发自受都断言了；但**「必须两边各做一次，单方面指定不允许」没有被断言**：请求发出之后、接受之前没有读 X 的上级（T19），也没有让发起方（不同账号的两个组织）自己去接受自己的请求 |

**PF-001 flows [§二](../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常)（与 §四）**

| 场景 | 上次 | 本次 | 理由 |
|---|---|---|---|
| 注册 1：被自己那条未激活记录占着、凭据相同 ⇒ 接着走完 | 未覆盖 | Unable to verify | 从外面造不出停在未激活的记录 |
| 注册 1：未激活记录、凭据不同 | 未覆盖 | Unable to verify | 同上 |
| 注册 1：未激活记录已过留存期限 | 未覆盖 | Unable to verify | 同上 |
| 注册 1：凭据不符合规则 ⇒「具体哪条规则不满足」 | 失败 | **Fail** | 本次线上仍只有 `{"failure":"credential-rejected"}`（transcript `pf001-2-register-branches` 的 `weak credential`）；正文要的「哪条规则」用户看不到。**契约与产品正文不一致，实现照契约**（A-2） |
| 注册 2 或 3 中途失败 | 未覆盖 | Unable to verify | 同「未激活记录」 |
| 注册 3 之后：激活已提交、回执没到，再注册 ⇒「已经有人用了」，直接登录 | 通过 | Pass with issues | 「回执没到」这个前提没有造出来，是用「已激活账号同标识同凭据再注册」代替（中心一侧两者状态相同，这个论证成立，但它是论证不是观察）；答复 `identifier-taken` 与之后能登录都测到了 |
| 撤销登录状态 2：指定的那一个已经失效 ⇒「这个登录已经不在有效之列」 | 失败 | **Fail** | 本次线上仍是 `{"result":"ok"}`，与一次成功撤销的答复逐字相同（transcript `pf001-2-revoke-branches` 的第三次 `ada1:revokeLoginState`）；正文要的反馈呈现不出。**契约与产品正文字面不一致，实现照契约**（A-1） |
| 登录 2：账号未激活 | 未覆盖 | Unable to verify | 同「未激活记录」 |
| 创建组织：发起者账号未激活 | 未覆盖 | Unable to verify | 未激活账号登录不了 |
| 加入 2：发出邀请的组织不存在了 | 未覆盖 | Unable to verify | 同 §1.5 那一行 |
| 建立隶属 2：己方已经有上级组织 ⇒「你已隶属于另一个组织，需先解除」 | 通过 | Pass with issues | T20 测的是**发起方** X（已有上级 Y）请 Z 作上级、由 Z 接受 ⇒ `alreadyHasAParentOrganization`；正文这一行在第 2 步、说的是**接受的这一方**自己已有上级、看到「你已隶属于另一个组织」。一个上级这条不变量在测到的那一面成立；正文字面那一面（接受方即将成为下级且已有上级）没有走到 |
| 建立隶属 1：**任一方**是个人组织 | 通过 | Pass with issues | 只走了「接收方是个人组织」一面（transcript 里 `personalOrganizationTakesNoPartInAffiliation` 只有一次，发起方当时在团队组织 X）；「发起方是个人组织」没有测 |
| 两位超管同时移除或降级对方 | 通过 | Pass with issues | 两轮、各两条连接同时发；每轮恰一方成立、另一方与单次被拒逐字相同，组织始终一位超管。是否在中心里真的交错不可观测——结论只到「这两轮都只有一种收场」 |
| 任何步骤：底层不可用 | 未覆盖 | Unable to verify | 开着的 sqlite 文件库从外面够不着，只能违反运维约定 |
| §四：普通成员不能邀请、看不到发出的邀约、看不到已解除的成员，看得到**只含有效成员**的名单 | 通过 | Pass with issues | 不能邀请、看不到发出的邀约、要看已解除的被拒（`includeIneffective` ⇒ `notAuthorized`）都测到了；但 T17 读名单的那一刻 X **还没有任何已解除的成员**（移除发生在其后的 T18），「名单只含有效成员」这一句的断言（`toHaveLength(2)`）区分不了「过滤掉了已解除的」与「本来就没有」；此后再没有普通成员读过名单 |

**PF-017 acceptance [§一](../../../product/PF-017-governance-center-as-deployable-application/acceptance.md#一可观察场景)**

| 场景 | 上次 | 本次 | 理由 |
|---|---|---|---|
| 第一次启动成功 ⇒ 体检三样；**零账号、零组织**，没有内置账号 | 通过 | Pass with issues | 体检那一半是 Pass；「零账号零组织」从外面数不出，按 §三「生来是空的」用五组常见标识与凭据登录代替，是有限次尝试 |
| 带着有效登录状态来 ⇒ 按 PF-001 办事，不问哪台机器、什么程序 | 通过 | Pass with issues | 另一个程序（`openssl s_client`）是真的；「另一台机器」是同机回环地址 127.0.0.2 的近似 |
| 数据所在够不着时问事 ⇒「暂时答不出」 | 未覆盖 | Unable to verify | 同 PF-001「底层不可用」 |
| 数据所在够不着时，什么都没带来建组织；去登录 | 未覆盖 | Unable to verify | 同上 |
| 数据所在够不着时读体检 | 未覆盖 | Unable to verify | 同上 |
| 中心开着时遇到自身的故障 | 未覆盖 | Unable to verify | 从外面造不出入口层缺陷；本次两处 `defectCount` 都是 0 |
| 中心升级成功 | 未覆盖 | Unable to verify | 需要另一个带新迁移的构建版本 |
| 中心升级失败 | 未覆盖 | Unable to verify | 同上 |
| 停机那一刻注册走到一半 | 未覆盖 | Unable to verify | 注册三步之间没有从外面能卡住的点 |
| 停机那一刻一份邀请刚发出、回执没到 ⇒ 要么在、要么不在 | 通过 | Pass with issues | 本次与上一次都只落在「不在」一支（6 → 6）；「已提交而回执丢失」那一支两次都没命中，也无法从外面强制命中 |
| 机器突然断电 | 未覆盖 | Unable to verify | 本机无法模拟断电而不影响整台机器 |
| 第一次起来之后不久就断电 | 未覆盖 | Unable to verify | 同上 |
| 搬到另一台机器、换了地址 ⇒ 标识相同，一条不变 | 通过 | Pass with issues | 同一台机器上换目录、端口与运维面目录的近似 |
| 丢了部署密钥 ⇒ 已有的未激活记录照常接着走 | 未覆盖 | Unable to verify | 同「未激活记录」 |
| 备份外泄 ⇒ 模型凭据跟着外泄、各自改值 | 未覆盖 | Unable to verify | 本程的中心没有模型凭据 |
| 正常停下后把钟往回拨再启动 | 未覆盖 | Unable to verify | 改系统钟会影响整台机器 |
| 开着时钟往回拨 | 未覆盖 | Unable to verify | 同上 |
| 开着时钟往前拨一小时又拨回 | 未覆盖 | Unable to verify | 同上 |
| 运维者想替同事接受邀请、把人移出 ⇒ 没有这个入口 | 通过 | Pass with issues | 两张够得着的面都试了：运维面对六种请求都只答完整体检、事后什么都没变；进程入口只有 `keygen`／`serve`。正文要的是「没有」，这里是**有限次尝试**下的「没找到」 |
| 运维者想撤销同事的登录状态 ⇒ 没有这个入口 | 通过 | Pass with issues | 同上 |
| 运维者改了一项部署参数 ⇒ 下次启动才生效，此后按新值，邀约例外 | 通过 | Pass with issues | 「按新值、邀约例外」测到了（T39）；「不重启旧值继续生效」没有测——参数只经启动时的环境变量给出，是结构上的，不是观察 |
| 未激活记录的留存期限调短／调长再重启 | 未覆盖 | Unable to verify | 同「未激活记录」 |

**PF-017 acceptance [§二](../../../product/PF-017-governance-center-as-deployable-application/acceptance.md#二绝不能发生的事)**

| 绝不能发生 | 上次 | 本次 | 理由 |
|---|---|---|---|
| 中心半开 | 未覆盖 | Unable to verify | 诱因从外面造不出 |
| 把「答不出」答成「无效」或「有效」 | 未覆盖 | Unable to verify | 同「数据所在够不着」 |
| 升级之后有人被退出登录，或已撤销的又能用了 | 未覆盖 | Unable to verify | 同「升级」 |
| 改部署参数让已被判为到期的未激活记录回来 | 未覆盖 | Unable to verify | 同「未激活记录」 |
| 开着时钟往回倒，某个判定用了更早的时刻 | 未覆盖 | Unable to verify | 同「钟往回拨」 |
| 冒牌货 —— 客户端一侧 | 未覆盖 | Unable to verify | 产品客户端 `apps/cli` 不存在；测试客户端的反向用例本次同样全过（T43、T44），但那只说明测试客户端 |
| 工程记录里出现对端地址，或账号、租户能被还原出来的标识 | 通过 | Pass with issues | 本次核过：17 个中心进程的工程记录里**没有任何 IP 地址**（连 127.0.0.1 都没有），也没有原样的 `AccountId`、登录标识。但记录里每条请求带 64 位十六进制的账号与租户**关联号**，它是对公开标签的**不带密钥的** SHA-256：手上有某个 `AccountId` 的人（例如同组织的成员，名单上就有）能把记录对到那个账号——本次线上看得见的 6 个 `AccountId` **6 个全对上**，15 个 `TenantId` 对上 8 个（[log-correlation-this-run.txt](output/runner/log-correlation-this-run.txt)；上一次 run 的记录同样 6／6、8／15）。套件只搜原样的标识，查不出这一点。是否算「能被还原」要主线裁，见[异常 N-1](#异常) |
| 升级之后变成另一个标识，或有东西丢了 | 未覆盖 | Unable to verify | 同「升级」 |
| 升级失败后数据被改了一半 | 未覆盖 | Unable to verify | 同「升级」 |
| 在一口倒退了的钟上起来 | 未覆盖 | Unable to verify | 同「钟往回拨」 |
| 中心里存在一个没人注册过的账号 | 通过 | Pass with issues | 有界：五组常见名字与口令；从外面数不了账号 |
| 运维者有任何一条不经登录状态就能做治理动作的路 | 通过 | Pass with issues | 有界：两张面上试过的那些请求 |
| 中心记住并区别对待某个客户端 | 通过 | Pass with issues | 「另一台机器」是 127.0.0.2 的近似；另一个程序是真的 |

**传输绑定与信任规则**（判据是所引的契约条款）

| 项 | 上次 | 本次 | 理由 |
|---|---|---|---|
| HB S-12：体无空白、字符串按 RFC 8785 写、成员按 Schema 书写次序 | 通过 | Pass with issues | 无空白与字符串写法逐份核了（T45）；成员次序只在套件用到的形状上逐条比对，没有全量 Schema 校验（上一次 run 的 I-1：`ajv` 不在本包依赖里） |
| D-029 ①②⑤：核 CA 链加主机名；核不过不交出示物；中心标识不参与信任 | 通过 | Pass with issues | 只对测试客户端成立（T43、T44）；D-029 约束的产品客户端尚不存在 |

## 抽查五条

2026-09-23T18:22:26Z 用 `shuf -i 4-46 -n 5` 在 T04～T46（排除三条测量自检）里抽，得 **T18、T10、T29、T15、T34**。逐条读了 `e2e.spec.ts` 的断言与 `journey.ts` 的驱动，并对照本次 transcript 里的线上原文。

| T | 用例 | 断言的是不是产品可观察结果 | 有没有恒通过的空断言 |
|---|---|---|---|
| T10 | PF-001 §1.1 注册 | 是。三个人各自：`registered` 的整份答复尾部逐字比对；登录后 `currentTenant` 与 `myTenants` 恰为同一个个人租户；`readOrganization` 恰为 `{organization, organizationKind:"personal"}`；`membershipStanding` 恰为 `effective`＋`superAdministrator`；三个个人组织两两不同。transcript 里三人的答复形状一致（`membershipStanding` 三次答复字节的 SHA-256 相同） | 没有。每一步先 `expectResult` 断言读成路由结果，再断言值 |
| T15 | PF-001 §1.4 创建组织 | 是。带创建键重发得到同一个组织标识（transcript 两次答复 SHA-256 相同）；`organizationKind:"team"`；创建者 `superAdministrator`；第二个人（cy）建的组织他自己是超管，先来者读它得 `notAuthorized`；层身份两格带判别式 | 没有。「无中间态」没有断言（见上表），但这不是空断言，是没测 |
| T18 | PF-001 §1.6 退出组织 | 是。本人退出后 `membershipStanding` 读成 `ineffective`、他自己的 `myTenants` 不再含它、他再读那个租户得 `notAuthorized`；超管的名单只剩自己、带 `includeIneffective` 的名单里有他且 `effective:false`；再邀请接受后回到**同一个** `TenantId`（整值相等）；最后一位超管、个人组织各得具名拒绝 | 没有。两处 `not.toEqual(arrayContaining)` 前面都有 `myTenants` 内部的 `expectResult`，线上读不成会先失败 |
| T29 | PF-017「不问哪台机器、什么程序」 | 是。三份答复（127.0.0.1 的本客户端、127.0.0.2 用 `PUT`／别的路径／不带 `Host`／别的头、`openssl s_client`）整份字节相等；本次 transcript 三份答复的 SHA-256 都是 `37db670a…` | 没有。第一份先断言是路由结果，所以「三份都问不到也相等」的空通过被排除了；`openssl` 那一份另断言退出码 0 |
| T34 | PF-017「中心重启」 | 是。`SIGTERM` 退出码断言为 `{code:0, signal:null}`；重启后体检的 `centerId` 与第一次相同；此前有效的五个登录状态各自读成路由结果；此前撤销的两个各自是 137 字节的 `login-state-rejected`（整份字节比对） | 没有。有效那五个只断言「读成路由结果」、不比对内容——对这一行（登录状态依然有效）足够 |

**五条都没有发现「恒通过」或只断言回调被调用的写法**；判据全是线上答复的值与字节、进程退出码。抽查之外通读全套件时看到的几处断言偏弱（§1.7「两边各做一次」、§四「只含有效成员」、隶属「任一方」与「己方已有上级」）已记进上面的逐行表。

## 遮蔽核对

用**本次跑出来的值**对本目录与上一次 run 目录各 grep 一次（[secret-grep.txt](output/runner/secret-grep.txt)），两份清单：

| 清单 | 来源 | 行数（五种形式：原样、base64url 带／不带填充、十六进制大／小写） | 本目录命中 | 上一次 run 目录命中 | 对照 |
|---|---|---|---|---|---|
| 套件自报 | `OMNE_E2E_SECRETS_OUT`：14 个出示物、27 个口令与凭据派生材料、37 个私钥片段 | 422 | **0 个文件** | **0 个文件** | 只含第一行的文件命中 1 |
| 本脚本独立取 | [`commands/secret-forms.mjs`](commands/secret-forms.mjs)（不 import 套件代码）从套件的临时根取到的 9 份私钥文件、从手动中心目录取到的 4 份（`ca.key`、`center.key`、两把签名私钥） | 215 | **0 个文件** | **0 个文件** | 只含第一行的文件命中 1 |

- **套件的秘密登记是完整的（就私钥而言）**：从它临时根独立取到的私钥片段，**0 行**不在它自报的清单里。例外：中心 A 的第一套部署密钥被套件在「丢了部署密钥」一步删掉了，本脚本取不到，只有套件自报覆盖。
- **手动演练的口令与出示物本次拿不到原值**（`walk.ts` 自己生成、自己遮蔽），所以另做了一次**与值无关**的结构核对（[commands/scan-structure.mjs](commands/scan-structure.mjs)，两个目录各一份：[本次](output/runner/structure-this-run.txt)、[上一次](output/runner/structure-previous-run.txt)）：
  出示物所在的 `loginState` 成员，本目录 20 处里 19 处是 `***`，剩下 1 处是本页自检脚本里故意植入的 `LEAKEDvalue123`；上一次 run 16 处全是 `***`。
  `credential` 成员两个目录各有 4 处不是 `***`：`short`、空串、`admin`、`password`——都是故意发的不合规或不存在的口令，登录与注册都被拒，不是秘密。
  `presentedLoginState` 成员里不是 `***` 的 21 处都是故意拿来当出示物的非秘密值：列表句柄、`x`、表示层不合格的 `" ***"`、随机生成的「从没签发」、以及 `walk.ts` 打印出来的记号（中心标识、组织与账号标识、句柄、路由名），套件把它们每一个都当出示物试过、全被拒。
  两个目录里都**没有任何 PEM 私钥块**（`-----BEGIN … PRIVATE KEY-----` 0 处）。
- 测量自检：[commands/selftest.sh](commands/selftest.sh) 在仓库外植入一把私钥的一行与十六进制正文、一个没遮蔽的出示物，两个脚本都报了出来、干净文件没被报（[selftest.txt](output/runner/selftest.txt)）。
- **对上一次 run 目录的 grep 用的是本次的值**，两次 run 的秘密是各自随机生成的，这一行 0 命中是预期的、证明力弱；上一次 run 自己的秘密原值已随它的临时区删掉，本次无从取得。对上一次 run 有实质意义的是上面那次结构核对。

## 异常

**A-1～A-3 三处（上一次 run 的 [anomalies.txt](../2026-09-23-e2e-governance-center/output/anomalies.txt)）本次全部复现，现象与上一次逐字相同；按任务只核复现，不裁。**

| # | 本次观察 | 复现 |
|---|---|---|
| A-1 | 已撤销的那一个再撤：`{"result":"ok"}`，与 T13 里一次成功撤销的答复体相同 | 是（transcript `pf001-2-revoke-branches`，三次 `ada1:revokeLoginState` 依次是 `login-state-not-found`、`login-state-not-found`、`ok`） |
| A-2 | 5 个字符的凭据（政策 `minLength` 12）：`{"failure":"credential-rejected"}`，没有规则 | 是（transcript `pf001-2-register-branches` 的 `weak credential`） |
| A-3 | 解除之后下级一方重发得 `noSuchAffiliation`，原上级一方重发得 `notAuthorized` | 是（transcript `pf001-1.7-affiliation` 三次 `dissolveAffiliation`：`cy1` ⇒ `ok`、`ada1` ⇒ `noSuchAffiliation`、`cy1` ⇒ `notAuthorized`） |

**本次新的观察（交主线，不裁）：**

| # | 在哪 | 观察 | 需要裁的最小问题 |
|---|---|---|---|
| N-1 | PF-017 §二「工程记录里出现……账号、租户能被还原出来的标识」 vs EC S-30「账号与租户只以不可逆的关联号出现，从记录里还原不出 `AccountId`、`TenantId`」 | 关联号是 `hex(SHA-256(公开标签 ‖ 0x00 ‖ AccountId))`（`packages/tenancy/governance-center-entry/src/routing/record.ts`，跨重启稳定、没有密钥）。从记录**反推**出 `AccountId` 做不到；但手上已有某个 `AccountId` 的人能**确认**记录里哪几条是那个账号的——本次与上一次 run 的记录，线上出现过的 6 个 `AccountId` 都对得上（[commands/log-correlation.mjs](commands/log-correlation.mjs)）。`AccountId` 不是秘密（名单、邀请里都有），同组织的成员若同时是运维者，就能从记录里读出同事什么时候做了什么 | 产品那一行的「能被还原」是否包括「持有候选标识即可确认」；若包括，关联号要不要改成带密钥的（契约 EC S-30 与入口节点设计的事） |
| N-2 | 本次判定表 | 上一次 run 标「通过」的 74 行里，有 20 行本次判为 Pass with issues；其中五行是断言比正文弱（§1.4「无中间态」没有观察；§1.7「两边各做一次」没有断言；§四「只含有效成员」在没有已解除成员时断言；隶属「任一方是个人组织」与「己方已有上级」各只走了一面），其余是近似、代替前提或有限次尝试 | 这几处是否要求套件补断言（归套件作者），还是接受为有界证据 |

## 边界

- **一次运行、一台机器、一个 sqlite 文件库**；套件与上一次 run 是同一份代码，本次独立的是执行者、执行时刻、临时区与判读，不是另一套测量。**不是性质证明**。
- 判定只覆盖上一次 run 场景表里的 109 行；PF-017 §三 的判据只在某行需要更精确的说法时引用，没有单独逐条判。
- 「另一台机器」「搬家」仍是同机近似；故障注入（存储够不着、钟、断电、升级、注册中途停机、入口层缺陷）一样没做，理由同上一次 run。
- 手动演练只走了 README 的那一条路径，没有重复 README 之外的场景。
- 本次**没有**跑包的完整 `test`、`lint:rules`、`format:check`（不在本任务范围；上一次 run 与 HUB 的 `make check` 跑过）。
- N-1 用到了源码里的公开标签去复算关联号——这一步不是黑盒，但只读、不改任何东西。

## 与上一次 run 的关系

- 上一次 run 是套件作者（W4-D）在 `608a07f` 上自跑；本次是另一个执行者在合回 HUB 之后的 `2a3ba09` 上复跑同一份套件，两者之间没有代码差异。
- 上一次 run 的目录**原样保留、没有改动**；本次的判定不改写它的结果，只给出另一份判读。两次的测试结果一致（46／46），三处异常一致，强行结束后的探测数一致（42／46）。
- 证据区入口 [evidence/README.md](../README.md) 的「当前状态」表**本次没有改**——那一格不在本任务的写入范围内，由主线补登（上一次 run 也还没登进去）。

## 目录

| 路径 | 内容 |
|---|---|
| `commands/run.sh` | 本次执行的脚本（入库的是第三次执行） |
| `commands/secret-forms.mjs`、`scan-structure.mjs`、`log-correlation.mjs`、`selftest.sh` | 本次的独立测量：从私钥文件取秘密的五种形式、与值无关的结构核对、工程记录关联号核对、两个脚本的自检 |
| `commands/commands.txt` | 套件执行的每条 `openssl` 与 `cli.js` 命令（套件写，环境变量只列名字） |
| `output/runner/` | 各步日志、退出码、vitest JSON、环境、两份 grep、两份结构核对、两份关联号核对、自检、写完之后的两项仓库检查 |
| `output/manual/` | 手动演练：`keygen` 输出、两次运维面体检、`walk.ts` 的标准输出与标准错误流、中心的工程记录 |
| `output/`（其余）、`transcript/` | 套件写下的证据，与上一次 run 同构 |

## 写完之后的仓库检查

本页与全部输出落定之后，在同一个工作树上另跑：

| 检查 | 退出码 | 原文 |
|---|---|---|
| `make docs-check` | 0：`PASS: 658 Markdown files; local links and skill mirrors.` | [docs-check.log](output/runner/docs-check.log) |
| `make design-check` | 0：设计树、领域对象对账（179 个词条、38 条对象条目、8 项待裁）、13 个实现映射节点对账全过；形式任务只核登记、未执行（`formal=registered`） | [design-check.log](output/runner/design-check.log) |

第一次跑这两项时各报一处：`docs-check` 找不到 `design-check.log`（那时还没生成），`design-check` 不认一条指向目录 `output/manual/` 的链接（改成了文字）；改完重跑，上表是重跑的结果。
