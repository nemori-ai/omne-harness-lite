## 评审结论

没有发现已证实的 P0 阻断。下面是我沿真实调用链读代码后认为此前评审可能漏掉的实际问题，按严重度排列；每条给出位置、触发条件、与已接受承诺的冲突、以及最小负例。

### P1

**1. 生产宿主制品把测试框架打进了「生产闭包」（产品制品缺陷）**
- 位置：`packages/core/storage/package.json:28-31` 把 `vitest` 放在 `dependencies`（因 `src/conformance/index.ts:4` 导入 vitest）。`tools/artifact-builder/src/index.ts:85-98` 用 `pnpm deploy --prod` 收集闭包，于是 vitest/vite/rolldown/postcss/@vitest/mocker/why-is-node-running 全部进入宿主制品。
- 证据：本轮 `summary.json` 的 r3 宿主清单第 42-52 行列出 `node_modules/.pnpm/vitest@4.1.11…`、`vite@8.3.0…`、`postcss@8.5.28…` 及其 `.bin` 包装。CLI 制品经 client-local-state → storage-sql → storage 同一链路，大概率同样包含，请按其 build-info.json 核对。
- 冲突：packaging 节点写明「离线收集生产闭包」；治理中心制品里带一套可执行的测试运行器与打包器，是无边界价值的攻击面和体积。D055 的「正式支持保护规则从本次新制品起，BUILD_ID 在最终证据列出」意味着修正后 BUILD_ID 会变，制品级 QA 需重跑。
- 最小负例：在解压后的 `app/` 里 `ls node_modules/.pnpm | grep -E 'vitest|vite@|rolldown'` 非空。
- 这不是运行时正确性缺陷，也不是安全漏洞本身；把它列 P1 是因为被验收的对象就是这份制品。

### P2

**2. 凭据文件按精确字节使用（含尾随换行），在「无管理员重置」前提下是可预见的永久锁定（产品风险 + 文档缺口）**
- 位置：`apps/cli/src/input.ts:199-225` 把 `readInputFile` 的完整解码文本作为凭据；`packages/tenancy/credential-verification/src/service.ts:29-33` 只拒绝空串。测试 `apps/cli/tests/input.spec.ts:115` 明确保留尾随换行，说明是有意设计。
- 触发：用 `echo pw > f` 注册（凭据实为 `pw\n`），之后用编辑器/`printf` 重建文件，或在下一期 WebUI 手动输入，登录得 `identifier-or-credential-rejected`；用户接受的边界是「忘记凭据无管理员重置」，因此无法恢复。
- 缺口：打包 README（`apps/cli/tools/package.ts:15-31`）和 `--help` 只说「Credentials come from protected files」，没有说明文件全部字节即凭据；预览也不显示凭据长度。
- 建议最小负例：同一密码分别以 `echo` 与 `printf` 写文件，注册用前者、登录用后者，观察被拒。

**3. 维护工作根的任何问题都会让业务中心起不来，而失败说明不可行动（产品诊断缺陷 + 测试缺口）**
- 位置：`packages/infra/storage-sql/src/upgrade/owner.ts:165-169` 在属主启动路径里打开 `<backupDir>/.quarantine`；失败落入 230-247 的 `abortStartup`。host 侧 `boot.ts:130-148` 把它归为 `storage-open`，消息只有 `SnapshotFailure: snapshot maintenance: unavailable`，没有路径，也不区分 busy / 标记缺失 / 权限。
- 触发：运维「清理」时删掉 `.quarantine/.omne-isolated`；或对停着的中心运行 `verify --work-dir <backupDir>/.quarantine` 期间启动中心（锁 busy → 也映射为 unavailable）；或 `.quarantine` 权限被改。
- 冲突：D055 接受了 ops 面强依赖维护 facet，所以耦合本身不是反例；但 PF-017 的「启动失败点名是哪一项」在这里不成立。
- 测试缺口：`apps/tenancy-host/tests/maintenance-startup.spec.ts` 只覆盖父目录 fsync 失败与源是目录两例；storage-sql 的 `maintenance-workspace.spec.ts:52` 只在包级断言拒绝，没有 host 级消息断言。

**4. `backup-status` 与每小时 `--only-if-due` 每次都把目录里每个候选完整复制并跑 integrity_check，受同一个 300 s 预算约束，且无保留策略（可扩展性 + 文档缺口）**
- 位置：`catalog.ts:54-98` → `input.ts:126-140` → `engine.ts:213-244` 与 worker；`engine.ts:70` 的 300 s 硬预算覆盖整个 run；`catalog.ts:36` 超过 256 候选直接 capacity；deploy README 第 31 行只说「不自动删除」。
- 触发：1 GiB 库保留几份备份后，每小时的到期检查就要复制并校验多 GiB，超预算得 `cancelled`，每日备份停止直到人工清理；对 ≤10 员工的小库不触发。
- 缺口：本轮近 1 GiB 观察只做了 2/3 次备份，未测多候选状态扫描；deploy README 未说明 300 s 预算和「状态检查会重新校验全部候选」。另 `maintenance-command.ts:148` 在 `invalidCount>0` 但 health current 时仍退出 0，坏候选不会改变退出码。

**5. 强杀/断电后的 `.quarantine/task-*/snapshot.sqlite` 明文残余永久保留且对运维不可见（文档缺口）**
- 位置：`workspace.ts` 不清理其他任务残余（storage-sql maintenance 节点第 9 行写明是有意的）；`catalog.ts:34` 的名字过滤让 status 看不到它们。
- 触发：备份进行中被 SIGKILL 或断电，每次留下最多 1 GiB 的完整明文库副本。
- 缺口：deploy README 第 40 行只要求保留标记，没有告诉运维如何识别与删除 `task-*` 残余；磁盘会静默被占满。

### P3

**6. 带迁移的升级后，所有旧备份对新宿主变成 `invalid-backup`，status 立即 `missing`** — `input.ts:28-35` 要求迁移名序列精确相等。设计明说「本版只支持本制品当前格式」，但 deploy README 第 42 行的升级段没有提示要用旧代码校验旧备份、备份历史会重置。

**7. 运维预先创建的空工作目录被拒为 `unavailable` 且无说明** — `workspace.ts:41-60` 只在自己创建目录时写标记；deploy README 第 33 行「parent already exists」的措辞容易诱导手工 mkdir。

### 核对过且未发现问题的关键路径
- `expectedTenant` 仅作比较条件：S-55 schema 的 if/then/else 保证 `missing-expected-identity` 缺陷分支不可达；其余带 expectedTenant 的路由都 `derivesTenant: always`。
- 8h/1h：`records.ts:139-169` 与 `decide.ts:455-462` 只在 `result` 后同事务写 `last_activity_at`；改密后 `finalizeActivity` 判失效不复活；CLI `use.ts:343` 对 AI50 与自撤销清空本地登录。
- 成员自退/最后超管、个人组织不可退出、邀请/隶属撤回只对发起方、超管在同事务内重判：`memberships.ts`、`offers.ts` 一致。
- ops 面：导入白名单收紧为 maintenance 与只读叶子；`presentation-only-authn` 放宽仅到 `accounts.participate/resolveActivatedIdentifier`，源码里确实只用这两处。
- TLS：客户端在 `secureConnect` 且 SPKI 核对后才 `req.end(body)`，出示物不会先发给未核实的服务端。
- 恢复输出是非 SQLite 封装、工作根带永久标记、`serve` 路径逐祖先拒绝；timer 单元无 Requires/Wants；SIGTERM 逆序先撤 entry/ops 再撤 storage。

## 实际阅读范围

已完整阅读：core/storage `maintenance.ts`、`snapshot-check.ts`；storage-sql `maintenance/*` 全部、`sqlite/{protection,lock,owner,driver,index}.ts`、`upgrade/{owner,guard,registry}.ts`、`provider.ts`、`unit.ts`、`open.ts`、`config.ts`、`plugin.ts`；governance-center-entry `maintenance/*` 全部、`ops/{plugin,maintenance-wire,health,http1,socket,limits}.ts`、`routing/{caller,decide,routes}.ts`、`plugin.ts`、`json.ts`、`center-id/{snapshot,read-or-mint}.ts`、schema 中 expectedTenant 相关定义；account-identity `logins/accounts/records/schema/plugin/surface/deps/presentation/snapshot`；organization-governance `memberships/offers/organizations/records/runtime/purge/snapshot`；account-registration `registration.ts`；credential-verification `service/policy`；clock `clock.ts`；tenancy-host `src/*` 全部、deploy 四个文件、`tools/package.ts`、`README.md`；apps/cli `src/*` 除 `screen.ts`、`commands/governance.json`、`tools/package.ts`；frontend 三个包的主要源码；artifact-builder；ts-checks 三条规则的 diff；D055/D056 决定、三份 maintenance realization 文档、本轮 evidence README 与 summary.json。

未覆盖：各包测试正文（只看了用例名）、e2e 与 raw 日志、`apps/cli/src/tui/screen.ts`、storage-sql `upgrade/files.ts`、`sqlite/errors.ts` 全文、postgres 路径、identity-values / kernel-basis / offer-expiry 的改动、spec-tools 的 Python 改动、pnpm-lock、`.meta_harness` 里除上述外的设计与 registry 文件。node:sqlite `backup()` 回调抛错语义与 Kysely Migrator 事务行为我依赖了既有研究与测试，没有独立复现。
