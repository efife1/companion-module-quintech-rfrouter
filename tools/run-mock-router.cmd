@echo off
REM Starts the mock Quintech router on 127.0.0.1:9100 using Companion's bundled Node 22.
set NODE="C:\Program Files\Companion\resources\node-runtimes\node22\node.exe"
if not exist %NODE% set NODE=node
%NODE% "%~dp0mock-router.js" %1
pause
