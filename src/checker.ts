import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import axios from "axios";
import micromatch from "micromatch";
import * as util from "util";
import { OptionDefinition } from "command-line-usage";
const readdir = util.promisify(fs.readdir);

async function msleep(n: number) {
  return new Promise((resolve) => setTimeout(resolve, n));
}

const DefaultUserAgent = "Chrome/89.0.4346.0";

export interface Options {
  quiet: boolean;
  superquiet: boolean;
  dir: string;
  exclusions: string;
  "local-only": boolean;
  "allow-local-line-sections": boolean;
  "parse-ids": boolean;
  "user-agent": string;
}

export class Checker {
  constructor(public readonly options: Options) {
    this.errors = [];
    this.options = options;
    this.ids = {};
    this.urlCache = {};
    if (this.options.superquiet) {
      this.options.quiet = true;
    }

    // Normalize options.dir for later
    this.options.dir = path.resolve(this.options.dir || ".");

    const exclusionsFileName =
      this.options.exclusions ||
      path.join(this.options.dir, ".unbroken_exclusions");
    try {
      const contents =
        fs
          .readFileSync(exclusionsFileName)
          .toString()
          .split(/\r?\n/)
          .filter((x) => x.trim() !== "") || "";
      this.suppressions = contents
        .filter((x) => !x.startsWith("!"))
        .map((x) => Checker.normalizeSlashes(x));
      this.exclusions = contents
        .filter((x) => x.startsWith("!"))
        .map((x) => Checker.normalizeSlashes(path.normalize(x.slice(1))));
    } catch (e) {
      this.suppressions = [];
      this.exclusions = [];
    }
  }

  errors: string[];
  ids: Record<string, string>;
  suppressions: string[];
  exclusions: string[];
  urlCache: Record<string, number>;

  public static optionDefinitions: OptionDefinition[] = [
    {
      name: "exclusions",
      alias: "e",
      type: String,
      typeLabel: "<file>",
      description: "The exclusions file. Default is .unbroken_exclusions",
    },
    {
      name: "local-only",
      alias: "l",
      type: Boolean,
      description: "Do not test http and https links",
    },
    {
      name: "dir",
      alias: "d",
      defaultOption: true,
      type: String,
      typeLabel: "<directory>",
      description: "The directory to crawl",
    },
    {
      name: "init",
      alias: "i",
      type: Boolean,
      description:
        "Creates a default exclusions file if one doesn't already exist",
    },
    {
      name: "allow-local-line-sections",
      alias: "a",
      type: Boolean,
      description:
        "Whether links to local files are allowed to have line sections like foo.cpp#L12",
    },
    {
      name: "allow-403-http-errors",
      type: Boolean,
      description:
        "Whether to ignore HTTP 403 errors. This commonly happens for projects with single signon enabled.",
    },
    { name: "quiet", alias: "q", type: Boolean },
    { name: "superquiet", alias: "s", type: Boolean },
    {
      name: "parse-ids",
      type: Boolean,
      description: "Allows anchors to point to Docusaurus id aliases",
    },
    {
      name: "user-agent",
      alias: "u",
      type: String,
      description: `The User-Agent string to use. Default is ${DefaultUserAgent}`,
    },
    { name: "help", alias: "?", type: Boolean },
  ];

  private async RecurseFindMarkdownFiles(
    dirPath: string,
    callback: { (path: string): Promise<void> }
  ) {
    const files = (await readdir(dirPath)) || [];
    const checker = this;
    await asyncForEach(
      files,
      async (file: string) => {
        const filePath = path.join(dirPath, file);
        const relFilePath = Checker.normalizeSlashes(
          this.getRelativeFilePath(filePath)
        );
        const shouldSkip = micromatch.isMatch(relFilePath, checker.exclusions, {
          nocase: true,
        });
        if (shouldSkip) {
          checker.log(`Skipping ${Checker.normalizeSlashes(relFilePath)}.`);
        } else {
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            await checker.RecurseFindMarkdownFiles(filePath, callback);
          } else if (filePath.toLowerCase().endsWith(".md")) {
            await callback(filePath);
          }
        }
      },
      true
    );
  }

  private async GetAndStoreId(path: string) {
    const lines = fs
      .readFileSync(path)
      .toString()
      .split(/[\r\n]+/g);
    if (
      lines.length > 2 &&
      lines[0].trim() === "---" &&
      lines[1].toLowerCase().startsWith("id:")
    ) {
      const id = lines[1].slice("id:".length).trim();
      this.ids[id] = path;
      // console.log(`Adding ID: ${id} --> ${path}`);
    }
  }

  async Process(dirPath?: string) {
    if (!dirPath) {
      dirPath = this.options.dir;
    }

    if (this.options["parse-ids"]) {
      await this.RecurseFindMarkdownFiles(dirPath, (x) =>
        this.GetAndStoreId(x)
      );
    }
    await this.RecurseFindMarkdownFiles(dirPath, (x) =>
      this.VerifyMarkDownFile(x)
    );
    let n = 0;
    this.errors.forEach((err) => {
      if (this.suppressions.indexOf(err) >= 0) {
        this.log(chalk.yellowBright.bold("WARNING:"), chalk.white(err));
      } else {
        this.logError(err);
        n++;
      }
    });
    return n;
  }

  private log(...args: any) {
    if (!this.options.quiet) {
      console.log(args.join(" "));
    }
  }

  private logError(error: string) {
    if (!this.options.superquiet) {
      console.log(chalk.red.bold("ERROR:"), chalk.white(error));
    }
  }

  private getRelativeFilePath(filePath: string) {
    return filePath.substr(this.options.dir.length + 1);
  }

  private static normalizeSlashes(str: string) {
    return str.replace(/\\/g, "/");
  }

  private ValidateFile(name: string, value: string, filePath: string) {
    const dir = path.dirname(filePath);
    const pathToCheck = path.join(dir, value);
    if (!fs.existsSync(pathToCheck)) {
      const pathToCheckReplaced = path.join(dir, value.replace(/_/g, "-")); // This isn't perfect as you could have a file named a_b-c
      if (!fs.existsSync(pathToCheckReplaced)) {
        if (!this.ids[value]) {
          this.errors.push(
            `File not found ${Checker.normalizeSlashes(
              path.normalize(value)
            )} while parsing ${Checker.normalizeSlashes(
              this.getRelativeFilePath(filePath)
            )}`
          );
          return undefined;
        } else {
          // console.log(`Referencing id ${value} -> ${this.ids[value]}`);
          return this.ids[value];
        }
      } else {
        return pathToCheckReplaced;
      }
    }
    return path.normalize(pathToCheck);
  }

  private getAnchors(content: string): string[] {
    const anchorRegex = /(^#+|\n+#+)\s*(?<anchorTitle>[^\s].*)/g;
    const anchors = [];
    const results = content.matchAll(anchorRegex);
    for (const result of results) {
      const title = result.groups!.anchorTitle;
      const transformed = title.replace(/[^\w\d\s-]+/g, "").replace(/ /g, "-");
      let newItem = transformed;
      const found = anchors.indexOf(transformed) !== -1;
      if (found) {
        const regex = new RegExp(`${transformed}-\\d+`);
        const lastIndex = anchors.find((x) => regex.test(x));
        const newIndex = lastIndex ? lastIndex.length + 1 : 1;
        newItem = transformed + "-" + newIndex;
      }
      anchors.push(newItem);
    }
    return anchors;
  }

  private ValidateSection(
    name: string,
    value: string,
    contents: string | null,
    filePath: string
  ) {
    const hash = value.indexOf("#");
    const sectionAnchor = value.substring(hash + 1);
    const page = value.substring(0, hash);
    let extra = "";
    if (page !== "") {
      // console.log(`Validating anchor in different page: ${page} ${textToFind} referenced in ${filePath}`);
      extra = ` while parsing ${Checker.normalizeSlashes(
        this.getRelativeFilePath(filePath)
      )}`;
      const realFilePath = this.ValidateFile(name, page, filePath);
      if (realFilePath) {
        contents = fs.readFileSync(realFilePath).toString();
      } else {
        // file doesn't exist. We've already logged that the file is missing, don't log that the section is missing too.
        return;
      }
    }
    if (!contents) {
      this.errors.push("Couldn't read contents");
      return;
    }

    const anchors = this.getAnchors(contents.toLowerCase());
    if (anchors.indexOf(sectionAnchor.toLowerCase()) < 0) {
      if (anchors.indexOf(sectionAnchor.replace(/\./g, "").toLowerCase()) < 0) {
        // if this is a local file (non-http/https)
        if (
          !(
            this.options["allow-local-line-sections"] &&
            !Checker.IsWebLink(value) &&
            sectionAnchor.length > 1 &&
            sectionAnchor[0] === "L" &&
            !isNaN(parseInt(sectionAnchor.substring(1)))
          )
        ) {
          this.errors.push(
            `Section ${sectionAnchor} not found in ${Checker.normalizeSlashes(
              this.getRelativeFilePath(filePath)
            )}${extra}. Available anchors: ${JSON.stringify(anchors)}`
          );
        }
      }
    }
  }

  private async ValidateURL(name: string, value: string, filePath: string) {
    const maxIterations = 5;
    const ignoring429 =
      this.suppressions.findIndex((x) => x === "HTTP/429") !== -1;
    const ignoring403 =
      this.suppressions.findIndex((x) => x === "HTTP/403") !== -1;
    const relativeFilePath = Checker.normalizeSlashes(
      this.getRelativeFilePath(filePath)
    );

    let result: number | undefined =
      value in this.urlCache ? this.urlCache[value] : undefined;

    // spin while pending validates finish
    while (result === -1) {
      await msleep(100);
      result = this.urlCache[value];
    }

    if (result === 200) {
      // Previous success, bail early
      return true;
    } else if (result === undefined) {
      // No previous result, actually check URL
      this.urlCache[value] = -1; // block other validates until this is finshed
      this.log(`Verifying ${value} for ${relativeFilePath}`);
      for (let i = 0; i < maxIterations; i++) {
        if (i > 0) {
          this.log(`Retrying ${value} for ${relativeFilePath}, attempt #${i}`);
        }

        try {
          const userAgent = this.options["user-agent"] || DefaultUserAgent;
          const r = await axios.get(value, {
            headers: {
              "User-Agent": userAgent,
              "Accept-Encoding": "gzip, deflate, br",
            },
          });
          if (r.status === 200) {
            // Save success response as result
            result = r.status;
            break;
          }
        } catch (e) {
          let sleepSeconds = 0;
          if (
            Object.prototype.hasOwnProperty.call(e, "response") &&
            e.response !== undefined
          ) {
            if (
              e.response.status !== 429 ||
              (e.response.status === 429 && ignoring429)
            ) {
              // An actual error (or a 429 we're ignoring), save status and bail
              result = e.response.status;
              break;
            } else {
              // Being throttled with HTTP/429
              const retryAfterSeconds = Object.prototype.hasOwnProperty.call(
                e.response.headers,
                "retry-after"
              )
                ? parseInt(e.response.headers["retry-after"])
                : 0;

              sleepSeconds = ((i + 1) / maxIterations) * retryAfterSeconds;

              // we aren't ignoring HTTP/429... try again after sleeping
              this.log(
                `HTTP/429 for ${value}, requested retry after ${retryAfterSeconds}s, sleeping for ${sleepSeconds}s`
              );
            }
          }
          await msleep(100 + sleepSeconds * 1000);
        } // catch
      } // for
    } // else if

    // Normalize result to -1 sentinal if we hit the max retries
    result = result === undefined ? -1 : result;

    // Save result
    this.urlCache[value] = result;

    if (
      result === 200 ||
      (result === 429 && ignoring429) ||
      (result === 403 && ignoring403)
    ) {
      // Standard success (or an ignored 429 or 403)
      return true;
    } else if (result === -1) {
      // No HTTP error, hit max retries
      this.errors.push(
        `URL not found ${value} while parsing ${relativeFilePath} after ${maxIterations} retries`
      );
      return false;
    } else {
      // Standard HTTP error
      this.errors.push(
        `URL not found ${value} while parsing ${relativeFilePath} (HTTP ${result})`
      );
      return false;
    }
  }

  private async ValidateLink(
    name: string,
    value: string,
    contents: string | null,
    filePath: string
  ) {
    if (value.startsWith("mailto:")) {
      // Not implemented
    } else if (Checker.IsWebLink(value)) {
      if (!this.options["local-only"]) {
        await this.ValidateURL(name, value, filePath);
      }
    } else if (value.indexOf("#") >= 0) {
      this.ValidateSection(name, value, contents, filePath);
    } else {
      this.ValidateFile(name, value, filePath);
    }
  }

  private static IsWebLink(url: string) {
    return url.startsWith("http://") || url.startsWith("https://");
  }

  async VerifyMarkDownFile(filePath: string) {
    this.log(
      `Verifying ${Checker.normalizeSlashes(
        this.getRelativeFilePath(filePath)
      )}`
    );
    const contents = fs.readFileSync(filePath).toString();
    // a bracket, but make sure it's followed by an even number of code quotes (`) and then non-code quotes,
    // followed by the link name, the closing bracket
    // some optional space
    // left parens, a value, and right parens
    // the value can contain a parenthesized set of parameters, e.g.
    //    https://docs.microsoft.com/en-us/previous-versions/tn-archive/cc751383(v=technet.10)
    // [name](value)
    // [!name](value "title")

    const balancedParensTwoLevels = "([^(\\s]*\\([^)\\s]*\\))?[^()\\s]*";
    const baseLink = `\\[(?=([^\`]*\`[^\`]*\`)*[^\`]*$)(?<nameBASE>[^\\]]+)\\]\\s*\\((?<valueBASE>${balancedParensTwoLevels}?)("(?<titleBASE>[^"]*)")?\\)`;
    const imgLink = `(?<imageLinkTag>\\[\\!)${baseLink.replace(
      /BASE/g,
      "img"
    )}(?<endImageLinkTag>\\]\\((?<linkTarget>[^)]+)\\))`;
    const nonImgLink = baseLink.replace(/BASE/g, "");
    const mdLinkRegex = new RegExp(`(${imgLink})|(${nonImgLink})`, "g");

    const results = contents.matchAll(mdLinkRegex);

    let imgSrc: string | undefined;
    for (const result of results) {
      const groups = result.groups!;
      let name = groups.name;
      let value = groups.value;
      // let title = groups.title

      if (groups.imageLinkTag) {
        name = groups.nameimg;
        value = groups.linkTarget;
        // title = groups.titleimg
        imgSrc = groups.valueimg;
      }

      // console.log(`name = ${name} imglinktag = ${imgSrc != undefined} value = ${value} imgsrc = ${imgSrc} `);
      await this.ValidateLink(name, value, contents, filePath);
      if (imgSrc) {
        await this.ValidateLink(name, imgSrc, null, filePath);
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

async function asyncForEach(
  array: string[],
  callback: { (file: string, index: number, arr: string[]): Promise<void> },
  parallel: boolean
) {
  const calls = [];
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
