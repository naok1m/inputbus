# Build core engine
cmake -B build/core -S core -G "Visual Studio 17 2022" -A x64
cmake --build build/core --config Release

# Copy binaries
New-Item -ItemType Directory -Force dist | Out-Null
Copy-Item build/core/Release/rewsd_core.exe dist/
Copy-Item build/core/Release/*.dll dist/

# Build UI
Set-Location ui
npm install
npm run build
Set-Location ..
