# macOS host 夹具修复与回归 · 2026-09-26

本轮只改两处测试夹具，不修改产品状态或领域规则。Sol xhigh在隔离工作树诊断/修复/运行；主线核diff、保全逐文件hash后接受局部修复，并在合入的HUB重新运行受影响e2e。输入提交/源文件hash与归档摘要见[inputs.json](inputs.json)，[原始证据归档](fixtures-evidence.tar.gz)保留各次失败、对照与最终日志。

## 反例与修复

- maintenance-dispose夹具的Unix socket pathname为106字节；当前macOS27 arm64/Node24.21.0在105字节及以上绑定失败，104可绑定。程序在ready前退出，未走到排空断言。缩短fixture label后原四种故障判据均通过，HUB定向独立复验4/4。该诊断解释本次可重现故障；更早未保存完整断言的失败不能凭此断言原因必同。
- 系统LibreSSL3.3.6生成EC显式参数，Node24.21.0/OpenSSL3.5.8的TLS拒收。仅在两处openssl EC生成参数加入`ec_param_enc:named_curve`，实际CA/leaf均为prime256v1；不修改TLS信任、主机名校验或测试断言。之后完整host为186通过/1失败/11跳过，唯一失败是系统LibreSSL的s_client不支持`-verify_hostname`。
- 测试子进程PATH显式选择现有Homebrew OpenSSL3.6.3后，s_client支持原校验选项。当前第二来源10.18.100.75经本机合法绑定/TLS正对照通过，再运行一次正常并发host：**187通过、11跳过、0失败、类型错误0**。不更改用户网络或系统OpenSSL。

## 输入和复核

worker提交818a7163；主线采用b3f64d79与bb136475（局部cherry-pick，fixture源码等价）。Node24.21.0、pnpm10.28.1，TMPDIR=/private/tmp。局部格式、host typecheck均通过。HUB在bb136475使用同一OpenSSL3路径与实际第二来源运行`pnpm --filter @omne-harness-lite/tenancy-host run test:e2e`：**46/46通过**。完整命令、版本和实际fixture hash在归档各轮报告/inputs/preflight日志；HUB日志独立保存。

## 边界

本轮的11跳过为没有设置OMNE_TEST_PG_URL的PostgreSQL用例；没有当作通过。不是完整workspace新一轮验收，不替代既有Linux测试，也不是Docker部署验收。正常并发下的有限测试不保证任意资源竞争和任意macOS/OpenSSL版本。第二来源地址属于本次网络条件，复跑者须先核本机实际地址与合法连通，不能照抄旧地址后放宽断言。
