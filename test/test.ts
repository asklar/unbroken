import * as unbroken from '../lib/checker'
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

interface TestCase {
    name: string,
    expected: number,
    options: unbroken.Options
}

function AssertAreEqual(a: any, b: any, testcase: string) {
    if (a !== b) {
        console.log(testcase, chalk.redBright(`Expected ${a}, actual ${b}`));
        return false;
    }
    return true;
}

const TestCases = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'TestCases.json')).toString()).TestCases as TestCase[];

async function Test(option?: string | undefined) {
    console.log();
    let nErrors = 0;
    for (let i = 0; i < TestCases.length; i++) {
        const checker = new unbroken.Checker(TestCases[i].options);
        try {
            if (!process.env.CI) {
                process.stdout.write(TestCases[i].name + ' ');
                process.stdout.cursorTo(0);
            }
            if (option !== '-l' || TestCases[i].options['local-only']) {
                const v = await checker.Process();
                if (AssertAreEqual(TestCases[i].expected, v, TestCases[i].name)) {
                    console.log(TestCases[i].name, chalk.greenBright('ok'));
                }
            } else if (option === '-l') {
                // the test was not local but we are running only local tests
                console.log(TestCases[i].name, chalk.grey('skipped'));
            }
        } catch (e) {
            console.error(e);
            nErrors++;
        }
    }
    process.exitCode = nErrors;
}

Test(process.argv[2]);