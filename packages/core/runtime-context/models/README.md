# 完整观察的有限交错模型

Observation核对RC-1/3/11/13：交付完整视图前，权限、已采用来源代、持久前缀和失效提示必须仍成立。配置不属于可见投影。A是有权读者的scope，B是另一个scope。两键、两scope、两次修订/代和一次提示是有界抽象，不是全部TS实现的证明。

revision代表本次可见读取的持久依据，不代表整条日志的tail；来源generation/hint是参与视图的变化指纹。外部来源各自的观察时刻、游标内存及变化差分、初始化/写入CAS、真实身份发行、OS和Cordis调度未建模。它们由相关拥有者的真实测试及原模型保持。模型允许比实际实现更多的跨scope来源变化，不以它声称跨来源原子事务。

TLC命令从仓库根执行：

```sh
tlc -config packages/core/runtime-context/models/Observation.cfg \
  -metadir tmp/context-observation-tlc \
  packages/core/runtime-context/models/Observation.tla
```

逐一令GuardAuthority/Generation/Prefix/Hint/Metadata为FALSE应产生反例。实际状态数、工具版本、负控配置和报告归本次运行证据，不写固定结论。真实实现映射为读取前后授权、来源对象代核对、选定注册/内容依据核对、scope/key在途watch及可见注册投影；相应测试在runtime-context-local和独立验收中。
