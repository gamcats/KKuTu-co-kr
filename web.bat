@echo off
title KKUTU : WEB

:home
node Server\lib\Web\cluster.js 1
goto home