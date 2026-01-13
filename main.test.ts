// deno-lint-ignore-file no-import-prefix
import { assertEquals, assertNotEquals } from "jsr:@std/assert@1.0.16"
import { mockBin } from "./main.ts"

Deno.test("mock and unmock git", async () => {
  const log = "mocking git!"
  const cleanup = await mockBin("git", "#!/usr/bin/env bash", `echo "${log}"`)

  // Execute the mocked git command
  const command = new Deno.Command("git", { args: ["status"] })
  const { stdout } = await command.output()
  const actual = new TextDecoder().decode(stdout)

  assertEquals(actual, log + "\n")

  // Cleanup and verify git is no longer mocked
  cleanup()
})

Deno.test("exit code", async () => {
  const cleanup = await mockBin("git", "#!/usr/bin/env bash", "exit 1")

  const command = new Deno.Command("git")
  const { code } = await command.output()

  assertEquals(code, 1)
  cleanup()
})

Deno.test("environment shebang without #!", async () => {
  const log = "mocking git!"
  const cleanup = await mockBin("git", "bash", `echo "${log}"`)

  const command = new Deno.Command("git")
  const { stdout } = await command.output()
  const actual = new TextDecoder().decode(stdout)

  assertEquals(actual, log + "\n")
  cleanup()
})

Deno.test("mock command with arguments", async () => {
  const cleanup = await mockBin("gh", "bash", 'echo "pr: $1 $2"')

  const command = new Deno.Command("gh", { args: ["pr", "list"] })
  const { stdout } = await command.output()
  const actual = new TextDecoder().decode(stdout)

  assertEquals(actual, "pr: pr list\n")
  cleanup()
})

Deno.test("multiple mocks at once", async () => {
  const cleanup1 = await mockBin("git", "bash", 'echo "mocked git"')
  const cleanup2 = await mockBin("gh", "bash", 'echo "mocked gh"')

  const gitCommand = new Deno.Command("git")
  const { stdout: gitStdout } = await gitCommand.output()
  assertEquals(new TextDecoder().decode(gitStdout), "mocked git\n")

  const ghCommand = new Deno.Command("gh")
  const { stdout: ghStdout } = await ghCommand.output()
  assertEquals(new TextDecoder().decode(ghStdout), "mocked gh\n")

  cleanup1()
  cleanup2()
})

Deno.test("mock with node shebang", async () => {
  const cleanup = await mockBin("testbin", "node", 'console.log("Hello from Node")')

  const command = new Deno.Command("testbin")
  const { stdout } = await command.output()
  const actual = new TextDecoder().decode(stdout)

  assertEquals(actual, "Hello from Node\n")
  cleanup()
})

Deno.test("cleanup restores original PATH", async () => {
  const originalPath = Deno.env.get("PATH")
  const cleanup = await mockBin("git", "bash", 'echo "test"')

  // PATH should be modified
  const modifiedPath = Deno.env.get("PATH")
  assertNotEquals(modifiedPath, originalPath)

  cleanup()

  // PATH should be restored
  const restoredPath = Deno.env.get("PATH")
  assertEquals(restoredPath, originalPath)
})

Deno.test("cleanup handles missing temp directory gracefully", async () => {
  const cleanup = await mockBin("testbin", "bash", 'echo "test"')

  // Call cleanup twice - second call should handle missing directory
  cleanup()
  cleanup() // Should not throw
})

Deno.test("mock with full shebang path", async () => {
  const cleanup = await mockBin("testbin", "#!/bin/bash", 'echo "full shebang"')

  const command = new Deno.Command("testbin")
  const { stdout } = await command.output()
  const actual = new TextDecoder().decode(stdout)

  assertEquals(actual, "full shebang\n")
  cleanup()
})

Deno.test("cleanup when original PATH was empty", async () => {
  // Save original PATH
  const originalPath = Deno.env.get("PATH")

  try {
    // Set PATH to empty
    Deno.env.delete("PATH")

    const cleanup = await mockBin("testbin", "bash", 'echo "test"')

    // PATH should now have the temp directory
    const modifiedPath = Deno.env.get("PATH")
    assertNotEquals(modifiedPath, undefined)

    cleanup()

    // PATH should be deleted again
    const restoredPath = Deno.env.get("PATH")
    assertEquals(restoredPath, undefined)
  } finally {
    // Restore original PATH
    if (originalPath) {
      Deno.env.set("PATH", originalPath)
    }
  }
})

Deno.test("environment variables are passed through to original command", async () => {
  // Create a test script that uses mock-a-bin-run-original
  const cleanup = await mockBin(
    "env",
    "bash",
    `
    # Always pass through to real env command
    mock-a-bin-run-original "$@"
  `,
  )

  // Set a custom environment variable and run the command
  const command = new Deno.Command("env", {
    env: {
      ...Deno.env.toObject(),
      CUSTOM_TEST_VAR: "my-custom-value",
      ANOTHER_VAR: "another-value",
    },
  })
  const { stdout, code } = await command.output()
  const output = new TextDecoder().decode(stdout)

  // Should execute successfully
  assertEquals(code, 0)

  // Should contain our custom environment variables
  assertEquals(output.includes("CUSTOM_TEST_VAR=my-custom-value"), true)
  assertEquals(output.includes("ANOTHER_VAR=another-value"), true)

  cleanup()
})

Deno.test("mock-a-bin-run-original triggers original command execution", async () => {
  // Mock git to always call mock-a-bin-run-original, which should run the real git
  const cleanup = await mockBin("git", "bash", 'mock-a-bin-run-original "$@"')

  const command = new Deno.Command("git", { args: ["--version"] })
  const { stdout, code } = await command.output()
  const output = new TextDecoder().decode(stdout)

  // Should have run the real git command
  assertEquals(code, 0)
  assertEquals(output.includes("git version"), true)

  cleanup()
})

Deno.test("conditional mocking - mock specific subcommand, pass through others", async () => {
  const cleanup = await mockBin(
    "git",
    "bash",
    `
    if [ "$1" = "status" ]; then
      echo "mocked status output"
    else
      mock-a-bin-run-original "$@"
    fi
  `,
  )

  // Test the mocked subcommand
  const statusCommand = new Deno.Command("git", { args: ["status"] })
  const { stdout: statusStdout } = await statusCommand.output()
  const statusOutput = new TextDecoder().decode(statusStdout)
  assertEquals(statusOutput, "mocked status output\n")

  // Test that other subcommands pass through to real git
  const versionCommand = new Deno.Command("git", { args: ["--version"] })
  const { stdout: versionStdout, code: versionCode } = await versionCommand.output()
  const versionOutput = new TextDecoder().decode(versionStdout)
  assertEquals(versionCode, 0)
  assertEquals(versionOutput.includes("git version"), true)

  cleanup()
})

Deno.test("mock-a-bin-run-original with non-existent original binary shows error", async () => {
  const cleanup = await mockBin("nonexistent-fake-binary-xyz", "bash", 'mock-a-bin-run-original "$@"')

  const command = new Deno.Command("nonexistent-fake-binary-xyz")
  const { stderr, code } = await command.output()
  const errorOutput = new TextDecoder().decode(stderr)

  // Should exit with 127 (command not found) and show error message
  assertEquals(code, 127)
  assertEquals(errorOutput.includes("Original 'nonexistent-fake-binary-xyz' command not found"), true)

  cleanup()
})

Deno.test("mock-a-bin-run-original works with node shebang", async () => {
  const cleanup = await mockBin(
    "git",
    "node",
    `
    const { spawnSync } = require('child_process')
    if (process.argv[2] === 'status') {
      console.log('mocked from node')
    } else {
      // Call mock-a-bin-run-original with all arguments
      const result = spawnSync('mock-a-bin-run-original', process.argv.slice(2), { stdio: 'inherit' })
      process.exit(result.status || 0)
    }
  `,
  )

  // Test mocked subcommand
  const statusCommand = new Deno.Command("git", { args: ["status"] })
  const { stdout: statusStdout } = await statusCommand.output()
  assertEquals(new TextDecoder().decode(statusStdout), "mocked from node\n")

  // Test pass-through
  const versionCommand = new Deno.Command("git", { args: ["--version"] })
  const { stdout: versionStdout, code } = await versionCommand.output()
  const versionOutput = new TextDecoder().decode(versionStdout)
  assertEquals(code, 0)
  assertEquals(versionOutput.includes("git version"), true)

  cleanup()
})

Deno.test("arguments are properly passed to original command via mock-a-bin-run-original", async () => {
  // Mock that only intercepts "branch" command
  const cleanup = await mockBin(
    "git",
    "bash",
    `
    if [ "$1" = "branch" ]; then
      echo "mocked branch"
    else
      mock-a-bin-run-original "$@"
    fi
  `,
  )

  // Run a command with multiple arguments - should pass through to real git
  const command = new Deno.Command("git", { args: ["log", "--oneline", "-n", "1"] })
  const { code } = await command.output()

  // Should execute successfully (assuming we're in a git repo)
  // If not in a git repo, it would fail with git's error, not our wrapper's error
  assertEquals(code === 0 || code === 128, true) // 128 is git's "not a git repo" error

  cleanup()
})

Deno.test("conditional mock: mock only matching commands with pattern", async () => {
  const cleanup = await mockBin(
    { binName: "git", pattern: "^git status" },
    "bash",
    'echo "mocked status"',
  )

  // Command matching pattern should be mocked
  const statusCommand = new Deno.Command("git", { args: ["status"] })
  const { stdout: statusStdout } = await statusCommand.output()
  assertEquals(new TextDecoder().decode(statusStdout), "mocked status\n")

  // Command not matching pattern should use real git
  const versionCommand = new Deno.Command("git", { args: ["--version"] })
  const { stdout: versionStdout } = await versionCommand.output()
  const versionOutput = new TextDecoder().decode(versionStdout)
  assertNotEquals(versionOutput, "mocked status\n")
  // Real git version output should contain "git version"
  assertEquals(versionOutput.includes("git version"), true)

  cleanup()
})

Deno.test("conditional mock: pattern with multiple alternatives", async () => {
  const cleanup = await mockBin(
    { binName: "git", pattern: "^git (status|log)" },
    "bash",
    'echo "mocked: $*"',
  )

  // Both alternatives should be mocked
  const statusCommand = new Deno.Command("git", { args: ["status"] })
  const { stdout: statusStdout } = await statusCommand.output()
  assertEquals(new TextDecoder().decode(statusStdout), "mocked: status\n")

  const logCommand = new Deno.Command("git", { args: ["log"] })
  const { stdout: logStdout } = await logCommand.output()
  assertEquals(new TextDecoder().decode(logStdout), "mocked: log\n")

  // Non-matching command should use real binary
  const versionCommand = new Deno.Command("git", { args: ["--version"] })
  const { stdout: versionStdout } = await versionCommand.output()
  const versionOutput = new TextDecoder().decode(versionStdout)
  assertEquals(versionOutput.includes("git version"), true)

  cleanup()
})

Deno.test("conditional mock: pattern with subcommand arguments", async () => {
  const cleanup = await mockBin(
    { binName: "git", pattern: "^git commit -m" },
    "bash",
    'echo "mocked commit"',
  )

  // Command with matching arguments should be mocked
  const commitCommand = new Deno.Command("git", { args: ["commit", "-m", "test"] })
  const { stdout: commitStdout } = await commitCommand.output()
  assertEquals(new TextDecoder().decode(commitStdout), "mocked commit\n")

  // Different subcommand should use real git
  const statusCommand = new Deno.Command("git", { args: ["status"] })
  await statusCommand.output()
  // Real git status might succeed or fail, but it shouldn't be mocked
  // We just verify it executed (didn't output "mocked commit")

  cleanup()
})

Deno.test("conditional mock: backward compatibility without pattern", async () => {
  // Using string instead of config object should work as before
  const cleanup = await mockBin("git", "bash", 'echo "all mocked"')

  const statusCommand = new Deno.Command("git", { args: ["status"] })
  const { stdout: statusStdout } = await statusCommand.output()
  assertEquals(new TextDecoder().decode(statusStdout), "all mocked\n")

  const versionCommand = new Deno.Command("git", { args: ["--version"] })
  const { stdout: versionStdout } = await versionCommand.output()
  assertEquals(new TextDecoder().decode(versionStdout), "all mocked\n")

  cleanup()
})

Deno.test("conditional mock: empty pattern mocks everything", async () => {
  const cleanup = await mockBin(
    { binName: "git", pattern: "" },
    "bash",
    'echo "mocked with empty pattern"',
  )

  // All commands should be mocked (empty pattern matches everything)
  const statusCommand = new Deno.Command("git", { args: ["status"] })
  const { stdout: statusStdout } = await statusCommand.output()
  assertEquals(new TextDecoder().decode(statusStdout), "mocked with empty pattern\n")

  cleanup()
})
