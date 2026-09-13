# 来源与维护

固定 DeepSeek Harness commit `c291e7961a515f6d7af9304e7fd1d257929aef26`，
按 [D-006](../../docs/decisions/D-006-dsh-core-adoption.md)选择源码。
原件保存在 upstream，逐文件 SHA-256、原路径、活动路径与差异记录在清单中。
原件不编译或打包；[MIT LICENSE](LICENSE)保留 DeepSeek 原始版权并随包分发。
本批 70 项来源记录集中在 [provenance.json](provenance.json)；施工分片已汇总，
不保留多份来源清单权威。42 个活动源码文件都有源映射，唯一不对应原文件的
Loop 导出入口作为本地装配文件单独登记。既有 agent 另有自己的 12 项来源记录。

活动代码由本项目维护，不自动追随上游，不支持未经要求的旧 API 兼容。
源设计与目标契约的差异见[源基线](../../docs/proposals/core-capabilities/fork/source-baseline.md)。
当前构建只供源码机制检验，无生产默认入口或模型供应方直连实现。
固定 archive 的实际字节复核及全部公开入口验证见
[交付记录](../../docs/proposals/core-capabilities/fork/delivery.md)。
