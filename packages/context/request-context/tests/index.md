# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、替身、运行方式与当前缺口
- [public-entry.spec.ts](public-entry.spec.ts)：根入口的导出名单与类型
- [default-policies.spec.ts](default-policies.spec.ts)：默认压缩、表示策略与修剪器
- [default-assembly.spec.ts](default-assembly.spec.ts)：默认策略在真实操作组里的固定请求与 `lineage.continues`
- [conversion-results.spec.ts](conversion-results.spec.ts)：缺席的转换件结果读口
- [registry.spec.ts](registry.spec.ts)：来源登记表与操作组一致性
- [accounting.spec.ts](accounting.spec.ts)：账目投影、窗口占用与恢复
- [trust-conformance.spec.ts](trust-conformance.spec.ts)：信任套件在来源登记表上运行
- [cache.spec.ts](cache.spec.ts)：CX-14，经真实来源登记表：一代的缓存服务热调用，重复调用不读历史页，更长的历史只读尾部；每次命中都计量，由第二次计量决定；资格撤回之后热调用被拒；缓存按主体与用途分区，同租户的另一主体重读历史，另一租户的调用先于任何缓存与历史读被答复；缓存随代而生灭，替换之后拒绝缓存的发布，撤回的集合重新登记后从空开始，较慢的旧调用不覆盖较新的材料，失败的调用不留任何东西，一代的槽数有界；同一会话的连续 Run 只读新增行，另一主体、另一会话整读，压缩之后从新 epoch 的首行读
- [fixtures/](fixtures/index.md)：测试固定输入，现在有一份消息构造辅助
