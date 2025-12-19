# mock-a-bin

> Mock any executable binary

Have a script that executes shell commands? Want to test these scripts by mocking the commands they run? This tool lets you easily mock any executable binary by injecting a mock script into your PATH.

This is a Deno-native alternative to the npm package [mock-bin](https://github.com/stevemao/mock-bin).

## Usage

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

## Special Thanks

This project was inspired by and is a Deno equivalent of [mock-bin](https://github.com/stevemao/mock-bin) by [Steve Mao](https://github.com/stevemao). Without it, this project probably wouldn't exist.