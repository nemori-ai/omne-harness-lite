# 注册组合验证义务

[SPEC](../SPEC.md) 由 account-registration-sequential 的现有 scenarios、integration、purge、faults 和 interleavings 测试兑现，不重开完整身份产品验收。

- 四terminal及defect／transient独立计数；同标识同／异材料真race，认回不重政策。
- 三步各自真实commit与三种中断状态；dependencies装配PENDING／运行unavailable不同；换代禁止新step，已发step完整late收场。
- 主链／purge的七格交错，在各提交内核当前单调expiry；立即清除后仅一次fresh AccountId重试，不继承旧身份。
- 绑定依据、幂等回认及孤儿defect；purge一半后重跑从治理重取依据，不持旧warrant跳过。
- 真实提交后丢回执须和precommitfailure／确认rollback区别，unknown不是未创建；取消不证明实际终止。

interleavings 已有特定真实commit等待点，不以任意sleep冒充阶段。模型见 [models](models/README.md)，有限progress不证明expired占用那支的一次即时重试或真SQL／密码学／排空。
