----------------------------- MODULE Transfer -----------------------------
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS Destinations, Imported, Growth,
          BadEarlyActivation, BadSecondDestination, BadRetryTruncation,
          BadSourceResume
None == "none"
Phases == {"begin", "reserveFile", "reserveLink", "reserveDir", "copy",
           "copyFile", "copyLink", "copyDir", "check", "retireFile",
           "retireLink", "retireDir", "activeFile", "activeLink",
           "activeDir", "done", "down", "conflict"}

VARIABLES pc, selected, reservation, reservationDurable, importInventory,
          visibleFiles, durableFiles, retirement, retirementDurable,
          activeVisible, activeDurable, growthWritten, sourceProbe
vars == <<pc, selected, reservation, reservationDurable, importInventory,
          visibleFiles, durableFiles, retirement, retirementDurable,
          activeVisible, activeDurable, growthWritten, sourceProbe>>

Init ==
  /\ pc = [d \in Destinations |-> "begin"]
  /\ selected = [d \in Destinations |-> None]
  /\ reservation = {}
  /\ reservationDurable = {}
  /\ importInventory = [d \in Destinations |-> {}]
  /\ visibleFiles = [d \in Destinations |-> {}]
  /\ durableFiles = [d \in Destinations |-> {}]
  /\ retirement = None
  /\ retirementDurable = None
  /\ activeVisible = {}
  /\ activeDurable = {}
  /\ growthWritten = {}
  /\ sourceProbe = "stopped"

Begin(d) ==
  /\ pc[d] = "begin"
  /\ d \notin activeVisible
  /\ pc' = [pc EXCEPT ![d] = IF d \in reservation THEN "reserveDir" ELSE "reserveFile"]
  /\ UNCHANGED <<selected, reservation, reservationDurable, importInventory,
                 visibleFiles, durableFiles, retirement, retirementDurable,
                 activeVisible, activeDurable, growthWritten, sourceProbe>>

ReserveFile(d) ==
  /\ pc[d] = "reserveFile"
  /\ pc' = [pc EXCEPT ![d] = "reserveLink"]
  /\ UNCHANGED <<selected, reservation, reservationDurable, importInventory,
                 visibleFiles, durableFiles, retirement, retirementDurable,
                 activeVisible, activeDurable, growthWritten, sourceProbe>>

ReserveLink(d) ==
  /\ pc[d] = "reserveLink"
  /\ d \notin reservation
  /\ reservation' = reservation \cup {d}
  /\ importInventory' = [importInventory EXCEPT ![d] = Imported]
  /\ pc' = [pc EXCEPT ![d] = "reserveDir"]
  /\ UNCHANGED <<selected, reservationDurable, visibleFiles, durableFiles,
                 retirement, retirementDurable, activeVisible, activeDurable,
                 growthWritten, sourceProbe>>

ReserveDir(d) ==
  /\ pc[d] = "reserveDir"
  /\ d \in reservation
  /\ importInventory[d] = Imported
  /\ reservationDurable' = reservationDurable \cup {d}
  /\ pc' = [pc EXCEPT ![d] = "copy"]
  /\ UNCHANGED <<selected, reservation, importInventory, visibleFiles, durableFiles,
                 retirement, retirementDurable, activeVisible, activeDurable,
                 growthWritten, sourceProbe>>

SelectFile(d, f) ==
  /\ pc[d] = "copy"
  /\ f \in Imported \ durableFiles[d]
  /\ selected' = [selected EXCEPT ![d] = f]
  /\ pc' = [pc EXCEPT ![d] = "copyFile"]
  /\ UNCHANGED <<reservation, reservationDurable, importInventory, visibleFiles,
                 durableFiles, retirement, retirementDurable, activeVisible,
                 activeDurable, growthWritten, sourceProbe>>

CopyFile(d) ==
  /\ pc[d] = "copyFile"
  /\ selected[d] \in importInventory[d]
  /\ pc' = [pc EXCEPT ![d] = "copyLink"]
  /\ UNCHANGED <<selected, reservation, reservationDurable, importInventory,
                 visibleFiles, durableFiles, retirement, retirementDurable,
                 activeVisible, activeDurable, growthWritten, sourceProbe>>

CopyLink(d) ==
  /\ pc[d] = "copyLink"
  /\ visibleFiles' = [visibleFiles EXCEPT ![d] = @ \cup {selected[d]}]
  /\ pc' = [pc EXCEPT ![d] = "copyDir"]
  /\ UNCHANGED <<selected, reservation, reservationDurable, importInventory,
                 durableFiles, retirement, retirementDurable, activeVisible,
                 activeDurable, growthWritten, sourceProbe>>

CopyDir(d) ==
  /\ pc[d] = "copyDir"
  /\ durableFiles' = [durableFiles EXCEPT ![d] = @ \cup {selected[d]}]
  /\ selected' = [selected EXCEPT ![d] = None]
  /\ pc' = [pc EXCEPT ![d] = "copy"]
  /\ UNCHANGED <<reservation, reservationDurable, importInventory, visibleFiles,
                 retirement, retirementDurable, activeVisible, activeDurable,
                 growthWritten, sourceProbe>>

CheckInventory(d) ==
  /\ pc[d] = "copy"
  /\ Imported \subseteq durableFiles[d]
  /\ visibleFiles[d] = Imported
  /\ pc' = [pc EXCEPT ![d] = "check"]
  /\ UNCHANGED <<selected, reservation, reservationDurable, importInventory,
                 visibleFiles, durableFiles, retirement, retirementDurable,
                 activeVisible, activeDurable, growthWritten, sourceProbe>>

CheckSource(d) ==
  /\ pc[d] = "check"
  /\ importInventory[d] = Imported
  /\ pc' = [pc EXCEPT ![d] = "retireFile"]
  /\ UNCHANGED <<selected, reservation, reservationDurable, importInventory,
                 visibleFiles, durableFiles, retirement, retirementDurable,
                 activeVisible, activeDurable, growthWritten, sourceProbe>>

RetireFile(d) ==
  /\ pc[d] = "retireFile"
  /\ pc' = [pc EXCEPT ![d] = "retireLink"]
  /\ UNCHANGED <<selected, reservation, reservationDurable, importInventory,
                 visibleFiles, durableFiles, retirement, retirementDurable,
                 activeVisible, activeDurable, growthWritten, sourceProbe>>

RetireLink(d) ==
  /\ pc[d] = "retireLink"
  /\ IF retirement \in {None, d} \/ BadSecondDestination
        THEN /\ retirement' = d
             /\ pc' = [pc EXCEPT ![d] = "retireDir"]
        ELSE /\ UNCHANGED retirement
             /\ pc' = [pc EXCEPT ![d] = "conflict"]
  /\ UNCHANGED <<selected, reservation, reservationDurable, importInventory,
                 visibleFiles, durableFiles, retirementDurable, activeVisible,
                 activeDurable, growthWritten, sourceProbe>>

RetireDir(d) ==
  /\ pc[d] = "retireDir"
  /\ retirement = d
  /\ retirementDurable' = d
  /\ pc' = [pc EXCEPT ![d] = "activeFile"]
  /\ UNCHANGED <<selected, reservation, reservationDurable, importInventory,
                 visibleFiles, durableFiles, retirement, activeVisible,
                 activeDurable, growthWritten, sourceProbe>>

ActiveFile(d) ==
  /\ pc[d] = "activeFile"
  /\ pc' = [pc EXCEPT ![d] = "activeLink"]
  /\ UNCHANGED <<selected, reservation, reservationDurable, importInventory,
                 visibleFiles, durableFiles, retirement, retirementDurable,
                 activeVisible, activeDurable, growthWritten, sourceProbe>>

ActiveLink(d) ==
  /\ pc[d] = "activeLink"
  /\ activeVisible' = activeVisible \cup {d}
  /\ pc' = [pc EXCEPT ![d] = "activeDir"]
  /\ UNCHANGED <<selected, reservation, reservationDurable, importInventory,
                 visibleFiles, durableFiles, retirement, retirementDurable,
                 activeDurable, growthWritten, sourceProbe>>

ActiveDir(d) ==
  /\ pc[d] = "activeDir"
  /\ activeDurable' = activeDurable \cup {d}
  /\ pc' = [pc EXCEPT ![d] = "done"]
  /\ UNCHANGED <<selected, reservation, reservationDurable, importInventory,
                 visibleFiles, durableFiles, retirement, retirementDurable,
                 activeVisible, growthWritten, sourceProbe>>

Bootstrap(d) ==
  /\ d \in activeVisible \ activeDurable
  /\ d \in reservation
  /\ Imported \subseteq visibleFiles[d]
  /\ activeDurable' = activeDurable \cup {d}
  /\ UNCHANGED <<pc, selected, reservation, reservationDurable, importInventory,
                 visibleFiles, durableFiles, retirement, retirementDurable,
                 activeVisible, growthWritten, sourceProbe>>

RetryCompleted(d) ==
  /\ pc[d] = "begin"
  /\ d \in activeVisible
  /\ retirement = d
  /\ Imported \subseteq visibleFiles[d]
  /\ activeDurable' = activeDurable \cup {d}
  /\ retirementDurable' = d
  /\ visibleFiles' = IF BadRetryTruncation
                       THEN [visibleFiles EXCEPT ![d] = Imported]
                       ELSE visibleFiles
  /\ durableFiles' = IF BadRetryTruncation
                       THEN [durableFiles EXCEPT ![d] = Imported]
                       ELSE durableFiles
  /\ pc' = [pc EXCEPT ![d] = "done"]
  /\ UNCHANGED <<selected, reservation, reservationDurable, importInventory,
                 retirement, activeVisible, growthWritten, sourceProbe>>

AppendGeneration(d) ==
  /\ d \in activeDurable
  /\ d \notin growthWritten
  /\ visibleFiles' = [visibleFiles EXCEPT ![d] = @ \cup Growth]
  /\ durableFiles' = [durableFiles EXCEPT ![d] = @ \cup Growth]
  /\ growthWritten' = growthWritten \cup {d}
  /\ UNCHANGED <<pc, selected, reservation, reservationDurable, importInventory,
                 retirement, retirementDurable, activeVisible, activeDurable,
                 sourceProbe>>

Crash(d) ==
  /\ pc[d] # "down"
  /\ pc' = [pc EXCEPT ![d] = "down"]
  /\ selected' = [selected EXCEPT ![d] = None]
  /\ UNCHANGED <<reservation, reservationDurable, importInventory, visibleFiles,
                 durableFiles, retirement, retirementDurable, activeVisible,
                 activeDurable, growthWritten, sourceProbe>>

Restart(d) ==
  /\ pc[d] = "down"
  /\ pc' = [pc EXCEPT ![d] = "begin"]
  /\ UNCHANGED <<selected, reservation, reservationDurable, importInventory,
                 visibleFiles, durableFiles, retirement, retirementDurable,
                 activeVisible, activeDurable, growthWritten, sourceProbe>>

ProbeRetiredSource ==
  /\ retirement # None
  /\ sourceProbe = "stopped"
  /\ sourceProbe' = IF BadSourceResume THEN "running" ELSE "refused"
  /\ UNCHANGED <<pc, selected, reservation, reservationDurable, importInventory,
                 visibleFiles, durableFiles, retirement, retirementDurable,
                 activeVisible, activeDurable, growthWritten>>

EarlyActivation(d) ==
  /\ BadEarlyActivation
  /\ d \in reservationDurable
  /\ d \notin activeVisible
  /\ activeVisible' = activeVisible \cup {d}
  /\ UNCHANGED <<pc, selected, reservation, reservationDurable, importInventory,
                 visibleFiles, durableFiles, retirement, retirementDurable,
                 activeDurable, growthWritten, sourceProbe>>

Next ==
  \/ \E d \in Destinations:
       \/ Begin(d) \/ ReserveFile(d) \/ ReserveLink(d) \/ ReserveDir(d)
       \/ (\E f \in Imported: SelectFile(d, f))
       \/ CopyFile(d) \/ CopyLink(d) \/ CopyDir(d) \/ CheckInventory(d)
       \/ CheckSource(d) \/ RetireFile(d) \/ RetireLink(d) \/ RetireDir(d)
       \/ ActiveFile(d) \/ ActiveLink(d) \/ ActiveDir(d) \/ Bootstrap(d)
       \/ RetryCompleted(d) \/ AppendGeneration(d) \/ Crash(d) \/ Restart(d)
       \/ EarlyActivation(d)
  \/ ProbeRetiredSource

TypeOK ==
  /\ pc \in [Destinations -> Phases]
  /\ selected \in [Destinations -> Imported \cup {None}]
  /\ reservation \subseteq Destinations
  /\ reservationDurable \subseteq reservation
  /\ importInventory \in [Destinations -> SUBSET Imported]
  /\ visibleFiles \in [Destinations -> SUBSET (Imported \cup Growth)]
  /\ durableFiles \in [Destinations -> SUBSET (Imported \cup Growth)]
  /\ retirement \in Destinations \cup {None}
  /\ retirementDurable \in Destinations \cup {None}
  /\ activeVisible \subseteq Destinations
  /\ activeDurable \subseteq activeVisible
  /\ growthWritten \subseteq Destinations
  /\ sourceProbe \in {"stopped", "refused", "running"}

UniqueCustody == Cardinality(activeVisible) <= 1
ActivationRequiresDurability ==
  \A d \in activeVisible:
    /\ d \in reservationDurable
    /\ Imported \subseteq durableFiles[d]
    /\ retirementDurable = d
RetirementBinding == retirementDurable # None => retirement = retirementDurable
ReservationFrozen == \A d \in reservation: importInventory[d] = Imported
ImportedGenerationsPreserved ==
  \A d \in activeVisible: Imported \subseteq visibleFiles[d]
GrowthPreserved == \A d \in growthWritten: Growth \subseteq durableFiles[d]
SourceNeverResumes == retirement # None => sourceProbe # "running"
DurabilityConsistent == \A d \in Destinations: durableFiles[d] \subseteq visibleFiles[d]

Spec == Init /\ [][Next]_vars
=============================================================================
