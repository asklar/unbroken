const commandLineArgs = require("command-line-args");
const commandLineUsage = require("command-line-usage");
const unbroken = require('./unbroken');
const fs = require('fs');

async function Do() {

  const options = commandLineArgs(unbroken.Checker.optionDefinitions);

  const usage = commandLineUsage([
      {header: 'Options', optionList: unbroken.Checker.optionDefinitions },
      {content: 'Project home: {underline https://github.com/asklar/unbroken}'}
  ]);

  if (options.help) {
      console.log(chalk.cyan.underline.bold('Unbroken 1.0'), '- no more broken links in markdown!');
      console.log(usage);
      process.exit(0);
  } else if (options.init) {
    if (fs.existsSync('.unbroken_exclusions')) {
      logError('.unbroken_exclusions already exists');
      process.exit(-1);
    } else {
      fs.writeFileSync('.unbroken_exclusions', "!node_modules");
      process.exit(0);
    }
  }
  process.exitCode = await unbroken.unbroken(options);
}

Do();