# Loop extension：拒绝调用的动作后置输入

采用依据：2026-10-04 用户授权采用经审阅的 Tool Runtime r10 并实施第二阶段。
本页接续 AR-2；公开类型与当前 Schema 拥有输入形状。其他位置、输出规则、未迁条款和历史验证义务保持。

after_action(each) 对被拒绝的调用使用 outcome=denied，result 必须缺席。拒绝没有执行，不能伪造执行结果交给 hook 改写。

after_action(batch) 的 outcomes 包含原序的全部调用，包括 denied。全拒绝批次仍有原调用集合，不能变成空集合。原序和完整集合由协调拥有者保证，Schema 不能单独证明。

两个位置的合法输出集合保持。batch 仍不允许 rewrite 或 veto；each 不得改写调用身份、outcome 或正式拒绝依据。

当前 Schema 的公开 URI 保持。迁移测试限定到这两个 subject；其余形状、规范实例、retained 资源与冻结历史继续核验。
