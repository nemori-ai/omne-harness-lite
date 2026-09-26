# 公开 health 客户端实现验证 · 2026-09-24

被测对象为 `packages/frontend/governance-center-client` 首个受限实现，采用范围归D-038；源码未提交，以 source-manifest 逐文件哈希定位。不是完整治理CLI。

| 运行 | 结果与边界 | 原始记录 |
|---|---|---|
| Node24.21.0 / macOS arm64，Vitest 4.1.11 | 47项（含类型测试）通过，无类型错误；真实回环TLS合成对端，覆盖CA/主机名/SPKI、TLS1.2拒绝、固定请求、完整/错误/超界答复、取消与期限及订阅收尾 | [vitest.json](vitest.json)；源码测试由manifest定位 |
| 同机两份独立构建的 tenancy-host 子进程；客户端消费 dist | 六次调用：各中心CA与pin均成功，默认系统CA拒绝私有CA；两中心ID不同且与各自运维health一致；正常终止两进程 | [脚本](integration-run.mjs)、[结果](integration-result.json) |
| 打包产物，Linux arm64容器，无外网、无源码或node_modules依赖 | 五项检查通过：CA、SPKI、错误pin不发请求、非200版本识别、预取消；仅合成TLS对端 | [脚本](linux.mjs)、[结果](linux-result.json)、[受验tgz](omne-harness-lite-governance-center-client-0.0.0.tgz) |

运行使用既有Node24工具链；新增成员锁文件仅增加同catalog的开发依赖，没有新增产品运行依赖。构建、typecheck、源码规则和格式检查另由本次执行记录/节点入口如实登记。

## 复现

- 在源码哈希匹配的检出，Node24运行 `pnpm --filter @omne-harness-lite/governance-center-client test`。openssl生成的测试私钥只在独占临时目录，测试结束删除。
- 真中心脚本原位于 `tmp/production-cli-onboarding/health-client-integration/run.mjs`；复制回同深度临时目录，以 `TMPDIR=/tmp fnm exec --using 24 node` 运行，消费预先构建的中心和客户端。它会启动两份独立临时数据库的中心，不访问现有部署，不注册账号；部署助手属于仓库测试设施。
- Linux脚本从 `/tmp/package/dist/index.js` 导入解包后的产物，依赖 `/certs/{tls.chain.pem,tls.key,ca.pem}` 的临时测试证书。使用真中心脚本生成的合成证书或按其助手重生，将证书目录只读挂载；Node镜像摘要见manifest。`tar -xzf <tgz> -C /tmp && node <linux.mjs>`，容器设置`--network none`仍可使用内部loopback。没有把私钥复制入证据。

## 限制

47项为macOS运行，Linux只跑了五项打包冒烟；不把这五项说成完整双平台测试。两个真实中心在同一物理机器，不是多机内网验收。没有TLS fuzz、硬实时证明、DNS系统任务立即取消证明，也没有本地登录存储、注册登录、组织治理、TUI或灾备演练。

使用 `shasum -a 256 -c SHA256SUMS` 校验本目录证据；重新运行需新目录，不能覆盖这次结果。打包产物未对外发布。
