@echo off
REM build_v2.bat - Script de build automatizado para InputBus v2.0
REM
REM Uso:
REM   build_v2.bat           - Build Release
REM   build_v2.bat debug     - Build Debug
REM   build_v2.bat clean     - Limpa build e recompila
REM   build_v2.bat run       - Build e executa
REM

setlocal enabledelayedexpansion

echo ============================================================
echo   InputBus v2.0 - Build Script
echo ============================================================
echo.

REM Cores (se terminal suportar)
set COLOR_RESET=[0m
set COLOR_GREEN=[92m
set COLOR_YELLOW=[93m
set COLOR_RED=[91m
set COLOR_CYAN=[96m

REM ============================================================
REM Detectar argumentos
REM ============================================================

set BUILD_TYPE=Release
set DO_CLEAN=0
set DO_RUN=0
set DO_INSTALL=0

if "%1"=="debug" set BUILD_TYPE=Debug
if "%1"=="Debug" set BUILD_TYPE=Debug
if "%1"=="clean" set DO_CLEAN=1
if "%1"=="run" set DO_RUN=1
if "%1"=="install" set DO_INSTALL=1

echo Build Type: %BUILD_TYPE%
echo.

REM ============================================================
REM Verificar pré-requisitos
REM ============================================================

echo %COLOR_CYAN%[1/6] Verificando pre-requisitos...%COLOR_RESET%

where cmake >nul 2>nul
if %errorlevel% neq 0 (
    echo %COLOR_RED%ERRO: CMake nao encontrado no PATH%COLOR_RESET%
    echo Instale CMake: https://cmake.org/download/
    exit /b 1
)

where cl >nul 2>nul
if %errorlevel% neq 0 (
    echo %COLOR_YELLOW%AVISO: cl.exe (MSVC) nao encontrado.%COLOR_RESET%
    echo Tentando usar MinGW...
    where g++ >nul 2>nul
    if !errorlevel! neq 0 (
        echo %COLOR_RED%ERRO: Nenhum compilador encontrado (MSVC ou MinGW)%COLOR_RESET%
        echo.
        echo Instale:
        echo   - Visual Studio 2022 com C++ workload, OU
        echo   - MinGW: https://sourceforge.net/projects/mingw-w64/
        exit /b 1
    )
    set GENERATOR=MinGW Makefiles
    set COMPILER=MinGW
) else (
    set GENERATOR=Visual Studio 17 2022
    set COMPILER=MSVC
)

echo   - CMake: OK
echo   - Compilador: %COMPILER%
echo   - Generator: %GENERATOR%
echo.

REM ============================================================
REM Verificar ViGEmBus
REM ============================================================

echo %COLOR_CYAN%[2/6] Verificando ViGEmBus...%COLOR_RESET%

sc query ViGEmBus >nul 2>nul
if %errorlevel% neq 0 (
    echo %COLOR_YELLOW%AVISO: ViGEmBus driver pode nao estar instalado.%COLOR_RESET%
    echo.
    echo Se o build falhar, instale ViGEmBus:
    echo   https://github.com/ViGEm/ViGEmBus/releases
    echo.
) else (
    echo   - ViGEmBus: OK
)
echo.

REM ============================================================
REM Limpar se solicitado
REM ============================================================

if %DO_CLEAN%==1 (
    echo %COLOR_CYAN%[3/6] Limpando build anterior...%COLOR_RESET%
    if exist build rmdir /s /q build
    echo   - Build anterior removido
    echo.
) else (
    echo %COLOR_CYAN%[3/6] Pulando limpeza (use 'build_v2.bat clean' para limpar)%COLOR_RESET%
    echo.
)

REM ============================================================
REM Criar diretorio de build
REM ============================================================

echo %COLOR_CYAN%[4/6] Configurando CMake...%COLOR_RESET%

if not exist build mkdir build
cd build

REM Detectar arquitetura
if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
    set ARCH=x64
) else (
    set ARCH=Win32
)

echo   - Gerando projeto...

if "%GENERATOR%"=="Visual Studio 17 2022" (
    cmake .. -G "%GENERATOR%" -A %ARCH% -DUSE_V2_SYSTEM=ON -DCMAKE_BUILD_TYPE=%BUILD_TYPE%
) else (
    cmake .. -G "%GENERATOR%" -DUSE_V2_SYSTEM=ON -DCMAKE_BUILD_TYPE=%BUILD_TYPE%
)

if %errorlevel% neq 0 (
    echo %COLOR_RED%ERRO: Falha ao configurar CMake%COLOR_RESET%
    cd ..
    exit /b 1
)

echo   - CMake configurado com sucesso
echo.

REM ============================================================
REM Compilar
REM ============================================================

echo %COLOR_CYAN%[5/6] Compilando...%COLOR_RESET%
echo   - Build Type: %BUILD_TYPE%
echo   - Compilador: %COMPILER%
echo.

cmake --build . --config %BUILD_TYPE% --parallel

if %errorlevel% neq 0 (
    echo.
    echo %COLOR_RED%ERRO: Falha na compilacao%COLOR_RESET%
    cd ..
    exit /b 1
)

echo.
echo %COLOR_GREEN%[OK] Compilacao concluida com sucesso!%COLOR_RESET%
echo.

REM ============================================================
REM Verificar output
REM ============================================================

echo %COLOR_CYAN%[6/6] Verificando output...%COLOR_RESET%

if "%BUILD_TYPE%"=="Debug" (
    set OUTPUT_DIR=Debug
) else (
    set OUTPUT_DIR=Release
)

if not exist "%OUTPUT_DIR%\InputBusCore.exe" (
    echo %COLOR_RED%ERRO: Executavel nao encontrado em %OUTPUT_DIR%\InputBusCore.exe%COLOR_RESET%
    cd ..
    exit /b 1
)

for %%F in ("%OUTPUT_DIR%\InputBusCore.exe") do set FILE_SIZE=%%~zF
set /a FILE_SIZE_KB=%FILE_SIZE% / 1024

echo   - Executavel: %OUTPUT_DIR%\InputBusCore.exe
echo   - Tamanho: %FILE_SIZE_KB% KB
echo.

if not exist "%OUTPUT_DIR%\profiles\default_v2.json" (
    echo %COLOR_YELLOW%AVISO: Perfil default_v2.json nao encontrado%COLOR_RESET%
    echo   Copiando manualmente...
    if not exist "%OUTPUT_DIR%\profiles" mkdir "%OUTPUT_DIR%\profiles"
    copy ..\profiles\*.json "%OUTPUT_DIR%\profiles\" >nul 2>nul
)

echo   - Profiles: OK
echo.

cd ..

REM ============================================================
REM Instalar (se solicitado)
REM ============================================================

if %DO_INSTALL%==1 (
    echo %COLOR_CYAN%Instalando...%COLOR_RESET%
    cmake --install build --config %BUILD_TYPE%
    echo.
)

REM ============================================================
REM Executar (se solicitado)
REM ============================================================

if %DO_RUN%==1 (
    echo %COLOR_CYAN%Executando InputBus v2.0...%COLOR_RESET%
    echo ============================================================
    echo.
    cd build\%OUTPUT_DIR%
    InputBusCore.exe
    cd ..\..
    goto :end
)

REM ============================================================
REM Sucesso
REM ============================================================

echo ============================================================
echo %COLOR_GREEN%BUILD CONCLUIDO COM SUCESSO!%COLOR_RESET%
echo ============================================================
echo.
echo Executavel: build\%OUTPUT_DIR%\InputBusCore.exe
echo.
echo Para executar:
echo   cd build\%OUTPUT_DIR%
echo   InputBusCore.exe
echo.
echo Ou use:
echo   build_v2.bat run
echo.

:end
endlocal
