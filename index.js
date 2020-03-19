const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const fetch = require("node-fetch");
const util = require("util");
const readdir = util.promisify(fs.readdir);
const commandLineArgs = require("command-line-args");
const commandLineUsage = require("command-line-usage");

const optionDefinitions = [
    { name: 'exclusions', alias: 'e', type: String, typeLabel: '<file>', description: 'The exclusions file. Default is .unbroken_exclusions' },
    { name: 'local-only', alias: 'l', type: Boolean},
    { name: 'dir', alias: 'd', defaultOption: true, type: String, typeLabel: '<directory>', description: 'The directory to crawl'},
    { name: 'help', alias: '?', type: Boolean},
    { name: 'quiet', alias: 'q', type: Boolean},
];

const options = commandLineArgs(optionDefinitions);

const usage = commandLineUsage([
    {header: 'Options', optionList: optionDefinitions },
    {content: 'Project home: {underline https://github.com/asklar/unbroken}'}
]);
if (options.help) {
    console.log(chalk.cyan.underline.bold('Unbroken 1.0'), '- no more broken links in markdown!');
    console.log(usage);
    process.exit(0);
}

function log(x) {
  if (!options.quiet) {
    console.log(x);
  }
}

errors = [];
/*
Links can be of the following forms:
1. Links within the document
[Getting Started](#getting-started)
2. Web links
[React Native](https://reactnative.dev)
3. Links to other markdown files
[MIT License](LICENSE)
[here](current/docs/CoreParityStatus.md)
*/

async function asyncForEach(array, callback, parallel) {
  let calls = [];
  for (let index = 0; index < array.length; index++) {
      const call = callback(array[index], index, array);
      if (parallel) {
          calls.push(call);
      } else {
          await call;
      }

  }
  if (parallel) {
    await Promise.all(calls);
  }
}

function printError(type, value) {
  const error = `${type} not found -> ${value}`;
  console.log(chalk.red.bold("ERROR:"), chalk.white(error));
}

function ValidateSection(name, value, contents, filePath) {
  const sectionAnchor = value.substring(1);
  const textToFind = sectionAnchor.replace("-", " ");
  if (!contents.indexOf(textToFind)) {
    errors.push(`Section ${sectionAnchor} not found in ${filePath}`);
  }
}

function ValidateFile(name, value, filePath) {
  const dir = path.dirname(filePath);
  const pathToCheck = path.join(dir, value);
  if (!fs.existsSync(pathToCheck)) {
    const pathToCheckReplaced = path.join(dir, value.replace("_", "-")); // This isn't perfect as you could have a file named a_b-c
    if (!fs.existsSync(pathToCheckReplaced)) {
      errors.push(`File not found ${value} while parsing ${filePath}`);
    }
  }
}

async function ValidateURL(name, value, filePath) {
  const result = await fetch(value);
  if (!result.ok) {
    errors.push(`URL not found ${value} while parsing ${filePath} (HTTP ${result.status})`);
  }
  return result.ok;
}

async function ValidateLink(name, value, contents, filePath) {
  if (value.startsWith("mailto:")) {
    return;
  } else if (value.startsWith("http://") || value.startsWith("https://")) {
    if (!options['local-only']) {
        await ValidateURL(name, value, filePath);
    }
  } else if (value.startsWith("#")) {
    ValidateSection(name, value, contents, filePath);
  } else {
    ValidateFile(name, value, filePath);
  }
}

async function VerifyMarkDownFile(filePath) {
//   process.stdout.clearLine();
//   process.stdout.cursorTo(0);
//   process.stdout.write(`Verifying ${filePath}`);
  log(`Verifying ${filePath}`);
  const contents = fs.readFileSync(filePath).toString();
  // a bracket, but make sure it's followed by an even number of code quotes (`) and then non-code quotes,
  // followed by the link name, the closing bracket
  // some optional space
  // left parens, a value, and right parens
  const mdLinkRegex = /\[(?=([^`]*`[^`]*`)*[^`]*$)(?<name>[^\]]+)\]\s*\((?<value>[^)"]+)("(?<title>[^"]*)")?\)/g;

  const results = contents.matchAll(mdLinkRegex);
  for (let result of results) {
    await ValidateLink(
      result.groups.name,
      result.groups.value,
      contents,
      filePath
    );
  }
}

async function RecurseFindMarkdownFiles(dirPath) {
  const files = (await readdir(dirPath)) || [];
  await asyncForEach(files, async file => {
    const filePath = path.join(dirPath, file);
    const shouldSkip = exclusions.find(x => filePath.startsWith(x));
    if (shouldSkip) { 
        log(`skipping ${filePath}`);
        return;
    } else {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            await RecurseFindMarkdownFiles(filePath);
        } else if (filePath.toLowerCase().endsWith(".md")) {
            await VerifyMarkDownFile(filePath);
        }
    }
  }, true );
}

async function EnumerateMarkdownFiles(dirPath) {
  await RecurseFindMarkdownFiles(dirPath);
  process.stdout.clearLine();
  process.stdout.cursorTo(0);

  let n = 0;
  errors.forEach(err => {
        if (suppressions.indexOf(err) >= 0) {
            log(chalk.yellowBright.bold('WARNING:', chalk.white(err)));
        } else {
            console.log(chalk.red.bold("ERROR:"), chalk.white(err));
            n++;
        }
    });
    return n;
}

async function Do() {
  const n = await EnumerateMarkdownFiles(options.dir || '.');
  console.log(`${n} errors, ${errors.length - n} warnings.`);
  process.exitCode = n;
}

const exclusionsFileName = options.exclusions || '.unbroken_exclusions';
let suppressions;
try {
    const contents = fs.readFileSync(exclusionsFileName).toString()
                  .split('\r\n')
                  .filter(x => x.trim() != '') || '';
    suppressions = contents.filter(x => !x.startsWith('!'));
    exclusions = contents.filter(x => x.startsWith('!')).map(x => x.slice(1));
} catch (e) {
    console.log(e);
  suppressions = '';
}

Do();
