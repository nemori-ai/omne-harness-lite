# 治理中心的黑盒端到端验收

照部署方式起一个治理中心进程，从**另一个进程**只凭传输绑定与入口契约走产品正文的核心旅程。
其余测试（`../*.spec.ts`、入口层包的 `center.spec`）都在进程内或测试装配里起中心；这里被测的是构建产物 `dist/cli.js`，
驱动方只知道线上的字节。

## 这里有什么

| 文件 | 是什么 |
|---|---|
| `client.ts` | 黑盒客户端：只依赖 `node:tls`、`node:net`、`node:crypto`，**不 import 任何 `@omne-harness-lite/*` 包**。按 HB S-6 发请求（一律 `POST`、`Content-Length` 成帧），按 HB S-17 读答复（读不成就是「问不到」，不猜）；按 D-029 的默认路径核中心证书（CA 链加主机名），核不过就不写请求 |
| `journey.ts` | 驱动器：注册 → 登录 → 建组织 → 切换 → 邀请 → 接受。套件与手动演练共用这一份 |
| `deploy.ts` | 部署者一侧：`openssl` 生自签 CA 与证书（每次调用自带配置文件，不读系统 openssl.cnf）、`dist/cli.js keygen`、拼环境变量、`dist/cli.js serve`、经运维面完整体检判定就绪、`SIGTERM`／`SIGKILL` |
| `evidence.ts` | 证据留存：线上原文遮蔽后落盘（出示物、口令、私钥 → `***`），每份留遮蔽前后两个 SHA-256；写完按原样、base64url（带／不带填充）、十六进制（大小写）把整棵目录再搜一遍 |
| `e2e.spec.ts` | vitest 套件。用例名带出处锚点（PF-001 flows、PF-017 acceptance、HB、EC、D-029）；判据只看来者可观察的结果 |
| `walk.ts` | 手动演练入口，逐步打印请求与答复（出示物与口令遮蔽） |

缩写：HB = `spec/compositions/governance-center-entry-https-json/v1`，EC = `spec/compositions/governance-center-entry/v1`，
D-029 = `realization/apps/cli/design.md`「客户端信任中心的规则」（均在 `.meta_harness/design/` 下）。

## 跑套件

```sh
pnpm run build                                                   # 被测的是 dist/cli.js；没构建就失败，不跳过
pnpm --filter @omne-harness-lite/tenancy-host run test:e2e       # 只跑这里（约 50 秒）
pnpm --filter @omne-harness-lite/tenancy-host run test           # 默认也包含它
```

需要本机 `openssl`（写本套件时是 1.1.1f）。用例按次序推进同一段旅程（一个中心、几个账号），前一条失败，后面的会连带失败。

| 环境变量 | 作用 |
|---|---|
| `OMNE_E2E_EVIDENCE_DIR` | 证据写到这个目录（`commands/`、`output/`、`transcript/`）；不设则写进临时目录、跑完删掉 |
| `OMNE_E2E_SECRETS_OUT` | 跑完把全部秘密（五种形式）逐行写进这个文件（`0600`），供独立 `grep -F -f` 复核证据目录；用完自己删 |
| `OMNE_E2E_KEEP` | 不设证据目录时保留临时目录，便于排查 |

## 手动起一个中心，再走一遍

以下命令在本机实跑过（`<repo>` 是仓库根，`$D` 是一个空目录）。运维面套接字的完整路径受 Unix 套接字 108 字节的上限约束，`OPS` 取短路径。

```sh
cd $D
printf '[req]\nprompt = no\ndistinguished_name = dn\n[dn]\nCN = e2e-ca\n[v3_ca]\nbasicConstraints = critical,CA:TRUE\nkeyUsage = critical,keyCertSign,cRLSign\nsubjectKeyIdentifier = hash\n' > ca.cnf
openssl req -x509 -config ca.cnf -extensions v3_ca -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout ca.key -out ca.pem -days 3
printf '[req]\nprompt = no\ndistinguished_name = dn\n[dn]\nCN = localhost\n' > center.cnf
openssl req -new -config center.cnf -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout center.key -out center.csr
printf 'subjectAltName = DNS:localhost,IP:127.0.0.1\nbasicConstraints = critical,CA:FALSE\nkeyUsage = critical,digitalSignature\nextendedKeyUsage = serverAuth\nsubjectKeyIdentifier = hash\nauthorityKeyIdentifier = keyid\n' > center.ext
openssl x509 -req -in center.csr -CA ca.pem -CAkey ca.key -CAcreateserial -out center.pem -days 2 -sha256 -extfile center.ext
cat center.pem ca.pem > center.chain.pem && chmod 600 center.key ca.key

node <repo>/apps/tenancy-host/dist/cli.js keygen $D/keys          # 标准输出给出四个 _FILE 变量
OPS=$(mktemp -d /tmp/ops-XXXX)                                    # 0700，只属于运行用户

export OMNE_TENANCY_STORAGE_FILE=$D/center.sqlite
export OMNE_TENANCY_ACTIVATION_SIGNING_KEY_PEM_FILE=$D/keys/activation-signing-key.pem
export OMNE_TENANCY_ACTIVATION_VERIFICATION_KEY_PEM_FILE=$D/keys/activation-verification-key.pem
export OMNE_TENANCY_PURGE_SIGNING_KEY_PEM_FILE=$D/keys/purge-signing-key.pem
export OMNE_TENANCY_PURGE_VERIFICATION_KEY_PEM_FILE=$D/keys/purge-verification-key.pem
export OMNE_TENANCY_UNACTIVATED_RETENTION=P7D OMNE_TENANCY_INVITATION_TTL_DEFAULT=P14D
export OMNE_TENANCY_AFFILIATION_REQUEST_TTL_DEFAULT=P14D OMNE_TENANCY_COPY_NOTICE_TTL_DEFAULT=P7D
export OMNE_TENANCY_SHARING_INVITATION_TTL_DEFAULT=P7D OMNE_TENANCY_TEAM_CREATION_KEY_RETENTION=P1D
export OMNE_TENANCY_CLOCK_READY_TIMEOUT=15000 OMNE_TENANCY_CREDENTIAL_POLICY='{"minLength":12}'
export OMNE_TENANCY_ENTRY_LISTEN=127.0.0.1:18443
export OMNE_TENANCY_ENTRY_TLS_CERT_CHAIN_PEM_FILE=$D/center.chain.pem
export OMNE_TENANCY_ENTRY_TLS_PRIVATE_KEY_PEM_FILE=$D/center.key
export OMNE_TENANCY_OPS_SOCKET_DIR=$OPS

node <repo>/apps/tenancy-host/dist/cli.js serve 2> $D/center.jsonl &   # 工程记录：每行一条 JSON
curl -s --unix-socket $OPS/governance-center-ops.sock http://localhost/  # 运维面：任何请求都答完整体检

cd <repo>
node --experimental-strip-types apps/tenancy-host/tests/e2e/walk.ts 127.0.0.1:18443 $D/ca.pem
#   --servername <名>  核对证书用的主机名（缺省取地址的主机部分）
#   --prefix <前缀>    两个登录标识的前缀（缺省随机）
#   --pause           每一步之前等回车

kill -TERM %1                                                     # 逆序撤除，退出码 0
```

## 边界

- **黑盒**：不读进程内部、不 import 产品包。唯一碰库文件的是运维者在产品之外做的两件事——搬家（挪文件）与备份（复制文件）；「备份外泄」那条读的是那份拷贝。
- **不改钟、不断电、不让存储够不着**：本机没有不影响整台机器就能做到的办法，涉及的产品场景在证据 run 的场景表里写作「未覆盖」，不是「通过」。
- **不做 Schema 校验**：`ajv` 不在本包的 devDependencies 里（加它要改锁文件）；答复的形状按契约的成员名与次序逐条比对。
- 场景与产品出处的对应、每条的结果与未覆盖的范围，见证据 run `.meta_harness/design/record/evidence/2026-09-23-e2e-governance-center/`。
