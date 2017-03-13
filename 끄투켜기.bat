@echo off
title KKUTU : WEB

:home
taskkill -f -t -im node.exe
start game1.bat
start game2.bat
start game3.bat
start game4.bat
start game5.bat
start game6.bat
start web.bat
#goto home