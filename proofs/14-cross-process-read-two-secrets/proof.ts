#!/usr/bin/env bun

/**
 * Proof 14: create two generic passwords with /usr/bin/security, read both with keychain-probe.
 *
 * Goal: confirm the observed macOS behavior that two cross-process secret reads can produce
 * four GUI prompts total: two prompts per secret read.
 */

const account = "macos-keychain-analysis";
const password1 = "disposable-proof-secret-one";
const password2 = "disposable-proof-secret-two";
const service1 = "macos-keychain-analysis.proof-14.cross-process-two-secrets.one";
const service2 = "macos-keychain-analysis.proof-14.cross-process-two-secrets.two";
const label1 = "macos-keychain-analysis proof 14 cross-process two secrets one";
const label2 = "macos-keychain-analysis proof 14 cross-process two secrets two";
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
  if (stdout.trim()) console.log(stdout.trimEnd());
  if (stderr.trim()) console.error(stderr.trimEnd());
  console.log(`exit: ${exitCode}`);
  return { command, stdout, stderr, exitCode };
}

function quoteShell(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function runProbe(args: string[]) { return runCommand([probePath, ...args]); }
async function runSecurity(args: string[]) { return runCommand([securityPath, ...args]); }

async function cleanup() {
  await runSecurity(["delete-generic-password", "-a", account, "-s", service1]);
  await runSecurity(["delete-generic-password", "-a", account, "-s", service2]);
}

function parseJsonLine<T>(stdout: string): T | undefined {
  const line = stdout.trim().split("\n").find((candidate) => candidate.trim().startsWith("{"));
  if (!line) return undefined;
  return JSON.parse(line) as T;
}

async function readWithProbe(label: string, service: string, expectedPassword: string) {
  console.log(`\n### ${label}`);
  const read = await runProbe(["read", "--service", service, "--account", account]);
  const parsed = parseJsonLine<{ ok: boolean; result?: { value?: string } }>(read.stdout);
  console.log(`read matched expected disposable secret: ${parsed?.result?.value === expectedPassword ? "yes" : "no"}`);
}

async function main() {
  console.log("# Proof 14: cross-process read of two secrets");
  console.log("\n## Build keychain-probe");
  await runCommand(["/usr/bin/swift", "build", "--package-path", packagePath]);

  if (cleanupOnly) {
    console.log("\n## Cleanup only");
    await cleanup();
    return;
  }

  console.log("\n## What to record manually");
  console.log("Expected based on prior observations: each keychain-probe password read of a /usr/bin/security-created item may show two prompts, for four prompts total across two secrets.");
  console.log("For each prompt, record wording, app name, and whether you clicked Allow, Always Allow, Deny, or Cancel.");
  console.log(`Record observations in: ${observationPath}`);

  console.log("\n### Setup: remove stale items");
  await cleanup();

  console.log("\n### Create disposable generic passwords via /usr/bin/security");
  await runSecurity(["add-generic-password", "-a", account, "-s", service1, "-w", password1, "-l", label1]);
  await runSecurity(["add-generic-password", "-a", account, "-s", service2, "-w", password2, "-l", label2]);

  console.log("\n### Identify keychain-probe binary");
  await runProbe(["whoami"]);

  await readWithProbe("Read first password value via keychain-probe", service1, password1);
  await readWithProbe("Read second password value via keychain-probe", service2, password2);

  console.log("\n## Cleanup command");
  console.log("bun run proof:14:cleanup");
  console.log(`\n## Observation log\nRecord prompt observations in: ${observationPath}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
