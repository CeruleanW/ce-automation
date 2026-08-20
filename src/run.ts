import "dotenv/config";
import process from "node:process";
import { main } from "./cli.ts";

const exitCode = await main(process.argv.slice(2));
if (exitCode !== 0) {
  process.exit(exitCode);
}
