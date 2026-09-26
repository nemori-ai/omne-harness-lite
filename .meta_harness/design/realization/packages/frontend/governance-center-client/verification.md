# 客户端传输验证

## 证据义务

1. Node24 类型检查/构建，非法配置或预取消不打开连接。
2. CA+主机名与SPKI替代，错误材料无应用字节、TLS1.2拒绝。
3. HTTP/1.1单请求，无隐式重定向/重试；版本不匹配固定字节先于状态码。
4. 完整长度、截断、畸形、超界、错误JSON/非UTF8、额外字段/错误路由形状各自可检出。
5. 超时/取消/响应结束/错误竞态只结算一次，连接关闭、timer和signal listener清理；未取得有效结果不得返回空/假health。
6. 真实构建后的 tenancy-host 的公开health，两个独立中心不混淆；该验证只读、不登录。

## 实际执行

[2026-09-24 实现运行](../../../../record/evidence/2026-09-24-tests-governance-health-client/README.md)：Node24.21.0/macOS，47项测试含类型测试通过；对两个真实 tenancy-host 子进程各做CA/pin/不信任三次公开health；受验tgz在Linux arm64容器中通过五项冒烟。构建、typecheck、源码规则通过。源码修订以该run的source-manifest为准，未提交。

义务1～4有相应测试；义务5覆盖预取消、socket分配前取消、握手期限、读体取消/期限、成功后晚到取消以及外部abort listener移除；实现显式等待ClientRequest与socket关闭，但尚无系统DNS延迟回调注入或任意异步调度证明。义务6为同物理机两中心只读联调，不能称多机验证。Linux未跑全47项。

先前 [10场景原型](../../../../record/evidence/2026-09-24-probe-governance-client/README.md) 仍为选型证据，不与本次实现运行混计。

## D045业务增量

[2026-09-25实际运行](../../../../record/evidence/2026-09-25-tests-governance-protocol-client/README.md)：90项通过，含原47health与新增43项；31条业务路由逐一成功、错路由/失败集合/OG34分支、重复键、输入快照和秘密发送界限。macOS/Linux编译包驱动七组真实中心组合通过。测试断言sendAttempted只代表可能发送；没有本地状态、CLI/TUI或跨连接中心身份原子性声明。
