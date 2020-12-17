import * as unbroken from "../lib/checker";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";

interface TestCase {
  name: string;
  expected: number;
  options: unbroken.Options;
}

function AssertAreEqual(a: any, b: any, testcase: string) {
  if (a !== b) {
    console.log(testcase, chalk.redBright(`Expected ${a}, actual ${b}`));
    throw new Error(`${testcase} - expected ${a}, actual ${b}`);
  }
  return true;
}

const TestCases = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "TestCases.json")).toString()
).TestCases as TestCase[];

async function Test(option?: string | undefined) {
  const startTime = Date.now();
  let errors = 0;
  let skipped = 0;
  const testCases =
    !option || option === "-l"
      ? TestCases
      : TestCases.filter((x) => x.name === option);

  for (const testcase of testCases) {
    const checker = new unbroken.Checker(testcase.options);
    try {
      if (!process.env.CI) {
        process.stdout.write(testcase.name + " ");
        process.stdout.cursorTo(0);
      }
      if (option !== "-l" || testcase.options["local-only"]) {
        const v = await checker.Process();
        if (AssertAreEqual(testcase.expected, v, testcase.name)) {
          console.log(testcase.name, chalk.greenBright("ok"));
        }
      } else if (option === "-l") {
        // the test was not local but we are running only local tests
        console.log(testcase.name, chalk.yellow("skipped"));
        skipped++;
      }
    } catch (e) {
      console.error(e);
      errors++;
    }
  }
  console.log(`Finished in ${Date.now() - startTime} ms.`);
  const pct = `${100 * (1 - errors / (testCases.length - skipped))}%`;
  console.log(
    `Total: ${testCases.length}. Skipped: ${skipped}. Passed: ${
      testCases.length - skipped - errors
    } (`,
    errors === 0
      ? chalk.bgGreen.whiteBright(pct)
      : chalk.bgRed.whiteBright(pct),
    ")."
  );
  process.exitCode = errors;
}

Test(process.argv[2]);
