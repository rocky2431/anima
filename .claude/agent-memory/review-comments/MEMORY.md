# Review Comments Agent Memory

## Project Patterns
- This project uses "walking skeleton" iterative development; many files contain scope-limiting comments like "Walking skeleton: only X is supported" that will rot quickly.
- JSDoc is used consistently on all exported interfaces and functions.
- The project uses Chinese for some user-facing strings (response templates in persona-engine).
- `@guiiai/logg` is the structured logger used in the app layer.

## Common Comment Issues in This Codebase
- "Walking skeleton" scope annotations appear frequently and should be flagged as P3 (will rot).
- Forward-looking comments referencing specific future technologies (e.g., "future LanceDB implementation") are P2 (misleading + rot risk).
- "Future: replaced by X" patterns function as disguised TODOs and should be flagged P2.
- New packages (e.g., cron-service) sometimes ship with zero JSDoc despite the project convention. Flag as P2 for missing documentation on public APIs.
