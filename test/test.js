const unbroken = require('../lib/unbroken');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

function AssertAreEqual(a, b, testcase) {
    if (a != b) {
        console.log(testcase, chalk.redBright(`Expected ${a}, actual ${b}`));
        return false;
    }
    return true;
}

const TestCases = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'TestCases.json'))).TestCases;

async function Test() {
    console.log();
    let nErrors = 0;
    for (let i = 0; i < TestCases.length; i++) {
        try {
            if (!process.env.CI) {
                process.stdout.write(TestCases[i].name + ' ');
                process.stdout.cursorTo(0);
            }
            const v = await unbroken.unbroken(TestCases[i].options);
            if (AssertAreEqual(TestCases[i].expected, v, TestCases[i].name)) {
                console.log(TestCases[i].name, chalk.greenBright('ok'));
            }
        } catch (e) {
            console.error(e);
            nErrors++;
        }
    }
    process.exitCode = nErrors;
}

Test();