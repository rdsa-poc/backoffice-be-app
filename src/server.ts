import { pathToFileURL } from "node:url";
import { runServerCli } from "./app/runtime.ts";

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  const exitCode = await runServerCli();
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}
