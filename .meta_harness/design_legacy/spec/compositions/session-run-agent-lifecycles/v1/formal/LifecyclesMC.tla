---------------------------- MODULE LifecyclesMC ----------------------------
EXTENDS Lifecycles, TLC

Symm == Permutations(Instances) \cup Permutations(Runs)

=============================================================================
