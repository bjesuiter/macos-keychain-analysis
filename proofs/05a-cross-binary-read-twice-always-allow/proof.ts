#!/usr/bin/env bun

/**
 * Proof 05a: create with security CLI, read twice with keychain-probe,
 * choosing Always Allow on the first read.
 *
 * Goal: observe whether Always Allow makes a second cross-binary secret read
 * silent, and whether that persistent allowance appears in the item's ACL list
 * or is stored out-of-band by macOS.
 */

const account = "macos-keychain-analysis";
const password = "disposable-proof-secret";
const service = "macos-keychain-analysis.proof-05a.cross-binary-read-twice-always-allow";
const label = "macos-keychain-analysis proof 05a cross binary read twice always allow";
const cleanupOnly = Bun.argv.includes("--cleanup");
const observationPath = "observations/macos-26.5.1.md";
const packagePath = "packages/keychain-probe";
const probePath = "packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe";
const securityPath = "/usr/bin/security";

type CommandResult = { command: string; exitCode: number; stdout: string; stderr: string };

async function runCommand(args: string[]): Promise<CommandResult> {
  const command = args.map(quoteShell).join(" ");
  console.log(`\n$ ${command}`);
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (stdout.trim().length > 0) console.log(stdout.trimEnd());
  if (stderr.trim().length > 0) console.error(stderr.trimEnd());
  console.log(`exit: ${exitCode}`);
  return { command, exitCode, stdout, stderr };
}

function quoteShell(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function runProbe(args: string[]) { return runCommand([probePath, ...args]); }
async function runSecurity(args: string[]) { return runCommand([securityPath, ...args]); }

async function printEnvironment() {
  const swVers = Bun.spawn(["/usr/bin/sw_vers"], { stdout: "pipe", stderr: "pipe" });
  const swVersOutput = await new Response(swVers.stdout).text();
  await swVers.exited;
  console.log("# Proof 05a: cross-binary read twice with Always Allow");
  console.log("\n## Environment");
  console.log(swVersOutput.trimEnd());
  console.log(`shell: ${process.env.SHELL ?? "unknown"}`);
  console.log(`bun: ${Bun.version}`);
  console.log(`creator: ${securityPath}`);
  console.log(`reader: ${probePath}`);
}

async function cleanup() {
  await runSecurity(["delete-generic-password", "-a", account, "-s", service]);
}

function parseJsonLine<T>(stdout: string): T | undefined {
  const line = stdout.trim().split("\n").find((candidate) => candidate.trim().startsWith("{"));
  if (!line) return undefined;
  return JSON.parse(line) as T;
}

async function readWithProbe(label: string) {
  console.log(`\n### ${label}`);
  const read = await runProbe(["read", "--service", service, "--account", account]);
  const parsed = parseJsonLine<{ ok: boolean; result?: { value?: string } }>(read.stdout);
  console.log(`read matched expected disposable secret: ${parsed?.result?.value === password ? "yes" : "no"}`);
}

async function main() {
  await printEnvironment();

  console.log("\n## Build keychain-probe");
  await runCommand(["/usr/bin/swift", "build", "--package-path", packagePath]);

  if (cleanupOnly) {
    console.log("\n## Cleanup only");
    await cleanup();
    return;
  }

  console.log("\n## What to record manually");
  console.log("For the first keychain-probe read, enter the login keychain password and choose Always Allow / Immer erlauben.");
  console.log("Record whether the second read prompts, and whether ACL output gains keychain-probe.");
  console.log(`Record observations in: ${observationPath}`);

  console.log("\n## Case: security-create-probe-read-twice-always-allow");
  console.log(`service: ${service}`);
  console.log("expected: Always Allow may make the second read silent. Hypothesis: persistent allowance may be stored out-of-band and not appear as keychain-probe in the item ACL list.");

  console.log("\n### Setup: remove stale item");
  await cleanup();

  console.log("\n### Create disposable generic password via /usr/bin/security");
  await runSecurity(["add-generic-password", "-a", account, "-s", service, "-w", password, "-l", label]);

  console.log("\n### Identify keychain-probe binary");
  await runProbe(["whoami"]);

  console.log("\n### Inspect ACL list before reads");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  await readWithProbe("First password read via keychain-probe: choose Always Allow / Immer erlauben");

  console.log("\n### Inspect ACL list after first read / Always Allow");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  await readWithProbe("Second password read via keychain-probe");

  console.log("\n### Inspect ACL list after second read");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  console.log("\n## Cleanup command");
  console.log("bun run proof:05a:cleanup");
  console.log(`\n## Observation log\nRecord prompt observations in: ${observationPath}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
