# mock-a-bin

> Mock any executable binary

Have a script that executes shell commands? Want to test these scripts
by mocking the commands they run? This tool lets you easily mock any
executable binary by injecting a mock script into your PATH.

## Prerequisites

- [Node.js](https://nodejs.org) 26 and [pnpm](https://pnpm.io) (enforced
  via `engines`)
- [pandoc](https://pandoc.org) ≥ 3.1 — required by `pnpm lint:md` /
  `pnpm format:md`

## Installation

``` bash
pnpm install
```

## Usage

### Basic Usage - Mock All Commands

``` ts
import { spawnSync } from "node:child_process";
import { mockBin } from "mock-a-bin";

// Mock the 'gh' command to return custom output
const cleanup = await mockBin(
  "gh",                      // binName: the command to mock
  "bash",                    // shebang: interpreter that runs your code
  'echo "mocked output"',    // code: the script code that gets executed
);

// Now any calls to 'gh' will execute the mock script
const result = spawnSync("gh", ["pr", "list"], { encoding: "utf8" });
console.log(result.stdout); // "mocked output"

cleanup(); // Restore original PATH
```

## Conditional Mocking

Sometimes you want to mock only specific commands or subcommands while
allowing others to run normally. There are two approaches:

### Option 1: Pattern-Based Mocking

Use regex patterns to automatically mock only specific commands while
allowing others to run normally:

``` ts
import { spawnSync } from "node:child_process";
import { mockBin } from "mock-a-bin";

// Mock only 'gh pr list' and 'gh pr view' commands
const cleanup = await mockBin(
  {
    binName: "gh",
    pattern: "^gh pr (list|view)",  // regex pattern to match
  },
  "bash",
  'echo "mocked PR command"',
);

// This command matches the pattern and will be mocked
const prList = spawnSync("gh", ["pr", "list"], { encoding: "utf8" });
console.log(prList.stdout); // "mocked PR command"

// This command doesn't match the pattern and will run the real 'gh'
const issue = spawnSync("gh", ["issue", "list"], { encoding: "utf8" });
console.log(issue.stdout); // Real gh output

cleanup(); // Restore original PATH
```

**Pattern Matching Examples:**

``` ts
// Mock only git status
await mockBin(
  { binName: "git", pattern: "^git status" },
  "bash",
  'echo "modified: file.txt"',
);

// Mock git commit with any message
await mockBin(
  { binName: "git", pattern: "^git commit -m" },
  "bash",
  'echo "[main abc123] Commit message"',
);

// Mock multiple subcommands
await mockBin(
  { binName: "docker", pattern: "^docker (build|push)" },
  "bash",
  'echo "Docker operation mocked"',
);
```

### Option 2: Script-Based Conditional Mocking with `mock-a-bin-run-original`

When you create a mock with `mockBin()`, a special helper binary called
`mock-a-bin-run-original` is automatically created. Your mock script can
call this binary to execute the original command instead of the mock.
This gives you more flexibility to make decisions in your script logic.

``` ts
import { spawnSync } from "node:child_process";
import { mockBin } from "mock-a-bin";

// Mock only "git status" but pass through everything else to the real git
const cleanup = await mockBin("git", "bash", `
  if [ "$1" = "status" ]; then
    echo "Everything is clean!"
  else
    mock-a-bin-run-original "$@"
  fi
`);

// This uses the mock
const status = spawnSync("git", ["status"], { encoding: "utf8" });
// Output: "Everything is clean!"

// This runs the real git
const version = spawnSync("git", ["--version"], { encoding: "utf8" });
// Output: "git version 2.x.x" (actual git output)

cleanup();
```

This works with any interpreter (bash, node, python, etc.):

``` ts
// Node.js example
const cleanup = await mockBin("git", "node", `
  const { spawnSync } = require('child_process')
  if (process.argv[2] === 'status') {
    console.log('Mocked status')
  } else {
    const result = spawnSync('mock-a-bin-run-original', process.argv.slice(2), { stdio: 'inherit' })
    process.exit(result.status || 0)
  }
`);

// Python example
const cleanup = await mockBin("git", "python", `
import sys
import subprocess
if len(sys.argv) > 1 and sys.argv[1] == 'status':
    print('Mocked status')
else:
    sys.exit(subprocess.call(['mock-a-bin-run-original'] + sys.argv[1:]))
`);
```

**Key Benefits:**

- ✅ **Human-readable**: `mock-a-bin-run-original "$@"` is
  self-documenting
- ✅ **Language-agnostic**: Works with bash, node, python, ruby, etc.
- ✅ **Preserves everything**: Arguments, environment variables, exit
  codes all pass through
- ✅ **Error handling**: Shows helpful error if original binary doesn’t
  exist

### Which Approach Should I Use?

- **Use Pattern-Based Mocking** when you have simple, static matching
  criteria (e.g., “mock all `gh pr` commands”)
- **Use Script-Based Mocking with `mock-a-bin-run-original`** when you
  need more complex logic or want to inspect arguments/environment
  variables before deciding whether to mock

## Scripts

``` bash
pnpm build    # type-check with tsc
pnpm test     # run unit tests
pnpm lint     # run all linters
pnpm format   # run all formatters (auto-fix)
```

## Special Thanks

This project was inspired by
[mock-bin](https://github.com/stevemao/mock-bin) by [Steve
Mao](https://github.com/stevemao). Without it, this project probably
wouldn’t exist.
