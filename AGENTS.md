# Agent Guidelines for mock-a-bin

## Tech Stack
- Deno 2.6.1 (TypeScript runtime)
- No package.json - pure Deno project

## Commands
- **Test all**: `deno task test` (runs with --allow-all, coverage, junit reports)
- **Test single file**: `deno test --allow-all main.test.ts`
- **Lint**: `deno task lint` (formats and lints with --fix)
- **Format**: `deno task format`
- **Type check**: `deno check main.ts`

## Code Style
- **Formatting**: No semicolons, 150 char line width (from deno.json)
- **JSDoc**: Use comprehensive comments for exported functions and types
  - Include `@param` and `@returns` tags with descriptions
  - Provide usage examples in JSDoc with `@example` blocks
- **Types**: Use explicit return types, prefer `interface` over `type`
- **Error handling**: Use try-catch and warn on non-critical failures
- **Naming**: camelCase for variables/functions, PascalCase for types/interfaces
- **Variables**: Prefer `const` over `let`, use template literals for strings
- **Imports**: ES6 exports only (e.g., `export function`, `export interface`)
