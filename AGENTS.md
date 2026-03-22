# Agent Instructions

## Scope

These rules apply to any agent or assistant making changes in this repository.

## Git Workflow

1. After every user request that changes project files, create a local git commit immediately after the changes are complete.
2. Do not run `git push` unless the user explicitly asks for it.
3. Write the commit message yourself. Keep it short, specific, and aligned with the actual change.
4. If a user request does not modify project files, do not create a commit.

## Data Access

1. Design all data access from an API-first perspective.
2. Assume that, over time, all application data will be fetched from the server on demand.
3. Do not rely on a "fat client" architecture where the client owns, preloads, or derives critical data that should come from the backend.
4. When making architectural or implementation decisions, prefer patterns that keep the client ready to consume server-provided data via explicit requests.
