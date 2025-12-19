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
  const realCommand = new Deno.Command("git", { args: ["--version"] })
  const { stdout: realStdout } = await realCommand.output()
  const realOutput = new TextDecoder().decode(realStdout)

  assertNotEquals(realOutput, log + "\n")
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
