#!/usr/bin/env node
import commandLineArgs from "command-line-args";
import commandLineUsage from "command-line-usage";
import { Checker, Options } from "./checker.js";

import * as fs from "node:fs";
import chalk from "chalk";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function unbroken(options: Options) {
  const c = new Checker(options);
  const n = await c.Process();
  if (c.errors.length) {
    if (!options.superquiet) {
      console.log(`${n} errors, ${c.errors.length - n} warnings.`);
    }
  }
  return n;
}

async function Do() {
  const options = commandLineArgs(Checker.optionDefinitions);

  const usage = commandLineUsage([
    { header: "Options", optionList: Checker.optionDefinitions },
    { content: "Project home: {underline https://github.com/asklar/unbroken}" },
  ]);

  if (options.help) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const version = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../package.json")).toString()
    ).version;

    console.log(
      chalk.cyan.underline.bold(`Unbroken ${version}`),
      "- no more broken links in markdown!"
    );
    console.log(usage);
    process.exit(0);
  } else if (options.init) {
    if (fs.existsSync(".unbroken_exclusions")) {
      console.error(".unbroken_exclusions already exists");
      process.exit(-1);
    } else {
      fs.writeFileSync(".unbroken_exclusions", "!node_modules");
      process.exit(0);
    }
  }
  process.exitCode = await unbroken(options as Options);
}

Do();
