# 保管验证边界

当前 [model-only承诺](../SPEC.md#当前-model-only-行为) 使用实际 SQLite 与 key文件，现有 tests 检查GCM／AAD／opaqueUTF16、source迁移、不改旧ciphertext／login／time、坏key／ordinaryfile／0600、binding/source三方match、storage错误／污染rollback、read不取clock、两connection与实际drain。

真实 directory／auth／bootstrap／runtime组合和符号守卫归装配验证，不以假的binding reader覆盖整链。body只在成功读交付；诊断／异常不得含秘密，unknown不证明没commit；误用unit与不可用不同。

未来generic／OAuth／sweep未实现：[models](models/README.md) 只约束固定OAuth交错前提，不表示当前provider具备deposit/resolve/discard或清扫。未来真实验证仍需：仅三类清扫、strict大于TTL、完成现取clock与binding排序、两可达probe、不可读binding不丢、同tenant新login覆盖后discard旧login不删新行、跨tenant拒绝、坏cipher仍granted-current保留、实际每轮预算。没有真实login结束源、续期、keyrotation或PG完整恢复保证。
