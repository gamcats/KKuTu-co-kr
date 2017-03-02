@echo off
title KKUTU : WEB

:home
taskkill -f -t -im node.exe
start game1.bat
start game2.bat
start web.bat
#goto home