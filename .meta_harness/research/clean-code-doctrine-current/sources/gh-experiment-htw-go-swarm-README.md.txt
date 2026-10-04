# Hunt the Wumpus in Go

This repository is a Go implementation of *Hunt the Wumpus*, the classic 1973 text adventure by Gregory Yob. The game is played entirely through the console. You move through a fixed 20-room dodecahedral cave, read sensory warnings, avoid hazards, and try to kill the Wumpus with crooked arrows.

The implementation keeps the core historical mechanics: a fixed 20-room cave where each room has three tunnels, two bottomless pits, two super bats, one Wumpus, five crooked arrows, warning messages for adjacent hazards, Wumpus wake-and-move behavior, and same-setup replay after losing. It also includes deliberate extensions from the project tasks: the Holy Hand Grenade, Sleepy Wumpus behavior, Jumping Wumpus behavior, and a Rest command.

## Running The Game

Start normal play:

```sh
go run ./cmd/htwgo
```

The terminal asks whether to print instructions, then shows the current room, exits, warnings, arrow count, and a command prompt. Commands are case-insensitive:

```text
m <room>                 move to an adjacent room
s <room1> ... <roomN>    shoot a crooked arrow through 1 to 5 rooms
t <room>                 throw the Holy Hand Grenade when carrying it
r                        rest for one turn
```

Invalid commands are rejected without advancing the game state. Examples include `X IS NOT A COMMAND`, `CAN'T MOVE THERE`, `CAN'T SHOOT THERE`, and `CAN'T THROW THERE`.

## Game Rules

The player starts in one room. The Wumpus, two pits, two bat rooms, and one Holy Hand Grenade are placed in distinct rooms. At the start of each turn the game reports the current room and its three tunnels. It also prints warnings for hazards exactly one tunnel away:

```text
I SMELL A WUMPUS
BATS NEARBY
I FEEL A DRAFT
```

Entering a pit kills the player. Entering a bat room moves the player to a random room, which can immediately trigger another hazard. Entering the Wumpus room or shooting an arrow wakes the Wumpus; it either stays or moves to a neighboring room, and the player loses if the Wumpus ends up in the player's room.

Crooked arrows can travel through one to five named rooms. If a requested arrow segment is not a tunnel, the arrow takes a random valid tunnel from its current room. The player wins if the arrow hits the Wumpus, loses if the arrow hits the player, and loses after exhausting all five arrows.

The extensions add more ways for the cave to behave:

- The Holy Hand Grenade can be picked up, thrown into an adjacent room, and detonates after the next player turn. It kills the Wumpus in the blast radius, destroys bats, leaves pits intact, and can kill the player.
- Sleepy Wumpus rules add snoring, sleeping-room encounters, breakfast deaths, and wake-up messages.
- Jumping Wumpus rules add spontaneous movement after turns, including trample/slam outcomes.
- Rest consumes a turn without moving or shooting; it can still trigger turn-end effects.

## QA Mode

The console has QA-only launch flags for deterministic manual and scripted verification:

```sh
go run ./cmd/htwgo --qa-reveal-state
go run ./cmd/htwgo --qa-inert-hazards
go run ./cmd/htwgo --qa-seed 1973
```

Flags can be combined. `--qa-reveal-state` prints hidden state each turn, `--qa-inert-hazards` keeps hazards visible but suppresses their consequences, and `--qa-seed` fixes initial placement and event randomness.

QA mode also enables prompt commands:

```text
qa set player <room>
qa set wumpus <room>
qa set pits <room1> <room2>
qa set bats <room1> <room2>
qa set hhg <room>
qa set hhg none
qa set arrows <count>
```

The full console-only QA plan is in [QA.md](QA.md).

## Testing

Run the Go test suite:

```sh
go test ./...
```

Run generated acceptance scenarios:

```sh
./scripts/acceptance.sh
```

The acceptance script parses every `features/*.feature` file with `tmp/bin/gherkin-parser`, generates Go acceptance code under `acceptance/generated`, then runs the generated scenarios. Mutation-oriented acceptance support is available through:

```sh
./scripts/acceptance-mutate.sh
```

## Development Process And Timeline

The project was built from scenario-oriented tasks recorded in [tasks.md](tasks.md), feature files under [features](features), and handoff notes in [logbook.md](logbook.md). The logbook shows a multi-role SwarmForge process: specifier agents wrote behavior handoffs, coder agents implemented them, refactorer agents reviewed and reshaped the code, and architect agents hardened design and tests before merging back to `master`.

Major events from the logbook and git history:

- 2026-06-01 17:08 CDT: repository initialized with the SwarmForge structure.
- 2026-06-02 08:14 CDT: Go module initialized and cave topology tests added.
- 2026-06-02 08:17-08:31 CDT: entity placement, movement/hazards, and crooked arrows were implemented.
- 2026-06-02 08:36-09:06 CDT: the interactive loop, same-setup replay, Holy Hand Grenade, Sleepy Wumpus, Jumping Wumpus, and Rest command landed.
- 2026-06-02 09:50-10:06 CDT: playable CLI, QA controls, console QA plan, and generated acceptance test flow were added.
- 2026-06-02 10:59 CDT: non-adjacent hazard warning and Holy Hand Grenade blast-radius defects were fixed.
- 2026-06-02 11:16 CDT: seeded random event fallbacks were added so normal CLI play uses real random events.
- 2026-06-02 12:18 CDT: [architecture.md](architecture.md) documented and executed architecture hardening: event RNG separation, QA setup controls, centralized turn sequencing, replay snapshot naming, and grouped acceptance handlers.

## Project Layout

The main pieces are:

```text
cmd/htwgo/                         playable terminal entry point and QA console controls
internal/wumpus/                   game domain: cave, setup, movement, shooting, hazards, extensions
internal/interactive/              session state, command parsing, turn sequencing, replay prompts
features/                          natural-language feature specifications
acceptance/                        custom feature runner, steps, runtime, and generated scenarios
scripts/                           acceptance and mutation scripts
QA.md                              manual console-only QA plan
architecture.md                    architecture review plan and completed improvements
tasks.md                           implementation task plan
logbook.md                         dated SwarmForge handoff notes
```

## Quick Check From A Fresh Checkout

After installing Go, these commands exercise the important surfaces:

```sh
go test ./...
./scripts/acceptance.sh
go run ./cmd/htwgo
```

The first command verifies the domain, session, CLI, and acceptance support tests. The acceptance script verifies the feature-generated scenarios, and the final command starts the game for human play.
