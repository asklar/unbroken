@echo off
setlocal

pushd %~dp0\..

call yarn test
if %ERRORLEVEL% neq 0 goto :exit

call node %~dp0\publish.js
if %ERRORLEVEL% neq 0 goto :exit

:exit

popd

exit /b %ERRORLEVEL%

endlocal