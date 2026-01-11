# mock-a-bin

> Mock any executable binary

Have a script that executes shell commands? Want to test these scripts by mocking the commands they run? This tool lets you easily mock any executable binary by injecting a mock script into your PATH.

This is a Deno-native alternative to the npm package [mock-bin](https://github.com/stevemao/mock-bin).

## Usage

### Basic Usage - Mock All Commands

```ts
import { mockBin } from "jsr:@levibostian/mock-a-bin"

// Mock the 'gh' command to return custom output
const cleanup = await mockBin(
  "gh",                      // binName: the command to mock
  "bash",                    // shebang: interpreter that runs your code (bash, node, python, etc.)
  'echo "mocked output"'     // code: the script code that gets executed by the interpreter
)

// Now any calls to 'gh' will execute the mock script
const command = new Deno.Command("gh", { args: ["pr", "list"] })
const { stdout } = await command.output()
const output = new TextDecoder().decode(stdout)
console.log(output) // "mocked output"

cleanup() // Restore original PATH
```

### Conditional Mocking - Mock Only Specific Commands

You can use regex patterns to mock only specific commands while allowing others to run normally:

```ts
import { mockBin } from "jsr:@levibostian/mock-a-bin"

// Mock only 'gh pr list' and 'gh pr view' commands
const cleanup = await mockBin(
  {
    binName: "gh",
    pattern: "^gh pr (list|view)"  // regex pattern to match against full command
  },
  "bash",
  'echo "mocked PR command"'
)

// This command matches the pattern and will be mocked
const prListCommand = new Deno.Command("gh", { args: ["pr", "list"] })
const { stdout } = await prListCommand.output()
console.log(new TextDecoder().decode(stdout)) // "mocked PR command"

// This command doesn't match the pattern and will run the real 'gh' binary
const issueCommand = new Deno.Command("gh", { args: ["issue", "list"] })
const { stdout: realStdout } = await issueCommand.output()
console.log(new TextDecoder().decode(realStdout)) // Real gh output

cleanup() // Restore original PATH
```

### Pattern Matching Examples

```ts
// Mock only git status
await mockBin(
  { binName: "git", pattern: "^git status" },
  "bash",
  'echo "modified: file.txt"'
)

// Mock git commit with any message
await mockBin(
  { binName: "git", pattern: "^git commit -m" },
  "bash",
  'echo "[main abc123] Commit message"'
)

// Mock multiple subcommands
await mockBin(
  { binName: "docker", pattern: "^docker (build|push)" },
  "bash",
  'echo "Docker operation mocked"'
)
```

## Special Thanks

This project was inspired by and is a Deno equivalent of [mock-bin](https://github.com/stevemao/mock-bin) by [Steve Mao](https://github.com/stevemao). Without it, this project probably wouldn't exist.