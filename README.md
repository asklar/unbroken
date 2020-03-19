# Unbroken
## A module to detect broken links in Markdown files

Unbroken is a NodeJS command-line utility to detect broken links in .md files.
### Usage
`node index.js [options]`
The exit code represents the number of errors detected so you can use it e.g. in CI loops.

#### Options
```
  -e, --exclusions <file>   The exclusions file. Default is .unbroken_exclusions
  -l, --local-only
  -d, --dir <directory>     The directory to crawl
  -?, --help
  -q, --quiet
```
  Project home: [https://github.com/asklar/unbroken](https://github.com/asklar/unbroken)

### Exclusions & suppressions
You can create a `.unbroken_exclusions` file to suppress individual errors, or to skip traversing certain directories.
Example:
```
URL not found https://github.com/microsoft/react-native-windows/tree/master/current while parsing test\readme.md (HTTP 404)

!node_modules

!test\test2\test.md
```