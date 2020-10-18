const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const axios = require('axios').default;
const micromatch = require('micromatch');

const util = require("util");
const readdir = util.promisify(fs.readdir);

function msleep(n) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
}

class Checker {
  constructor(options) {
    this.errors = [];
    this.options = options;
    if (this.options.superquiet) {
        this.options.quiet = true;
    }
    
    // Normalize options.dir for later
    this.options.dir = path.resolve(this.options.dir || '.');
    
    const exclusionsFileName = this.options.exclusions || path.join(this.options.dir, '.unbroken_exclusions');
    try {
        const contents = fs.readFileSync(exclusionsFileName).toString()
                      .split(/\r?\n/)
                      .filter(x => x.trim() != '') || '';
        this.suppressions = contents.filter(x => !x.startsWith('!')).map(x => this.normalizeSlashes(x));
        this.exclusions = contents.filter(x => x.startsWith('!')).map(x => this.normalizeSlashes(path.normalize(x.slice(1))));
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
    { name: 'allow-local-line-sections', alias: 'a', type: Boolean, description: 'Whether links to local files are allowed to have line sections like foo.cpp#L12'},
    { name: 'quiet', alias: 'q', type: Boolean},
    { name: 'superquiet', alias: 's', type: Boolean},
    { name: 'help', alias: '?', type: Boolean},
  ];


  async RecurseFindMarkdownFiles(dirPath) {
    const files = (await readdir(dirPath)) || [];
    const checker = this;
    await asyncForEach(files, async file => {
      const filePath = path.join(dirPath, file);
      const relFilePath = this.normalizeSlashes(this.getRelativeFilePath(filePath));
      const shouldSkip = micromatch.isMatch(relFilePath, checker.exclusions, { nocase: true });
      if (shouldSkip) { 
        checker.log(`Skipping ${this.normalizeSlashes(relFilePath)}.`);
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
        dirPath = this.options.dir;
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

  getRelativeFilePath(filePath) {
    return filePath.substr(this.options.dir.length + 1);
  }

  
  normalizeSlashes(str) {
    return str.replace(/\\/g, '/');
  }

  ValidateFile(name, value, filePath) {
    const dir = path.dirname(filePath);
    const pathToCheck = path.join(dir, value);
    if (!fs.existsSync(pathToCheck)) {
      const pathToCheckReplaced = path.join(dir, value.replace(/_/g, '-')); // This isn't perfect as you could have a file named a_b-c
      if (!fs.existsSync(pathToCheckReplaced)) {
        this.errors.push(`File not found ${this.normalizeSlashes(path.normalize(value))} while parsing ${this.normalizeSlashes(this.getRelativeFilePath(filePath))}`);
        return false;
      }
    }
    return true;
  }
  
  getAnchors(content) {
    const anchorRegex = /(^\#+|\n+\#+)\s*(?<anchorTitle>[^\s].*)/g;
    let anchors = [];
    const results = content.matchAll(anchorRegex);
    for (let result of results) {
        const title = result.groups.anchorTitle;
        const transformed = title.replace(/[^\w\d\s-]+/g, '').replace(/ /g, '-');
        let newItem = transformed;
        const found = anchors.indexOf(transformed) !== -1;
        if (found) {
          const regex = new RegExp(`${transformed}-\d+`);
          const lastIndex = anchors.find(x => regex.test(x));
          const newIndex = lastIndex ? lastIndex.length + 1 : 1;
          newItem = transformed + '-' + newIndex;
        }
        anchors.push(newItem);
    }
    return anchors;
  }
  
  ValidateSection(name, value, contents, filePath) {
    const hash = value.indexOf('#');
    const sectionAnchor = value.substring(hash + 1);
    const page = value.substring(0, hash);
    let extra = '';
    if (page != '') {
        // console.log(`Validating anchor in different page: ${page} ${textToFind} referenced in ${filePath}`);
        extra = ` while parsing ${this.normalizeSlashes(this.getRelativeFilePath(filePath))}`;
        if (this.ValidateFile(name, page, filePath)) {
            filePath = path.join(path.dirname(filePath), page);
            contents = fs.readFileSync(filePath).toString();
        } else {
            // file doesn't exist. We've already logged that the file is missing, don't log that the section is missing too.
            return;
        }
    }
    const anchors = this.getAnchors(contents.toLowerCase());
    if (anchors.indexOf(sectionAnchor.toLowerCase()) < 0) {
      if (anchors.indexOf(sectionAnchor.replace(/\./g, '').toLowerCase()) < 0) {
        // if this is a local file (non-http/https)
        if (! (this.options['allow-local-line-sections'] && !this.IsWebLink(value) && sectionAnchor.length > 1 && sectionAnchor[0] === 'L' && !isNaN(sectionAnchor.substring(1))))
        {
          this.errors.push(`Section ${sectionAnchor} not found in ${this.normalizeSlashes(this.getRelativeFilePath(filePath))}${extra}. Available anchors: ${JSON.stringify(anchors)}`);
        }
      }
    }
  }
  
  async ValidateURL(name, value, filePath) {
    const maxIterations = 5;

    for (let i = 0; i < maxIterations; i++) {
      if (i > 0) {
        this.log(`Retrying ${value}`);
      }

      try {
        var r = await axios.get(value);
        if (r.status == 200) {
          return true;
        }
      }
      catch (e) {
        var sleepSeconds = 0;
        if (e.hasOwnProperty('response') && e.response !== undefined) {
          if (e.response.status == 429) {
            if (this.suppressions.findIndex(x => x == 'HTTP/429') != -1)
            {
              return true; // ignore HTTP/429 errors
            }

            const retryAfterSeconds = e.response.headers.hasOwnProperty('retry-after') ? parseInt(e.response.headers['retry-after']) : 0;

            sleepSeconds = ((i + 1) / maxIterations) * retryAfterSeconds;

            // we aren't ignoring HTTP/429... try again after sleeping
            this.log(`HTTP/429, request retry after ${retryAfterSeconds}s, sleeping for ${sleepSeconds}s`)
          } else {
            this.errors.push(`URL not found ${value} while parsing ${this.normalizeSlashes(this.getRelativeFilePath(filePath))} (HTTP ${e.response.status})`);
            return false;
          }
        }
        msleep(100 + sleepSeconds * 1000);
      } //catch
    } // for

    this.errors.push(`URL not found ${value} while parsing ${this.normalizeSlashes(this.getRelativeFilePath(filePath))} after ${maxIterations} retries`);
    return false;
 }
  
  async ValidateLink(name, value, contents, filePath) {
    if (value.startsWith("mailto:")) {
      return;
    } else if (this.IsWebLink(value)) {
      if (!this.options['local-only']) {
        await this.ValidateURL(name, value, filePath);
      }
    } else if (value.indexOf("#") >= 0) {
      this.ValidateSection(name, value, contents, filePath);
    } else {
      this.ValidateFile(name, value, filePath);
    }
  }

  IsWebLink(url) {
    return url.startsWith("http://") || url.startsWith("https://");
  }

  async VerifyMarkDownFile(filePath) {
    this.log(`Verifying ${this.normalizeSlashes(this.getRelativeFilePath(filePath))}`);
    const contents = fs.readFileSync(filePath).toString();
    // a bracket, but make sure it's followed by an even number of code quotes (`) and then non-code quotes,
    // followed by the link name, the closing bracket
    // some optional space
    // left parens, a value, and right parens
    // the value can contain a parenthesized set of parameters, e.g. 
    // https://docs.microsoft.com/en-us/previous-versions/tn-archive/cc751383(v=technet.10)

    const balancedParensTwoLevels = '([^(\\s]*\\([^)\\s]*\\))?[^()\\s]*';
    const baseLink = `\\[(?=([^\`]*\`[^\`]*\`)*[^\`]*$)(?<nameBASE>[^\\]]+)\\]\\s*\\((?<valueBASE>${balancedParensTwoLevels}?)("(?<titleBASE>[^"]*)")?\\)`;
    const imgLink = `(?<imageLinkTag>\\[\\!)${baseLink.replace(/BASE/g, 'img')}(?<endImageLinkTag>\\]\\((?<linkTarget>[^)]+)\\))`;
    const nonImgLink = baseLink.replace(/BASE/g, '');
    const mdLinkRegex = new RegExp(`(${imgLink})|(${nonImgLink})`, 'g');
  
    const results = contents.matchAll(mdLinkRegex);

    for (let result of results) {
        let name = result.groups.name;
        let value = result.groups.value;
        let title = result.groups.title;

        if (result.groups.imageLinkTag) {
            name = result.groups.nameimg;
            value = result.groups.linkTarget;
            title = result.groups.titleimg;
            var imgSrc = result.groups.valueimg;
        }

        // console.log(`name = ${name} imglinktag = ${imgSrc != undefined} value = ${value} imgsrc = ${imgSrc} `);
      await this.ValidateLink(
        name,
        value,
        contents,
        filePath
      );
      if (imgSrc) {
          await this.ValidateLink(
              name,
              imgSrc,
              null,
              filePath
          );
      }
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
  if (c.errors.length) {
      if (!options.superquiet) {
          console.log(`${n} errors, ${c.errors.length - n} warnings.`);
      }
  }
  return n;
}


module.exports = {unbroken, Checker};
