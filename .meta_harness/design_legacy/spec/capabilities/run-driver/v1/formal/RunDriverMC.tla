---------------------------- MODULE RunDriverMC ----------------------------
EXTENDS RunDriver, TLC
\* 内建 human 调用与普通调用不可互换，对称集按两类分别取置换
Symm == Permutations(A) \union Permutations(CIds \ HIds) \union Permutations(HIds)
=============================================================================
