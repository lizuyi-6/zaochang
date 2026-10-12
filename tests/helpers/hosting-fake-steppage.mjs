import { runFakeSteppage } from "./hosting-fake-steppage-core.mjs";

const result = await runFakeSteppage({ argv: process.argv.slice(2), env: process.env });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
