@echo off
setlocal

for /f %%i in ('git branch --show-current') do set branch=%%i

if NOT "%branch%"=="master" (
    echo You must run this script from master. Current branch is %branch%
    exit /b 1
)

call npx bump
git commit -m "bump package.json" -i package.json
git push
yarn build
npm publish

endlocal