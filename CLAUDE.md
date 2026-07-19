# Blumo Application Building Context

Before implementing anything or making an architectural decision, read these files in order:

1. `context/project-overview.md` — product purpose, goals, user flow, features, and scope
2. `context/architecture.md` — stack, system boundaries, integrations, storage, and invariants
3. `context/database-schema.md` — tables, relationships, constraints, and RLS expectations
4. `context/security-model.md` — GitHub permissions, safe paths, approval rules, and threat controls
5. `context/ui-context.md` — theme, tokens, typography, responsive layout, and component rules
6. `context/code-standards.md` — TypeScript, Next.js, API, data, testing, and file conventions
7. `context/ai-workflow-rules.md` — implementation workflow and agent behaviour
8. `context/progress-tracker.md` — current state, decisions, open questions, and next action
9. The active file in `context/specs/` — exact scope and verification requirements for the current unit

## Required Behaviour

- Work on exactly one build unit at a time.
- Do not implement behaviour that is not defined in the context files or active specification.
- Do not broaden GitHub permissions or repository write paths without explicit approval.
- Do not expose secrets to client code.
- Do not bypass Supabase RLS, ownership checks, input validation, or commit approval.
- Update `context/progress-tracker.md` after every meaningful implementation change.
- Update the relevant context document before implementing an architectural, product-scope, security, or code-standard change.
- Run the verification checklist in the active specification before marking a unit complete.
