# InputBus

InputBus is a personal alternative to reWASD: it captures keyboard/mouse input and maps it to a virtual Xbox 360 gamepad through ViGEm.

## What was implemented

- Profile system in UI with `Save Profile` and `Load Profile`
- Local profile persistence using keys `profile_{name}` in `localStorage`
- IPC sync from renderer to core using secure preload bridge
- Real-time `GamepadPreview` component driven by `GamepadState` IPC messages
- Example profile file: `profiles/fps.json`
- Core CMake setup and third-party folder structure for `nlohmann/json` and `ViGEmClient`

## Project structure highlights

- Core executable: `core/`
- Electron + React UI: `ui/`
- Profiles: `profiles/`

## Prerequisites (Windows)

- Node.js 20+
- npm 10+
- CMake (required to compile core)
- Visual Studio 2022 with C++ build tools
- ViGEmBus driver installed (kernel driver)

## Third-party dependencies

### nlohmann JSON

Header location expected by build:

- `core/third_party/nlohmann/json.hpp`

This repository now contains that file path.

### ViGEmClient

Header location:

- `core/third_party/ViGEmClient/include/ViGEm/Client.h`

Library location expected by CMake:

- `core/third_party/ViGEmClient/lib/ViGEmClient.lib`

Note: the header files are in place, but you still need `ViGEmClient.lib` in the `lib` folder.

## Build and run

### 1. Install UI dependencies

```powershell
cd ui
npm install
```

### 2. Run UI in development (Electron + Vite)

```powershell
npm run dev
```

### 3. Build UI

```powershell
npm run build
```

### 4. Build core

```powershell
cd ..
cmake -B build/core -S core -G "Visual Studio 17 2022" -A x64
cmake --build build/core --config Release
```

### 5. Full build script

```powershell
./scripts/build.ps1
```

## Profiles usage

### Save profile from UI

- Type a name in profile input
- Click `Save Profile`
- Data is saved in `localStorage` as `profile_{name}`

### Load profile from UI

- Select saved profile in dropdown
- Click `Load Profile`
- UI loads profile from `localStorage`
- UI sends profile JSON to core via IPC (`MsgType::LoadProfile`)

### Load profile from file (core side)

- Example: `profiles/fps.json`
- Core supports `MsgType::LoadProfile` with JSON payload and updates mapper/mouse config

## IPC contract used

- Renderer -> Main (Electron): `electronAPI.coreSend(type, payload)`
- Main -> Core bridge: named pipe `\\.\\pipe\\rewsd_core`
- Core -> UI realtime state: `MsgType::GamepadState` (type `101`)

## Notes

- `contextIsolation: true` is enabled and renderer access is restricted through preload API.
- ViGEmBus driver installation is separate from this codebase (`scripts/install-driver.bat`).
- If core build fails with missing `ViGEmClient.lib`, copy that file into `core/third_party/ViGEmClient/lib/`.
- Core starts with capture disabled by default for safety.
- Emergency stop/toggle: release `F12` to toggle capture on/off even without UI.
- UI can also toggle capture using IPC `MsgType::SetCaptureEnabled`.
