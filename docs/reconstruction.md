# Reconstruction plan
## Milestone 1: structure and design
Curriculum, repository conventions, reading shell, reusable lesson composition, responsive styling, and expected-value interaction.

## Milestone 2: marketplace and data
Restore chapters 1–6 with reviewed equations, sources, editable exercises, and logging schemas. Restore the simulation with declared assumptions and deterministic random streams.

## Milestone 3: learning and evaluation
Chapters 7–9, independent train/validation/test sets, real optimization, metric correctness, uncertainty, and learning progress export/import.

## Milestone 4: architectures and conversions
Chapters 10–13: retrieval, ranking, attention, delayed conversion labels, multi-task heads, and freshness. Clearly distinguish a teaching implementation from the architecture in each cited paper.

## Milestone 5: quality and capstone
Chapters 14–15, glossary, PM question bank, budget and pacing mechanics, holdouts, explicit limitations of behavioral feedback models.

## Architecture
Content and curriculum separate from navigation and visual components. Simulation, training, and evaluation modules independent of the page; long jobs eventually run in workers. Version saved learner state and support export/import. Never retain a trained model across incompatible world versions.

## Completion gates
Check links and scripts, keyboard/mobile behavior, mathematical assumptions, and exercise outcomes. Make a focused commit, push it, and verify the remote commit before declaring a milestone remotely backed up.

## Not recovered
Original complete text, world.js, stack.js, autodiff engine, persisted learner state, and published source verification. Conversation history supplies requirements and design decisions, not a byte-for-byte backup.
