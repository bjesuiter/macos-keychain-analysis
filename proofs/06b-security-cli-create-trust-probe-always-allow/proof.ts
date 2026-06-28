#!/usr/bin/env bun

/**
 * Proof 06b: create with security CLI -T keychain-probe, then choose Always Allow.
 *
 * Goal: observe whether Always Allow on the remaining key-access prompt after
 * `security add-generic-password -T keychain-probe` makes future reads silent,
 * and whether ACL output changes further.
 */

const account = "macos-keychain-analysis";
const password = "disposable-proof-secret";
const service = "macos-keychain-analysis.proof-06b.security-trust-probe-always-allow";
const label = "macos-keychain-analysis proof 06b security trust probe always allow";
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
  console.log("# Proof 06b: security -T keychain-probe, then Always Allow");
  console.log("\n## Environment");
  const swVers = Bun.spawn(["/usr/bin/sw_vers"], { stdout: "pipe" });
  console.log((await new Response(swVers.stdout).text()).trimEnd());
  await swVers.exited;
  console.log(`shell: ${process.env.SHELL ?? "unknown"}`);
  console.log(`bun: ${Bun.version}`);
  console.log(`creator: ${securityPath}`);
  console.log(`trusted reader: ${probePath}`);

  console.log("\n## Build keychain-probe");
  await runCommand(["/usr/bin/swift", "build", "--package-path", packagePath]);

  if (cleanupOnly) {
    console.log("\n## Cleanup only");
    await cleanup();
    return;
  }

  console.log("\n## What to record manually");
  console.log("On the first keychain-probe read prompt, enter the login keychain password and click Always Allow / Immer erlauben.");
  console.log("Record whether the second read prompts, and whether ACL output changes after Always Allow.");
  console.log(`Record observations in: ${observationPath}`);

  console.log("\n### Setup: remove stale item");
  await cleanup();

  console.log("\n### Identify keychain-probe binary");
  await runProbe(["whoami"]);

  console.log("\n### Create item via /usr/bin/security with -T keychain-probe");
  await runSecurity(["add-generic-password", "-a", account, "-s", service, "-w", password, "-l", label, "-T", probePath]);

  console.log("\n### Inspect ACL list before Always Allow");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  await readWithProbe("First password read via keychain-probe: choose Always Allow / Immer erlauben");

  console.log("\n### Inspect ACL list after Always Allow");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  await readWithProbe("Second password read via keychain-probe");

  console.log("\n### Inspect ACL list after second read");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  console.log("\n## Cleanup command");
  console.log("bun run proof:06b:cleanup");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
