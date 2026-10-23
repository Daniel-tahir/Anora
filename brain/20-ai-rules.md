# AI Development Rules & Guidelines

This document details permanent guidelines and requirements that AI coding assistants MUST follow when working on the ANORA codebase.

> [!IMPORTANT]
> Always read these guidelines and the files inside the `brain/` folder before analyzing source code or proposing changes.

## Development Constraints

- **Preserve Existing Architecture**: Avoid making structural or design changes unless explicitly requested. Respect the decoupled layout.
- **Never Redesign the UI**: Avoid styling overhauls. Keep the desktop/tablet interface pixel-identical to the original build.
- **No Secrets in Code**: Never hardcode API keys, credentials, or values for environment variables. Read variables only from the validated singleton helper [server/config/env.ts](file:///c:/Users/DC/Downloads/anora-elegance-atelier-main/anora-elegance-atelier-main/server/config/env.ts).
- **Prefer Refactoring Over Rewriting**: Modify only the lines relevant to the bug or feature, avoiding complete rewrites of functioning code modules.

## Tech Stack Rules

### 1. Supabase & Database
- **RLS Enforcement**: Ensure RLS is active on any new tables. Write policies using direct role checking (e.g. `TO authenticated`) rather than deprecated checking.
- **RPC Qualifications**: Always use schema-qualified names (e.g. `public.create_order_from_payment`) inside queries to prevent search path lookup conflicts.
- **RPC Renames**: Never rename database functions without updating all frontend and backend codebase references.

### 2. Frontend Frameworks
- **TanStack Router**: Follow standard route definitions. Update `routeTree.gen.ts` as needed on path modifications.
- **React Query**: Maintain query-key mappings (e.g., `["active-categories"]`). Avoid duplicate key registrations.

### 3. Server Dependencies
- **Dependency Injection**: Always use the container constructor pattern inside services. Never import singleton instances directly at module scope.
- **Structured Logging**: Use the logger (`logger.info`, `logger.error`) outputting JSON lines. Do not use standard `console.log` messages.
