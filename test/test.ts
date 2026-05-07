import * as unbroken from "../lib/checker.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert";

interface TestCase {
  name: string;
  expected: number;
  options: unbroken.Options;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TestCases = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "TestCases.json")).toString()
).TestCases as TestCase[];

const localOnly = process.argv.includes("-l") || process.env.LOCAL_ONLY === "1";

describe("unbroken", () => {
  for (const testcase of TestCases) {
    const isNetworkTest = !testcase.options["local-only"];
    const shouldSkip = localOnly && isNetworkTest;

    it(testcase.name, { skip: shouldSkip }, async () => {
      const checker = new unbroken.Checker(testcase.options);
      const v = await checker.Process();
      assert.strictEqual(v, testcase.expected, `Expected ${testcase.expected} errors, got ${v}`);
    });
  }
});
