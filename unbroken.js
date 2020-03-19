const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const fetch = require("node-fetch");
const util = require("util");
const readdir = util.promisify(fs.readdir);

class Checker {
  constructor(options) {
    this.errors = [];
    this.options = options;
    if (this.options.superquiet) {
        this.options.quiet = true;
    }
    const exclusionsFileName = this.options.exclusions || '.unbroken_exclusions';
    try {
        const contents = fs.readFileSync(exclusionsFileName).toString()
                      .split('\r\n')
                      .filter(x => x.trim() != '') || '';
        this.suppressions = contents.filter(x => !x.startsWith('!'));
        this.exclusions = contents.filter(x => x.startsWith('!')).map(x => x.slice(1));
    } catch (e) {
        this.suppressions = [];
        this.exclusions = [];
    }
  }

  static optionDefinitions = [
    { name: 'exclusions', alias: 'e', type: String, typeLabel: '<file>', description: 'The exclusions file. Default is .unbroken_exclusions' },
    { name: 'local-only', alias: 'l', type: Boolean, description: 'Do not test http and https links'},
    { name: 'dir', alias: 'd', defaultOption: true, type: String, typeLabel: '<directory>', description: 'The directory to crawl'},
    { name: 'init', alias: 'i', type: Boolean, description: 'Creates a default exclusions file if one doesn\'t already exist'},
    { name: 'quiet', alias: 'q', type: Boolean},
    { name: 'superquiet', alias: 's', type: Boolean},
    { name: 'help', alias: '?', type: Boolean},
  ];


  async RecurseFindMarkdownFiles(dirPath) {
    const files = (await readdir(dirPath)) || [];
    const checker = this;
    await asyncForEach(files, async file => {
      const filePath = path.join(dirPath, file);
      const shouldSkip = checker.exclusions.find(x => filePath.startsWith(x));
      if (shouldSkip) { 
        checker.log(`skipping ${filePath}`);
        return;
      } else {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            await checker.RecurseFindMarkdownFiles(filePath);
        } else if (filePath.toLowerCase().endsWith(".md")) {
            await checker.VerifyMarkDownFile(filePath);
        }
      }
    }, true );
  }
  
  async Process(dirPath) {
    if (!dirPath) {
        dirPath = this.options.dir || '.';
    }
    await this.RecurseFindMarkdownFiles(dirPath);
    let n = 0;
    this.errors.forEach(err => {
          if (this.suppressions.indexOf(err) >= 0) {
              this.log(chalk.yellowBright.bold('WARNING:'), chalk.white(err));
          } else {
              this.logError(err);
              n++;
          }
      });
      return n;
  }
  
  log(...args) {
    if (!this.options.quiet) {
      console.log(args.join(' '));
    }
  }

  logError(error) {
    if (!this.options.superquiet) {
      console.log(chalk.red.bold("ERROR:"), chalk.white(error));
    }
  }
  ValidateSection(name, value, contents, filePath) {
    const sectionAnchor = value.substring(1);
    const textToFind = sectionAnchor.replace("-", " ");
    if (!contents.indexOf(textToFind)) {
      this.errors.push(`Section ${sectionAnchor} not found in ${filePath}`);
    }
  }
  
  ValidateFile(name, value, filePath) {
    const dir = path.dirname(filePath);
    const pathToCheck = path.join(dir, value);
    if (!fs.existsSync(pathToCheck)) {
      const pathToCheckReplaced = path.join(dir, value.replace("_", "-")); // This isn't perfect as you could have a file named a_b-c
      if (!fs.existsSync(pathToCheckReplaced)) {
        this.errors.push(`File not found ${value} while parsing ${filePath}`);
      }
    }
  }
  
  async ValidateURL(name, value, filePath) {
    const result = await fetch(value);
    if (!result.ok) {
      this.errors.push(`URL not found ${value} while parsing ${filePath} (HTTP ${result.status})`);
    }
    return result.ok;
  }
  
  async ValidateLink(name, value, contents, filePath) {
    if (value.startsWith("mailto:")) {
      return;
    } else if (value.startsWith("http://") || value.startsWith("https://")) {
      if (!this.options['local-only']) {
          await this.ValidateURL(name, value, filePath);
      }
    } else if (value.startsWith("#")) {
      this.ValidateSection(name, value, contents, filePath);
    } else {
      this.ValidateFile(name, value, filePath);
    }
  }

  async VerifyMarkDownFile(filePath) {
    this.log(`Verifying ${filePath}`);
    const contents = fs.readFileSync(filePath).toString();
    // a bracket, but make sure it's followed by an even number of code quotes (`) and then non-code quotes,
    // followed by the link name, the closing bracket
    // some optional space
    // left parens, a value, and right parens
    const mdLinkRegex = /\[(?=([^`]*`[^`]*`)*[^`]*$)(?<name>[^\]]+)\]\s*\((?<value>[^)"]+)("(?<title>[^"]*)")?\)/g;
  
    const results = contents.matchAll(mdLinkRegex);
    for (let result of results) {
      await this.ValidateLink(
        result.groups.name,
        result.groups.value,
        contents,
        filePath
      );
    }
  }
}

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

async function unbroken(options) {
  const c = new Checker(options);
  const n = await c.Process();
  c.log(`${n} errors, ${c.errors.length - n} warnings.`);
  return n;
}


module.exports = {unbroken, Checker};
