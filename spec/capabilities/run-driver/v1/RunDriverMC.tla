---------------------------- MODULE RunDriverMC ----------------------------
EXTENDS RunDriver, TLC
Symm == Permutations(A) \union Permutations(CIds)
=============================================================================
