----------------------------- MODULE DeskFigure -----------------------------
(* Where the agent figure is drawn: on the page of the main window, or on the desk layer (a transparent window of
   the main process that covers one screen). Three parties. The shell on the page owns the whereabouts and sends the
   desk page whole scenes. The desk page draws the scene it holds and reports back. The main process owns the desk
   window and the lease: the stay of the figure outside the page. Any party can go away at any step; a report can
   arrive after the shell has moved on. *)
EXTENDS Naturals, Sequences

CONSTANTS MaxLeases, MaxSerial, MaxDeskLoads, MaxPageDeaths,
          ShowAtOpen,     \* control: the main process shows the desk window when the lease opens, not on the desk's report
          AdoptAnyLease,  \* control: the shell does not match a report to its lease
          IgnoreSerial,   \* control: the shell does not match a report to the scene it sent last
          SkipLanding     \* control: on arrival the page takes over and the shell does not wait for the desk to be empty

Modes == {"hand", "rest", "home", "none"}
Blank == [lease |-> 0, serial |-> 0, mode |-> "none"]

VARIABLES pageAlive, where, sLease, sSerial, landed, pageDeaths,   \* the shell on the page; landed: the stroke home it heard arrive
          mLease, mNext, shown,                             \* the main process
          deskLoaded, dScene, deskLoads,                    \* the desk page
          down, up, toMain, fromMain                        \* scenes down (in order); reports up; requests; the lease stream
vars == <<pageAlive, where, sLease, sSerial, landed, pageDeaths, mLease, mNext, shown, deskLoaded, dScene, deskLoads,
          down, up, toMain, fromMain>>

Scene == [lease : 1..MaxLeases, serial : 1..MaxSerial, mode : Modes]

TypeOK ==
  /\ pageAlive \in BOOLEAN
  /\ where \in {"page", "handPage", "handDesk", "desk", "home", "landing"}
  /\ sLease \in 0..MaxLeases
  /\ sSerial \in 0..MaxSerial
  /\ landed \in 0..MaxSerial
  /\ mLease \in 0..MaxLeases
  /\ mNext \in 1..(MaxLeases + 1)
  /\ shown \in BOOLEAN
  /\ deskLoaded \in BOOLEAN
  /\ dScene \in Scene \cup {Blank}
  /\ \A i \in 1..Len(down) : down[i] \in Scene

Init ==
  /\ pageAlive = TRUE /\ where = "page" /\ sLease = 0 /\ sSerial = 0 /\ landed = 0 /\ pageDeaths = 0
  /\ mLease = 0 /\ mNext = 1 /\ shown = FALSE
  /\ deskLoaded = FALSE /\ dScene = Blank /\ deskLoads = 0
  /\ down = <<>> /\ up = {} /\ toMain = {} /\ fromMain = {}

Room(n) == sSerial + n <= MaxSerial
(* The scene that says where the figure is now. *)
ModeOf(w) == CASE w \in {"handPage", "handDesk"} -> "hand" [] w = "desk" -> "rest" [] w = "home" -> "home" [] OTHER -> "none"
Send(lease, mode) == /\ sSerial' = sSerial + 1
                     /\ down' = Append(down, [lease |-> lease, serial |-> sSerial + 1, mode |-> mode])

(* The person lifts the figure off its seat. Where the device lets it leave, the shell opens a lease: the main
   process numbers it and, in one step of its own, takes it as the current one. A lease it still held (the shell let
   go of it, the main process has not seen that yet) ends in that same step: the window is hidden first. *)
LiftFromPage ==
  /\ pageAlive /\ where = "page"
  /\ where' = "handPage"
  /\ \/ /\ mNext <= MaxLeases /\ Room(4)
        /\ sLease' = mNext /\ mLease' = mNext /\ mNext' = mNext + 1
        /\ shown' = ShowAtOpen
        /\ Send(mNext, "hand")
     \/ UNCHANGED <<sLease, mLease, mNext, shown, sSerial, down>>
  /\ UNCHANGED <<pageAlive, landed, pageDeaths, deskLoaded, dScene, deskLoads, up, toMain, fromMain>>

(* The hand lets go while the page still draws. With a lease, the page keeps the figure until the desk is empty. *)
DropOnPage ==
  /\ pageAlive /\ where = "handPage"
  /\ IF sLease = 0
     THEN where' = "page" /\ UNCHANGED <<sSerial, down, landed>>
     ELSE where' = "landing" /\ landed' = 0 /\ Send(sLease, "none")
  /\ UNCHANGED <<pageAlive, sLease, pageDeaths, mLease, mNext, shown, deskLoaded, dScene, deskLoads, up, toMain, fromMain>>

(* The hand lets go while the desk draws: the figure stays on the desktop, or goes home. *)
DropOnDesk(to) ==
  /\ pageAlive /\ where = "handDesk" /\ Room(4)
  /\ where' = to /\ Send(sLease, ModeOf(to))
  /\ UNCHANGED <<pageAlive, sLease, landed, pageDeaths, mLease, mNext, shown, deskLoaded, dScene, deskLoads, up, toMain, fromMain>>

(* The person lifts the figure where the desk draws it; or calls it home from the page. *)
LiftFromDesk ==
  /\ pageAlive /\ where \in {"desk", "home"} /\ Room(4)
  /\ where' = "handDesk" /\ Send(sLease, "hand")
  /\ UNCHANGED <<pageAlive, sLease, landed, pageDeaths, mLease, mNext, shown, deskLoaded, dScene, deskLoads, up, toMain, fromMain>>
Recall ==
  /\ pageAlive /\ where = "desk" /\ Room(4)
  /\ where' = "home" /\ Send(sLease, "home")
  /\ UNCHANGED <<pageAlive, sLease, landed, pageDeaths, mLease, mNext, shown, deskLoaded, dScene, deskLoads, up, toMain, fromMain>>

(* The desk page takes the next scene. It keeps only a scene newer than the one it holds. A scene that draws is
   reported to the main process as the place that takes the pointer; an empty one is reported up as cleared. *)
Newer(s) == s.lease > dScene.lease \/ (s.lease = dScene.lease /\ s.serial > dScene.serial)
DeskTakes ==
  /\ down # <<>>
  /\ down' = Tail(down)
  /\ LET s == Head(down) IN
     IF deskLoaded /\ Newer(s)
     THEN /\ dScene' = s
          /\ IF s.mode = "none"
             THEN up' = up \cup {[kind |-> "cleared", lease |-> s.lease, serial |-> s.serial]} /\ UNCHANGED toMain
             ELSE toMain' = toMain \cup {[lease |-> s.lease]} /\ UNCHANGED up
     ELSE UNCHANGED <<dScene, up, toMain>>
  /\ UNCHANGED <<pageAlive, where, sLease, sSerial, landed, pageDeaths, mLease, mNext, shown, deskLoaded, deskLoads, fromMain>>

(* The desk page's first frame of a scene is on the screen; the stroke home has reached its end. *)
DeskReports(kind) ==
  /\ deskLoaded /\ shown
  /\ dScene.mode = (IF kind = "arrived" THEN "home" ELSE "hand")
  /\ up' = up \cup {[kind |-> kind, lease |-> dScene.lease, serial |-> dScene.serial]}
  /\ UNCHANGED <<pageAlive, where, sLease, sSerial, landed, pageDeaths, mLease, mNext, shown, deskLoaded, dScene, deskLoads,
                 down, toMain, fromMain>>

(* The main process handles the desk's report: it shows the window only for the lease it holds. *)
MainShows(m) ==
  /\ m \in toMain
  /\ toMain' = toMain \ {m}
  /\ shown' = (shown \/ (m.lease = mLease /\ deskLoaded))
  /\ UNCHANGED <<pageAlive, where, sLease, sSerial, landed, pageDeaths, mLease, mNext, deskLoaded, dScene, deskLoads,
                 down, up, fromMain>>

(* The main process sees the lease request given up (the shell let go, or the page went away): it hides the window. *)
MainReleases ==
  /\ mLease # 0 /\ (~pageAlive \/ sLease # mLease)
  /\ mLease' = 0 /\ shown' = FALSE
  /\ UNCHANGED <<pageAlive, where, sLease, sSerial, landed, pageDeaths, mNext, deskLoaded, dScene, deskLoads,
                 down, up, toMain, fromMain>>

Current(m) == (AdoptAnyLease \/ m.lease = sLease) /\ (IgnoreSerial \/ m.serial = sSerial)

(* The shell takes one report from the desk page. *)
ShellHears(m) ==
  /\ m \in up /\ pageAlive
  /\ up' = up \ {m}
  /\ CASE m.kind = "painted" /\ where = "handPage" /\ sLease # 0 /\ Current(m) ->
            where' = "handDesk" /\ UNCHANGED <<sLease, sSerial, down, landed>>
       [] m.kind = "arrived" /\ where = "home" /\ Current(m) ->
            /\ landed' = m.serial
            /\ IF SkipLanding
               THEN where' = "page" /\ sLease' = 0 /\ Send(sLease, "none")
               ELSE where' = "landing" /\ Send(sLease, "none") /\ UNCHANGED sLease
       [] m.kind = "cleared" /\ where = "landing" /\ Current(m) ->
            where' = "page" /\ sLease' = 0 /\ UNCHANGED <<sSerial, down, landed>>
       [] m.kind = "hello" /\ sLease # 0 /\ Room(1) ->
            Send(sLease, ModeOf(where)) /\ UNCHANGED <<where, sLease, landed>>
       [] OTHER -> UNCHANGED <<where, sLease, sSerial, down, landed>>
  /\ UNCHANGED <<pageAlive, pageDeaths, mLease, mNext, shown, deskLoaded, dScene, deskLoads, toMain, fromMain>>

(* The lease stream says the desk layer is gone: the figure is drawn by the page again. *)
ShellToldEnded(m) ==
  /\ m \in fromMain /\ pageAlive
  /\ fromMain' = fromMain \ {m}
  /\ IF m.lease = sLease /\ sLease # 0
     THEN /\ sLease' = 0
          /\ where' \in (IF where \in {"handPage", "handDesk"} THEN {"handPage", "page"} ELSE {"page"})
     ELSE UNCHANGED <<where, sLease>>
  /\ UNCHANGED <<pageAlive, sSerial, landed, pageDeaths, mLease, mNext, shown, deskLoaded, dScene, deskLoads, down, up, toMain>>

(* The desk page loads: at first, or again after its renderer went away. It says hello. *)
DeskLoads ==
  /\ ~deskLoaded /\ deskLoads < MaxDeskLoads
  /\ deskLoaded' = TRUE /\ dScene' = Blank /\ deskLoads' = deskLoads + 1
  /\ up' = up \cup {[kind |-> "hello", lease |-> 0, serial |-> 0]}
  /\ UNCHANGED <<pageAlive, where, sLease, sSerial, landed, pageDeaths, mLease, mNext, shown, down, toMain, fromMain>>

(* The desk page goes away. The main process ends the lease on its stream and hides the window, in one step. *)
DeskGone ==
  /\ deskLoaded
  /\ deskLoaded' = FALSE /\ dScene' = Blank /\ shown' = FALSE
  /\ IF mLease # 0
     THEN fromMain' = fromMain \cup {[lease |-> mLease]} /\ mLease' = 0
     ELSE UNCHANGED <<fromMain, mLease>>
  /\ UNCHANGED <<pageAlive, where, sLease, sSerial, landed, pageDeaths, mNext, deskLoads, down, up, toMain>>

(* The page goes away (reload, crash, the main window closed). A new page starts only after the main process has
   ended the lease: it does that when the page's document starts to load. The new page counts its scenes from one. *)
PageGone ==
  /\ pageAlive /\ pageDeaths < MaxPageDeaths
  /\ pageAlive' = FALSE /\ where' = "page" /\ sLease' = 0 /\ pageDeaths' = pageDeaths + 1
  /\ sSerial' = 0 /\ landed' = 0
  /\ UNCHANGED <<mLease, mNext, shown, deskLoaded, dScene, deskLoads, down, up, toMain, fromMain>>
PageBack ==
  /\ ~pageAlive /\ mLease = 0
  /\ pageAlive' = TRUE
  /\ UNCHANGED <<where, sLease, sSerial, landed, pageDeaths, mLease, mNext, shown, deskLoaded, dScene, deskLoads,
                 down, up, toMain, fromMain>>

System ==
  \/ DeskTakes \/ DeskLoads \/ MainReleases \/ PageBack
  \/ \E k \in {"painted", "arrived"} : DeskReports(k)
  \/ \E m \in toMain : MainShows(m)
  \/ \E m \in up : ShellHears(m)
  \/ \E m \in fromMain : ShellToldEnded(m)
Person == LiftFromPage \/ DropOnPage \/ LiftFromDesk \/ Recall \/ \E to \in {"desk", "home"} : DropOnDesk(to)
Faults == DeskGone \/ PageGone
Next == System \/ Person \/ Faults

Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ WF_vars(System) /\ WF_vars(DropOnPage)

PageDraws == pageAlive /\ where \in {"page", "handPage", "landing"}
DeskDraws == deskLoaded /\ shown /\ dScene.mode # "none"

(* At most one figure: both draw only in the two cells of a handover, and then the desk draws this lease's scene at
   the point the page draws at: in the hand, or at the end of the stroke home that the shell has heard arrive. *)
OneFigure ==
  (PageDraws /\ DeskDraws) =>
    /\ where \in {"handPage", "landing"}
    /\ dScene.lease = sLease
    /\ \/ dScene.mode = "hand"
       \/ where = "landing" /\ dScene.mode = "home" /\ dScene.serial = landed

(* The page stops drawing only for a desk that draws this lease's scene, or whose end is already on the lease stream. *)
NeverNowhere ==
  (pageAlive /\ where \in {"handDesk", "desk", "home"}) =>
    \/ DeskDraws /\ dScene.lease = sLease
    \/ [lease |-> sLease] \in fromMain

(* A shown desk window never draws the scene of another lease than the one the main process holds. *)
ShownIsCurrent == DeskDraws => dScene.lease = mLease

(* The figure is never nowhere for good: while the page lives, in the end someone draws it. *)
Somewhere == []<>(~pageAlive \/ PageDraws \/ DeskDraws)

(* Witnesses: the desk can come to draw the figure, and the figure can come home from the desk. Violated on purpose. *)
NeverOnDesk == where # "desk"
NeverBackHome == ~(where = "page" /\ pageAlive /\ sSerial > 2 /\ pageDeaths = 0 /\ deskLoads = 1 /\ mNext = 2 /\ sLease = 0 /\ dScene.mode = "none" /\ dScene.lease = 1)
=============================================================================
