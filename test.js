const unbroken = require('./unbroken');
const chalk = require('chalk');

function AssertAreEqual(a, b, testcase) {
    if (a != b) {
        console.log(testcase, chalk.redBright(`Expected ${a}, actual ${b}`));
        return false;
    }
    return true;
}

const TestCases = [
    { name: 'local-only', expected: 3, options: { dir: 'test', 'local-only': true, superquiet: true} },
    { name: 'with-web', expected: 5, options: { dir: 'test', 'local-only': false, superquiet: true} },
    { name: 'no-exclusions', expected: 8, options: { dir: 'test', 'local-only': false, superquiet: true, exclusions: 'test\empty_exclusions'} },
];

async function Test() {
    console.log();
    for (var i = 0; i < TestCases.length; i++) {
        try {
            process.stdout.write(TestCases[i].name + ' ');
            // console.log('foo');
            const v = await unbroken.unbroken(TestCases[i].options);
            if (AssertAreEqual(TestCases[i].expected, v, TestCases[i].name)) {
                console.log(TestCases[i].name, chalk.greenBright('ok'));
            }
        } catch (e) {
            console.log('ERROR:', e);
        }
    }
}

Test();