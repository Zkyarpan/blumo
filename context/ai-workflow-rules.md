# Blumo — AI Workflow Rules

## Approach

Build Blumo incrementally using a spec-driven workflow. The context files define the product, architecture, security, visual system, implementation standards, and current progress. The active specification defines exactly what to implement in the current unit.

Do not infer a new product or architecture from a short prompt. Execute the documented system.

## Session Start

At the beginning of every implementation session:

1. Read `CLAUDE.md` or `AGENTS.md`.
2. Read the context files in the required order.
3. Read `context/progress-tracker.md`.
4. Read the active unit specification.
5. Confirm the unit scope and dependencies before editing code.
6. Mark the unit in progress in `progress-tracker.md`.

## Scoping Rules

- Work on one unit at a time.
- Produce one visible or verifiable result per unit.
- Stay within the system boundaries named in the active specification.
- Do not add future features “while already here.”
- Do not perform speculative refactors.
- Do not rename unrelated files.
- Do not change architecture to solve a local implementation inconvenience.
- Install dependencies only when the active unit requires them.
- Do not introduce scheduling, payments, repository analysis, PR mode, or auto-commit before their planned units.

## When to Split Work

Split the unit before implementation if it combines:

- UI shell and live external integration with no intermediate result.
- Database schema and multiple unrelated feature UIs.
- GitHub authentication and AI generation.
- AI generation and GitHub commit creation.
- Email setup and scheduling.
- More than one external provider.
- Multiple independent API routes.
- A security model that is not already defined.
- Work that cannot be verified in one focused session.

Add the revised units to `context/specs/00-build-plan.md` before proceeding.

## Handling Missing or Ambiguous Requirements

- Do not invent behaviour.
- Search the context files for an existing decision.
- If the decision affects only the active unit and has a safe obvious default, record the default in the specification before coding.
- If the decision affects product scope, architecture, security, permissions, stored data, or user trust:
  1. Stop implementation.
  2. Add the question to `progress-tracker.md`.
  3. Resolve it with the project owner.
  4. Update the relevant context file.
  5. Resume only after the decision is documented.

## Protected Files and Areas

Do not modify without explicit instruction:

- `src/components/ui/**` except through an intentional shadcn component addition or documented library-level fix.
- Generated Supabase type files.
- Third-party package internals.
- Lockfiles except through the package manager.
- Existing migrations after they have been applied to a shared environment.
- `.github/**`.
- Environment secret files.
- GitHub App permissions.
- RLS policies unrelated to the active unit.
- Security path allowlists.

## Security Rules

- Never place a server secret in client code.
- Never use the Supabase service role from the browser.
- Never request a GitHub personal access token.
- Never trust client-provided ownership.
- Never bypass RLS to make a feature work.
- Never trust AI output.
- Never allow a target path outside `blumo/**` in the MVP.
- Never create a commit without the documented approval flow.
- Never process a GitHub webhook before signature verification.
- Never log credentials or provider tokens.

## Implementation Rules

- Preserve established domain names and folder ownership.
- Reuse existing schemas and error types.
- Validate external input at the boundary.
- Keep provider-specific logic inside its adapter.
- Keep route handlers thin.
- Write or update tests for security-sensitive and domain logic.
- Add clear failure and empty states for user-facing flows.
- Do not claim a task is complete until verification passes.

## Documentation Synchronization

Update the relevant file before continuing when implementation changes:

- Product behaviour or scope → `project-overview.md`.
- Stack, integration, boundary, or invariant → `architecture.md`.
- Tables, constraints, or RLS → `database-schema.md`.
- Permission or threat control → `security-model.md`.
- UI token or layout convention → `ui-context.md`.
- Implementation convention → `code-standards.md`.
- Build order → `specs/00-build-plan.md`.

Update `progress-tracker.md` after each meaningful change.

## Verification Before Moving On

The unit is complete only when:

1. Every item in the active specification is implemented.
2. Every verification checkbox is checked.
3. The result works in its intended responsive states.
4. Loading, empty, error, and success states are handled where relevant.
5. Authentication and ownership checks are present at mutation boundaries.
6. No architecture invariant is violated.
7. Relevant tests pass.
8. Linting and type checking pass.
9. The production build passes.
10. `progress-tracker.md` is updated.
11. The next unit is identified but not implemented.

## Correction Prompt Pattern

When something is wrong, fix only the named mismatch:

```text
The [specific element] does not match the active specification.

Expected:
[exact required behaviour]

Current:
[observed behaviour]

Fix only this mismatch. Preserve unrelated code and do not broaden the unit.
```

## Unit Completion Pattern

After verification:

```text
The active unit is implemented and verified.
Update context/progress-tracker.md:
- mark the unit complete
- record important decisions
- identify the next unit

Do not begin the next unit.
```
