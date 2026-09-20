---------------------------- MODULE InboundMC ----------------------------
EXTENDS Inbound, TLC

Symm == Permutations(Arrivals) \cup Permutations(Keys)
=============================================================================
