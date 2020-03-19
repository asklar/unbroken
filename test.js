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
    { name: 'local-only(1)', expected: 3, options: { dir: 'test/test1', 'local-only': true, superquiet: true} },
    { name: 'with-web(1)', expected: 7, options: { dir: 'test/test1', 'local-only': false, superquiet: true} },
    { name: 'no-exclusions(1)', expected: 7, options: { dir: 'test/test1', 'local-only': false, superquiet: true, exclusions: 'test/empty_exclusions'} },

    { name: 'local-only(2)', expected: 0, options: { dir: 'test/test2', 'local-only': true, superquiet: true} },
    { name: 'with-web(2)', expected: 0, options: { dir: 'test/test2', 'local-only': false, superquiet: true} },
    { name: 'no-exclusions(2)', expected: 1, options: { dir: 'test/test2', 'local-only': false, superquiet: true, exclusions: 'test/empty_exclusions'} },

    { name: 'local-only(3)', expected: 1, options: { dir: 'test/test3', 'local-only': true, superquiet: true} },
    { name: 'with-web(3)', expected: 1, options: { dir: 'test/test3', 'local-only': false, superquiet: true} },
    { name: 'no-exclusions(3)', expected: 1, options: { dir: 'test/test3', 'local-only': false, superquiet: true, exclusions: 'test/empty_exclusions'} },
];

async function Test() {
    console.log();
    let nErrors = 0;
    for (var i = 0; i < TestCases.length; i++) {
        try {
            process.stdout.write(TestCases[i].name + ' ');
            process.stdout.cursorTo(0);
            // console.log('foo');
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