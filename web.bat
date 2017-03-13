@echo off
title KKUTU : WEB

:home
node Server\lib\Web\cluster.js 8
goto home