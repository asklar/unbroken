#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const execSync = require("child_process").execSync;

function main() {
  console.log("publish.js - Start");

  const gitStatus = execSync("git status --porcelain=v1").toString();
  if (gitStatus) {
    console.error(`Error: Uncommitted files in the repo.`);
    process.exit(1);
  }

  const branch = execSync(`git branch --show-current`).toString().trim();
  if (branch !== "master") {
    console.error(
      `Error: You must run this script from master. Current branch is: ${branch}`
    );
    process.exit(1);
  }

  const upstreamBranch = execSync("git rev-parse --abbrev-ref master@{u}")
    .toString()
    .trim();
  const remote = upstreamBranch.split("/")[0];
  const remoteUrl = execSync(`git config --get remote.${remote}.url`)
    .toString()
    .trim();

  const repoUrl = "https://github.com/asklar/unbroken";
  if (remoteUrl !== repoUrl && remoteUrl !== `${repoUrl}.git`) {
    console.error(`Error: Upstream is not the official unbroken repository.`);
    console.error(`remote url is ${remoteUrl}`);
    process.exit(1);
  }

  console.log("Bumping the version.");
  execSync("npx bump");

  const version = require(path.resolve(
    __dirname,
    "..",
    "package.json"
  )).version.trim();

  console.log(`New version is ${version}.`);

  console.log("Committing the change.");
  execSync('git commit -m "bump package.json" -i package.json');

  console.log(`Creating the tag v${version}.`);
  execSync(`git tag v${version}`);

  console.log("Pushing the commit to github.");
  execSync("git push");

  console.log("Pushing the tag to github.");
  execSync("git push --tags");

  console.log(
    "publish.js - Complete! Check https://github.com/asklar/unbroken/actions for publish status."
  );
}

main();
