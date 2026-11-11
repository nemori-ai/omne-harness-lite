-------------------------- MODULE TerminalSegments --------------------------
(***************************************************************************)
(* Segment completion and byte attribution in a persistent terminal (D16). *)
(*                                                                         *)
(* One shell runs segments 1..K in turn. In segment k a foreground process *)
(* fg(k) writes bytes to the PTY; a background process writes bytes at any *)
(* time. The kernel keeps one ordered buffer per PTY, but a byte becomes   *)
(* readable on the master side some time after the write (Deliver). The   *)
(* control FIFO carries END(k) after fg(k) exits.                          *)
(*                                                                         *)
(*   Drain       "sentinel" target: the shell writes B(k) before fg(k) and *)
(*               E(k) after fg(k) exits; the gate attributes by position.  *)
(*               "eagain" current: the gate reads until nothing is         *)
(*               readable after END(k) (N7).                               *)
(*   Completion  "control" target; "quiet" completes on silence (N8).      *)
(*   InvalidateOnExtra  FALSE target; TRUE current rule (N9).              *)
(***************************************************************************)
EXTENDS Naturals, Sequences

CONSTANTS K, MaxFg, MaxBg, Drain, Completion, InvalidateOnExtra

VARIABLES
    seg,        \* the segment the gate started last, 0..K
    shellSt,    \* "idle", "got", "running" or "ended"
    gateSt,     \* "idle", "waiting" or "draining"
    fgLeft,     \* bytes fg(seg) still writes before it exits
    bgLeft,     \* bytes the background process still writes
    kbuf,       \* written to the PTY, not yet readable
    rbuf,       \* readable on the master side
    ctrl,       \* END messages on the control FIFO
    rank,       \* the attribution the gate applies now
    read,       \* bytes the gate read, with their attribution
    sawEnd,     \* segments whose E(k) the gate read
    fgDone,     \* segments whose fg(k) exited
    completed,  \* segments the gate reported completed
    invalid,
    written     \* data bytes written so far

vars == <<seg, shellSt, gateSt, fgLeft, bgLeft, kbuf, rbuf, ctrl, rank, read,
          sawEnd, fgDone, completed, invalid, written>>

\* Attribution ranks: 0 before segment 1, 2k-1 for Seg(k), 2k for Gap(k).
SegRank(k) == 2 * k - 1
GapRank(k) == 2 * k

Byte(src, k) == [src |-> src, seg |-> k]
IsData(b) == b.src \in {"fg", "bg"}
DataIn(s) == Len(SelectSeq(s, IsData))

Init ==
    /\ seg = 0 /\ shellSt = "idle" /\ gateSt = "idle"
    /\ fgLeft = 0 /\ bgLeft = MaxBg
    /\ kbuf = <<>> /\ rbuf = <<>> /\ ctrl = <<>>
    /\ rank = 0 /\ read = <<>>
    /\ sawEnd = {} /\ fgDone = {} /\ completed = {}
    /\ invalid = FALSE /\ written = 0

GateStart ==
    /\ gateSt = "idle" /\ shellSt = "idle" /\ seg < K /\ ~invalid
    /\ seg' = seg + 1
    /\ gateSt' = "waiting" /\ shellSt' = "got"
    /\ rank' = IF Drain = "eagain" THEN SegRank(seg + 1) ELSE rank
    /\ UNCHANGED <<fgLeft, bgLeft, kbuf, rbuf, ctrl, read, sawEnd, fgDone, completed,
                   invalid, written>>

ShellBegin ==
    /\ shellSt = "got"
    /\ shellSt' = "running"
    /\ \E n \in 0..MaxFg : fgLeft' = n
    /\ kbuf' = IF Drain = "sentinel" THEN Append(kbuf, Byte("B", seg)) ELSE kbuf
    /\ UNCHANGED <<seg, gateSt, bgLeft, rbuf, ctrl, rank, read, sawEnd, fgDone, completed,
                   invalid, written>>

FgWrite ==
    /\ shellSt = "running" /\ fgLeft > 0
    /\ fgLeft' = fgLeft - 1
    /\ kbuf' = Append(kbuf, Byte("fg", seg))
    /\ written' = written + 1
    /\ UNCHANGED <<seg, shellSt, gateSt, bgLeft, rbuf, ctrl, rank, read, sawEnd, fgDone,
                   completed, invalid>>

\* The shell waits for fg(seg), writes E(seg) to the PTY, then END(seg) to the FIFO.
FgExit ==
    /\ shellSt = "running" /\ fgLeft = 0
    /\ shellSt' = "ended"
    /\ fgDone' = fgDone \cup {seg}
    /\ kbuf' = IF Drain = "sentinel" THEN Append(kbuf, Byte("E", seg)) ELSE kbuf
    /\ ctrl' = Append(ctrl, seg)
    /\ UNCHANGED <<seg, gateSt, fgLeft, bgLeft, rbuf, rank, read, sawEnd, completed,
                   invalid, written>>

BgWrite ==
    /\ bgLeft > 0
    /\ bgLeft' = bgLeft - 1
    /\ kbuf' = Append(kbuf, Byte("bg", seg))
    /\ written' = written + 1
    /\ UNCHANGED <<seg, shellSt, gateSt, fgLeft, rbuf, ctrl, rank, read, sawEnd, fgDone,
                   completed, invalid>>

\* The kernel makes the oldest written byte readable. Order is kept.
Deliver ==
    /\ kbuf # <<>>
    /\ rbuf' = Append(rbuf, Head(kbuf))
    /\ kbuf' = Tail(kbuf)
    /\ UNCHANGED <<seg, shellSt, gateSt, fgLeft, bgLeft, ctrl, rank, read, sawEnd, fgDone,
                   completed, invalid, written>>

\* Sentinels switch the attribution and are removed from the output.
GateRead ==
    /\ rbuf # <<>>
    /\ LET b == Head(rbuf) IN
          /\ rbuf' = Tail(rbuf)
          /\ CASE b.src = "B" -> /\ rank' = SegRank(b.seg)
                                 /\ UNCHANGED <<read, sawEnd>>
               [] b.src = "E" -> /\ rank' = GapRank(b.seg)
                                 /\ sawEnd' = sawEnd \cup {b.seg}
                                 /\ UNCHANGED read
               [] OTHER       -> /\ read' = Append(read, [src |-> b.src, seg |-> b.seg, rank |-> rank])
                                 /\ UNCHANGED <<rank, sawEnd>>
    /\ UNCHANGED <<seg, shellSt, gateSt, fgLeft, bgLeft, kbuf, ctrl, fgDone, completed,
                   invalid, written>>

GateEnd ==
    /\ gateSt = "waiting" /\ ctrl # <<>> /\ Head(ctrl) = seg
    /\ ctrl' = Tail(ctrl)
    /\ gateSt' = "draining"
    /\ UNCHANGED <<seg, shellSt, fgLeft, bgLeft, kbuf, rbuf, rank, read, sawEnd, fgDone,
                   completed, invalid, written>>

Finish ==
    /\ completed' = completed \cup {seg}
    /\ gateSt' = "idle"
    /\ shellSt' = IF shellSt = "ended" THEN "idle" ELSE shellSt
    /\ invalid' = (invalid \/ (InvalidateOnExtra /\ bgLeft > 0))

GateComplete ==
    /\ \/ /\ Completion = "control" /\ Drain = "sentinel"
          /\ gateSt = "draining" /\ seg \in sawEnd
          /\ UNCHANGED rank
       \/ /\ Completion = "control" /\ Drain = "eagain"
          /\ gateSt = "draining" /\ rbuf = <<>>
          /\ rank' = GapRank(seg)
       \/ /\ Completion = "quiet"
          /\ gateSt = "waiting" /\ rbuf = <<>>
          /\ rank' = IF Drain = "eagain" THEN GapRank(seg) ELSE rank
    /\ Finish
    /\ UNCHANGED <<seg, fgLeft, bgLeft, kbuf, rbuf, ctrl, read, sawEnd, fgDone, written>>

Next ==
    \/ GateStart \/ ShellBegin \/ FgWrite \/ FgExit \/ BgWrite
    \/ Deliver \/ GateRead \/ GateEnd \/ GateComplete

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Properties. Names follow model.md section 5.3.                           *)

CompletionTruth == \A k \in completed : k \in fgDone                       \* S1

FgInSegment ==                                                             \* S2
    \A i \in 1..Len(read) : read[i].src = "fg" => read[i].rank = SegRank(read[i].seg)

Monotone ==                                                                \* S3
    \A i, j \in 1..Len(read) : i < j => read[i].rank <= read[j].rank

NothingLost == written = Len(read) + DataIn(rbuf) + DataIn(kbuf)          \* S3

StaysValid == ~invalid                                                     \* S4

OneSegment == gateSt # "idle" => seg \notin completed                      \* S5

\* Reachability witnesses: each must be violated by the target configuration.
NeverBgInSegment == ~\E i \in 1..Len(read) : read[i].src = "bg" /\ read[i].rank % 2 = 1
NeverGapByte == ~\E i \in 1..Len(read) : read[i].rank > 0 /\ read[i].rank % 2 = 0
NeverAllCompleted == ~(completed = 1..K /\ Len(read) > 0)
NeverFgInLaterSegment ==
    ~\E i \in 1..Len(read) : read[i].src = "fg" /\ read[i].seg = K /\ K > 1
=============================================================================
