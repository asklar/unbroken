const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const fetch = require('node-fetch')
// filesTraversed = [path.join('test', 'readme.md')];
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

function ValidateSection(name, value, contents, filePath) {
    const sectionAnchor = value.substring(1);
    // console.log(`ValidateSection ${name} -> ${sectionAnchor}`);
    const textToFind = sectionAnchor.replace('-', ' ');
    if (!contents.indexOf(textToFind)) {
        // console.log(chalk.red(`Section ${sectionAnchor} not found in file`));
        errors.push(`Section ${sectionAnchor} not found in ${filePath}`);
    }
}

function ValidateFile(name, value, filePath) {
    const dir = path.dirname(filePath);
    const pathToCheck = path.join(dir, value);
    if (!fs.existsSync(pathToCheck)) {
        const pathToCheckReplaced = path.join(dir, value.replace('_', '-')); // This isn't perfect as you could have a file named a_b-c
        if (!fs.existsSync(pathToCheckReplaced)) {
            // console.log(chalk.red(`File not found ${value} while parsing ${filePath}`));
            errors.push(`File not found ${value} while parsing ${filePath}`)
            console.log(chalk.red(value));
        }
    }
}

async function GetURL(url) {
    return fetch(url).then( (response) =>  {
        console.log(`GetURL: ${url} ${response.ok} ${response.status}`); 
        return response.ok;
    } );
}

async function ValidateURL(name, value) {
    // console.log(`ValidateURL ${value}`);
    return GetURL(value).then( (result) => {
    // console.log(`Validate ${value} ${result}`);
     {
        if (!result) {
            errors.push(`Couldn't reach ${value}`);
            console.log(`ERROR ${value}`);
        } else {
            console.log(`Ok: ${value}`);
        }   
    }}
    );
}

async function ValidateLink(name, value, contents, filePath) {
    // console.log(`ValidateLink ${name} ${value}`);
    if (value.startsWith('mailto:')) {
        return;
    } else if (value.startsWith('http://') || value.startsWith('https://')) {
        return ValidateURL(name, value);
    } else if (value.startsWith('#')) {
        return ValidateSection(name, value, contents, filePath);
    } else {
        return ValidateFile(name, value, filePath);
    }
}

async function VerifyMarkDownFile(filePath) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(`Verifying ${filePath}`);
    const contents = fs.readFileSync(filePath).toString();
    // a bracket, but make sure it's followed by an even number of code quotes (`) and then non-code quotes,
    // followed by the link name, the closing bracket
    // some optional space
    // left parens, a value, and right parens
    const mdLinkRegex = /\[(?=([^`]*`[^`]*`)*[^`]*$)(?<name>[^\]]+)\]\s*\((?<value>[^)"]+)("(?<title>[^"]*)")?\)/g;

    let results = contents.matchAll(mdLinkRegex);
    for(let result of results) {
        await ValidateLink(result.groups.name, result.groups.value, contents, filePath);
    }
    // console.log(`Verified OK`);
}

async function RecurseFindMarkdownFiles(dirPath) {
    return fs.readdir(dirPath, (err, files) => {
        files.forEach(async (file) => {
            const filePath = path.join(dirPath, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                return RecurseFindMarkdownFiles(filePath);
            } else if (filePath.toLowerCase().endsWith('.md')) {
                return VerifyMarkDownFile(filePath);
            }
        });
    });
    
}

async function EnumerateMarkdownFiles(dirPath){
    return RecurseFindMarkdownFiles(dirPath).then( () => {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    errors.forEach(err => {
        console.log(chalk.red.bold('ERROR:'), chalk.white(err));
    });
});
}

async function Do() {
    return await EnumerateMarkdownFiles('test').then( () =>
    {
       console.log('done');
       process.exitCode = errors.length;
   }
   );   
}

Do();
