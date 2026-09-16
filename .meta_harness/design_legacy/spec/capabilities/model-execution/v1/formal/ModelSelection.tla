-------------------------- MODULE ModelSelection --------------------------
EXTENDS Naturals
CONSTANT Mutation
VARIABLES media, target, window, compacted, installed, witness
vars == <<media, target, window, compacted, installed, witness>>
Init == /\ media \in {"text", "image"}
        /\ target \in {"textOnly", "imageCapable", "unknown"}
        /\ window \in {"fits", "tooSmall", "unknown"}
        /\ compacted = 0 /\ installed = FALSE /\ witness = FALSE
Compatible == target # "unknown" /\ (media = "text" \/ target = "imageCapable")
Compact == /\ Compatible /\ window = "tooSmall" /\ ~installed
           /\ (compacted = 0 \/ (Mutation = "repeatCompaction" /\ compacted < 2))
           /\ compacted' = compacted + 1
           /\ UNCHANGED <<media, target, window, installed, witness>>
\* Compaction preserves durable modality history, including when it fits.
NowFits == /\ compacted = 1 /\ window = "tooSmall"
           /\ window' = "fits"
           /\ UNCHANGED <<media, target, compacted, installed, witness>>
Install == /\ ~installed /\ window # "tooSmall"
           /\ (Compatible \/ Mutation = "modality")
           /\ installed' = TRUE /\ witness' = Compatible
           /\ UNCHANGED <<media, target, window, compacted>>
Next == Compact \/ NowFits \/ Install
Spec == Init /\ [][Next]_vars
HistoryCompatible == installed => witness
AtMostOneCompaction == compacted <= 1
=============================================================================
