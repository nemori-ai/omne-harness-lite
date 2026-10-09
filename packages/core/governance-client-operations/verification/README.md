# 公共操作验证义务

规范行为归 [SPEC](../SPEC.md)，公开形状归 src/。模型与正负配置见 [models](models/README.md)；从模型目录执行 TLC 并逐项判读预期反例，具体执行结果归工作树 tmp。有限模型不证明 TLS、SQLite耐久、OS私有目录或真实终端恢复；现有对应 tests 仍须保护这些实际边界。
