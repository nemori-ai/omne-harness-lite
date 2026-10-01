# 实际组件检查补充（2026-09-27）

本轮采用 D-074/D-077 的 EIS 普通及受限读取、真实发布/捕获组件。真实 SQLite、account/login/OG/STT 的 45 项测试通过；build/typecheck exit 0。静态边界工具 386 项测试通过，build/typecheck exit 0。证据为 [实际日志与源码快照](eis-component-checks-run-1.tar.gz)及[逐文件 SHA](eis-component-checks-inputs.json)。这份快照包含源码和测试，不包含 node_modules/dist 或凭据。

范围是实施者组件检查，不是独立验收；包含真实并发发布、成员资格撤销、明确不可用、严格精确数、实际 Cordis drain、诊断失效、提交前及提交后回执前 SIGKILL 重开。registry 原 fill 认回、真实 runtime 消费、端到端来源竞争负控和生产模型认证仍待执行。研究缓存命中不能替代生产验证；当前 official 认证 0/37。

本目录原 input-and-output-hashes.json 是历史清单，展开文件压缩归档后含旧路径，保留历史字节。eis-component-checks-inputs.json 仅补本次组件输入，不冒充完整目录清单；完整新版归档清单仍待收口。
