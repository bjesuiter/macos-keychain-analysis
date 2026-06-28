#!/usr/bin/env bun

/**
 * Proof 01: security-cli create and read own generic password.
 *
 * This proof uses the macOS `security` CLI at `/usr/bin/security`.
 *
 * Goal: observe whether `/usr/bin/security add-generic-password` followed by
 * `/usr/bin/security find-generic-password -w` can read the item without a
 * Keychain prompt, and whether an explicit trusted app changes that behavior.
 */

const account = "macos-keychain-analysis";
const password = "disposable-proof-secret";
const servicePrefix = "macos-keychain-analysis.proof-01";
const cleanupOnly = Bun.argv.includes("--cleanup");
const observationPath = "observations/macos-26.5.1.md";

const cases = [
  {
    name: "default-access",
    service: `${servicePrefix}.default-access`,
    addArgs: [],
    expected: "Creation should normally be silent. Read may prompt depending on the default ACL macOS creates for /usr/bin/security.",
  },
  {
    name: "trusted-security-cli",
    service: `${servicePrefix}.trusted-security-cli`,
    addArgs: ["-T", "/usr/bin/security"],
    expected: "Creation should normally be silent. Read is expected to be silent because /usr/bin/security is explicitly trusted.",
  },
];

type CommandResult = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

async function runSecurity(args: string[]): Promise<CommandResult> {
  const command = ["/usr/bin/security", ...args].map(quoteShell).join(" ");
  console.log(`\n$ ${command}`);

  const proc = Bun.spawn(["/usr/bin/security", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

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

async function cleanup(service: string): Promise<void> {
  await runSecurity(["delete-generic-password", "-a", account, "-s", service]);
}

async function printEnvironment(): Promise<void> {
  const swVers = Bun.spawn(["/usr/bin/sw_vers"], { stdout: "pipe", stderr: "pipe" });
  const swVersOutput = await new Response(swVers.stdout).text();
  await swVers.exited;

  console.log("# Proof 01: security-cli create and read own generic password");
  console.log("\n## Environment");
  console.log(swVersOutput.trimEnd());
  console.log(`shell: ${process.env.SHELL ?? "unknown"}`);
  console.log(`bun: ${Bun.version}`);
  console.log("tool: /usr/bin/security");
}

async function main(): Promise<void> {
  await printEnvironment();

  if (cleanupOnly) {
    console.log("\n## Cleanup only");
    for (const proofCase of cases) {
      console.log(`\n### ${proofCase.name}`);
      await cleanup(proofCase.service);
    }
    return;
  }

  console.log("\n## What to record manually");
  console.log("For each command, note whether macOS showed a Keychain prompt, the app name shown in the prompt, and whether you clicked Allow, Always Allow, Deny, or Cancel.");
  console.log(`Record observations in: ${observationPath}`);

  for (const proofCase of cases) {
    console.log(`\n## Case: ${proofCase.name}`);
    console.log(`service: ${proofCase.service}`);
    console.log(`expected: ${proofCase.expected}`);

    console.log("\n### Setup: remove any stale item");
    await cleanup(proofCase.service);

    console.log("\n### Create disposable generic password");
    await runSecurity([
      "add-generic-password",
      "-a",
      account,
      "-s",
      proofCase.service,
      "-w",
      password,
      ...proofCase.addArgs,
    ]);

    console.log("\n### Read password value");
    const read = await runSecurity(["find-generic-password", "-a", account, "-s", proofCase.service, "-w"]);
    const readValue = read.stdout.trim();
    console.log(`read matched expected disposable secret: ${readValue === password ? "yes" : "no"}`);

    console.log("\n### Inspect item attributes");
    await runSecurity(["find-generic-password", "-a", account, "-s", proofCase.service]);
  }

  console.log("\n## Cleanup command");
  console.log("bun run proof:01:cleanup");
  console.log(`\n## Observation log\nRecord prompt observations in: ${observationPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
