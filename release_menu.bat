@echo off
chcp 65001 >nul
cd /d "%~dp0"
title MKP Release Menu

:menu
cls
echo ==============================
echo MKP Release Menu
echo ==============================
echo.
echo 0. Edit Release Info
echo    Update version, date, short description and release notes
echo.
echo 1. Minimal Hot Update
echo    Compare with previous patch and only pack changed core files
echo.
echo 2. Standard Hot Update
echo    Pack src, package.json, preload.js, app_manifest, presets_manifest
echo    Exclude 3mf files and printer preset json files
echo.
echo 3. Full Hot Update
echo    Pack all hot update resources
echo    Include 3mf files and presets folder
echo.
echo 4. Full Installer Build
echo    Build a new installer into dist
echo.
echo 5. Exit
echo.
set /p choice=Select an option: 

if "%choice%"=="0" goto editinfo
if "%choice%"=="1" goto mode1
if "%choice%"=="2" goto mode2
if "%choice%"=="3" goto mode3
if "%choice%"=="4" goto mode4
if "%choice%"=="5" goto end

echo.
echo Invalid input. Please try again.
pause
goto menu

:editinfo
echo.
echo Running Release Info Editor...
node scripts\edit-release-info.js
goto done

:mode1
echo.
echo Running Minimal Hot Update...
node scripts\release-manager.js 1
goto done

:mode2
echo.
echo Running Standard Hot Update...
node scripts\release-manager.js 2
goto done

:mode3
echo.
echo Running Full Hot Update...
node scripts\release-manager.js 3
goto done

:mode4
echo.
echo Running Full Installer Build...
node scripts\release-manager.js 4
goto done

:done
echo.
if exist "release_upload\cloud_data" (
  echo Upload folder: %cd%\release_upload\cloud_data
)
if exist "release_upload\release_readme.txt" (
  echo Readme file: %cd%\release_upload\release_readme.txt
)
if exist "dist" (
  echo Installer folder: %cd%\dist
)
echo.
pause
goto menu

:end
exit /b 0
