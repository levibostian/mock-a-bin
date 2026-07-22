# Agent Guidelines for mock-a-bin

## Quick Start

``` bash
pnpm install
pnpm build    # type-check
pnpm test     # run tests
pnpm lint     # lint all files
```

## Required Workflow

Always run these before considering work complete:

``` bash
pnpm build && pnpm lint && pnpm test
```

All three must pass with zero errors.

## Coding Conventions (Enforced)

These are **not** preferences — the toolchain will fail if you violate
them:

### No function declarations

Use `const` + arrow function instead.

``` ts
// ❌ Wrong
function foo() {}

// ✅ Right
const foo = (): void => {};
```

### No inline exports

Write `export` as a separate statement.

``` ts
// ❌ Wrong
export const foo = 1;

// ✅ Right
const foo = 1;
export { foo };
```

### Single-statement braces are stripped

`if`/`for`/`while` with a single body statement should not have braces.

``` ts
// ❌ Wrong
if (done) {
  return;
}

// ✅ Right
if (done)
  return;
```

### Formatting

- Double quotes
- 2-space indentation
- 80-character line width
- Trailing commas
- Semicolons
- Arrow function parentheses always

## Formatting

If the linter complains about formatting, run:

``` bash
pnpm format
```

## Project Structure

- Source code lives in `src/`
- Tests live in `src/tests/` (filenames end in `.test.ts`)
- TypeScript is type-check only (`noEmit: true`) — use `tsx` for dev
  execution
- ESM only (`"type": "module"`)
