@echo off
call npx bump
git commit -m "bump package.json" -i package.json
git push
npm publish