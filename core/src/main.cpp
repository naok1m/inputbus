// main.cpp — InputBus core process
// Input pipeline: Raw Input API → MappingEngine → MouseAnalogProcessor → ViGEmBus
#include "input/RawInputHandler_v2.h"
#include "input/NativeMouseInputService.h"
#include "vigem/MappingEngine.h"
#include "mapping/ProfileManager.h"
#include "vigem/MouseAnalogProcessor.h"
#include "vigem/MouseCameraProcessor.h"
#include "vigem/ViGEmManager.h"
#include "ipc/PipeServer.h"

#include <thread>
#include <chrono>
#include <atomic>
#include <mutex>
#include <cmath>
#include <iostream>
#include <filesystem>
#include <nlohmann/json.hpp>

// ============================================================================
// SHARED STATE (all access under g_stateMutex except atomics)
// ============================================================================

static GamepadState        g_gamepadState{};
static MappingEngine       g_mapper;
static MouseAnalogProcessor g_mouseProc;
static MouseCameraProcessor g_mouseCameraProc;
static MouseCameraConfig   g_mouseCameraConfig{};
static std::mutex          g_stateMutex;
static std::atomic<bool>   g_captureEnabled{false};
static std::atomic<bool>   g_nativeMouseCameraEnabled{false};

// Telemetry delta accumulators (atomic — written by input thread, read+reset by update thread)
static std::atomic<int> g_teleDeltaX{0};
static std::atomic<int> g_teleDeltaY{0};

// Auto-ping macro state — presses D-Up while ADS (RMB held)
static std::atomic<bool>  g_autoPingEnabled{false};
static std::atomic<int>   g_autoPingIntervalMs{3000};  // default 3 seconds
static std::atomic<int>   g_autoPingButton{0x0001};    // default: D-Up (0x0001)
static std::atomic<int>   g_autoPingDurationMs{80};    // button press duration

// Rapid-fire macro state
static std::atomic<bool>  g_rapidFireEnabled{false};
static std::atomic<int>   g_rapidFireIntervalMs{50};   // cycle time
static std::atomic<int>   g_rapidFireButton{0x0200};   // default: RB
static std::atomic<int>   g_rapidFireDurationMs{30};   // press duration per cycle

// Sensitivity boost (PQD / parachute) — hold key to multiply sensitivity
static std::atomic<bool>  g_sensBoostEnabled{false};
static std::atomic<int>   g_sensBoostKey{0x58};        // default: X key (0x58)
static std::atomic<float> g_sensBoostMultiplier{2.0f};
static std::atomic<bool>  g_sensBoostActive{false};    // currently held

// Drift aim macro — oscillates left stick to manipulate aim assist
static std::atomic<bool>  g_driftEnabled{false};
static std::atomic<float> g_driftAmplitude{3000.0f};   // stick units (of 32767)
static std::atomic<int>   g_driftIntervalMs{33};       // oscillation period (~30 Hz)

// YY weapon-swap cancel macro — double-tap Y on hotkey press
static std::atomic<bool>  g_yyEnabled{false};
static std::atomic<int>   g_yyKey{0x46};               // default: F key
static std::atomic<int>   g_yyDelayMs{80};             // delay between presses

// Tab scoreboard — hold Tab to press Back (scoreboard)
static std::atomic<bool>  g_tabScoreEnabled{false};

// No-recoil — compensate vertical recoil while firing
static std::atomic<bool>  g_noRecoilEnabled{false};
static std::atomic<float> g_noRecoilStrength{3.5f};    // per-tick pull (stick units)
static std::atomic<int>   g_noRecoilPattern{0};        // 0=pull-down, 1=s-pattern
static std::atomic<int>   g_noRecoilActivation{0};     // 0=hold(LMB), 1=toggle, 2=always

// Auto-ADS — toggle aim-down-sights on right click
static std::atomic<bool>  g_autoAdsEnabled{false};
static std::atomic<int>   g_autoAdsButton{0x0200};     // default: LT (mapped via button flag)

// Auto-sprint — hold left-stick click when moving forward
static std::atomic<bool>  g_autoSprintEnabled{false};

// Bunny-hop — timed jump (A) loop
static std::atomic<bool>  g_bunnyHopEnabled{false};
static std::atomic<int>   g_bunnyHopIntervalMs{400};
static std::atomic<int>   g_bunnyHopButton{0x1000};    // A button

// Auto-loot — rapid interaction press
static std::atomic<bool>  g_autoLootEnabled{false};
static std::atomic<int>   g_autoLootIntervalMs{100};
static std::atomic<int>   g_autoLootButton{0x4000};    // X button
static std::atomic<int>   g_autoLootDurationMs{30};

// Configurable capture hotkey (default: Shift + F8)
static std::atomic<int>   g_hotkeyVk{0x77};            // VK_F8
static std::atomic<int>   g_hotkeyMods{0x01};          // 0x01=Shift, 0x02=Ctrl, 0x04=Alt

// ============================================================================
// MOUSE BLOCKING — hides cursor & blocks legacy mouse from reaching games
// ============================================================================

static HHOOK g_mouseHook = nullptr;

// Low-level mouse hook: blocks ALL legacy mouse messages (WM_MOUSEMOVE,
// WM_LBUTTONDOWN, etc.) when capture is active. Raw Input (WM_INPUT) is
// unaffected — InputBus still receives hardware deltas for analog conversion.
static LRESULT CALLBACK LowLevelMouseProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode >= 0 && g_captureEnabled.load(std::memory_order_relaxed)) {
        if (g_nativeMouseCameraEnabled.load(std::memory_order_relaxed)) {
            if (wParam == WM_MOUSEMOVE) {
                return CallNextHookEx(g_mouseHook, nCode, wParam, lParam);
            }
            return 1; // keep mapped mouse buttons from double-firing in-game
        }

        const auto* info = reinterpret_cast<MSLLHOOKSTRUCT*>(lParam);
        if (info && info->dwExtraInfo == NativeMouseInputService::INPUTBUS_MOUSE_EXTRA_INFO) {
            return CallNextHookEx(g_mouseHook, nCode, wParam, lParam);
        }
        return 1; // eat the message — game never sees it
    }
    return CallNextHookEx(g_mouseHook, nCode, wParam, lParam);
}

// Enables full mouse blocking: hook + cursor clip + hide
static void EnableMouseBlock() {
    // 1. Install low-level mouse hook (blocks legacy mouse messages system-wide)
    if (!g_mouseHook) {
        g_mouseHook = SetWindowsHookExW(WH_MOUSE_LL, LowLevelMouseProc,
                                         GetModuleHandleW(nullptr), 0);
        if (g_mouseHook)
            std::cout << "[Cursor] Mouse hook installed\n";
        else
            std::cerr << "[Cursor] Failed to install mouse hook: " << GetLastError() << "\n";
    }

    // 2. Native mouse camera passes physical mouse movement to the game.
    // Analog mode still clips the cursor so only the virtual controller aims.
    if (g_nativeMouseCameraEnabled.load(std::memory_order_relaxed)) {
        ClipCursor(nullptr);
    } else {
        int cx = GetSystemMetrics(SM_CXSCREEN) / 2;
        int cy = GetSystemMetrics(SM_CYSCREEN) / 2;
        SetCursorPos(cx, cy);
        RECT clipRect = { cx, cy, cx + 1, cy + 1 };
        ClipCursor(&clipRect);
    }

    // 3. Hide visual cursor
    while (ShowCursor(FALSE) >= 0) {}
}

// Disables mouse blocking: release clip + show cursor
static void DisableMouseBlock() {
    if (g_mouseHook) {
        UnhookWindowsHookEx(g_mouseHook);
        g_mouseHook = nullptr;
        std::cout << "[Cursor] Mouse hook removed\n";
    }
    ClipCursor(nullptr);
    while (ShowCursor(TRUE) < 0) {}
}

// Console control handler — ensures cursor is released on Ctrl+C / window close
static BOOL WINAPI ConsoleCtrlHandler(DWORD) {
    if (g_mouseHook) {
        UnhookWindowsHookEx(g_mouseHook);
        g_mouseHook = nullptr;
    }
    ClipCursor(nullptr);
    while (ShowCursor(TRUE) < 0) {}
    return FALSE; // let default handler terminate process
}

// ============================================================================
// ENTRY POINT
// ============================================================================

int main() {
    try {
        SetConsoleCtrlHandler(ConsoleCtrlHandler, TRUE);
        std::cout << "InputBus — Mouse-to-Analog Controller\n\n";

        // ====================================================================
        // 1. CONNECT TO VIGEMBUS
        // ====================================================================

        auto& vigem = ViGEmManager::Get();
        for (int attempt = 1; attempt <= 10; ++attempt) {
            if (vigem.Connect()) break;
            if (attempt == 10) {
                std::cerr << "[ViGEm] Failed to connect after 10 attempts. Is the driver installed?\n";
                return 1;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(300));
        }
        std::cout << "[ViGEm] Connected.\n";

        // ====================================================================
        // 2. LOAD DEFAULT PROFILE
        // ====================================================================

        ProfileManager profiles;
        if (profiles.Load("profiles/default.json", g_mapper, g_mouseProc, &g_mouseCameraConfig)) {
            std::cout << "[Profile] Loaded: " << profiles.CurrentName() << "\n";
        } else {
            std::cout << "[Profile] No default profile found — loading hardcoded WASD defaults.\n";
            // Hardcoded WASD → Left Stick so the controller works even without a profile file
            g_mapper.SetBinding(87, {TargetType::LeftStickY, 0,  1.0f});  // W → Up
            g_mapper.SetBinding(83, {TargetType::LeftStickY, 0, -1.0f});  // S → Down
            g_mapper.SetBinding(65, {TargetType::LeftStickX, 0, -1.0f});  // A → Left
            g_mapper.SetBinding(68, {TargetType::LeftStickX, 0,  1.0f});  // D → Right
            g_mapper.SetBinding(32, {TargetType::Button, 0x1000, 1.0f});  // Space → A
            g_mapper.SetMouseBinding(0, {TargetType::Button, 0x4000, 1.0f}); // LMB → RB (fire)
            g_mapper.SetMouseBinding(1, {TargetType::Button, 0x0100, 1.0f}); // RMB → LB (ADS)
        }

        // ====================================================================
        // 3. IPC SERVER (UI communication)
        // ====================================================================

        g_nativeMouseCameraEnabled.store(g_mouseCameraConfig.nativeMouseCameraEnabled, std::memory_order_relaxed);

        PipeServer ipc;
        ipc.Start([&](MsgType type, const std::string& payload, HANDLE) -> std::string {
            using json = nlohmann::json;
            std::lock_guard lock(g_stateMutex);

            switch (type) {
                case MsgType::LoadProfile: {
                    try {
                        auto j = json::parse(payload);
                        std::string file;
                        if (j.is_string())
                            file = (std::filesystem::path("profiles") / j.get<std::string>()).string();
                        else if (j.is_object() && j.contains("profileFile"))
                            file = (std::filesystem::path("profiles") / j["profileFile"].get<std::string>()).string();

                        if (!file.empty() && profiles.Load(file, g_mapper, g_mouseProc, &g_mouseCameraConfig)) {
                            g_nativeMouseCameraEnabled.store(g_mouseCameraConfig.nativeMouseCameraEnabled, std::memory_order_relaxed);
                            if (g_captureEnabled.load(std::memory_order_relaxed)) EnableMouseBlock();
                            return R"({"ok":true})";
                        }
                        if (profiles.LoadFromJson(payload, g_mapper, g_mouseProc, &g_mouseCameraConfig)) {
                            g_nativeMouseCameraEnabled.store(g_mouseCameraConfig.nativeMouseCameraEnabled, std::memory_order_relaxed);
                            if (g_captureEnabled.load(std::memory_order_relaxed)) EnableMouseBlock();
                            return R"({"ok":true})";
                        }
                    } catch (...) {}
                    return R"({"ok":false,"error":"invalid profile"})";
                }

                case MsgType::SetActiveProfile: {
                    bool ok = profiles.LoadFromJson(payload, g_mapper, g_mouseProc, &g_mouseCameraConfig);
                    std::cout << "[Profile] SetActiveProfile: " << (ok ? "OK" : "FAIL")
                              << " hasW=" << g_mapper.HasKeyBinding(87)
                              << " hasA=" << g_mapper.HasKeyBinding(65) << "\n";
                    if (ok) {
                        g_nativeMouseCameraEnabled.store(g_mouseCameraConfig.nativeMouseCameraEnabled, std::memory_order_relaxed);
                        if (g_captureEnabled.load(std::memory_order_relaxed)) EnableMouseBlock();
                    }
                    return ok
                        ? R"({"ok":true})"
                        : R"({"ok":false,"error":"invalid profile"})";
                }

                case MsgType::SetMouseConfig: {
                    try {
                        auto j = json::parse(payload);
                        AnalogCurveConfig cfg{};

                        if (j.contains("mouseDPI"))        cfg.mouseDPI        = j["mouseDPI"];
                        if (j.contains("sensitivityX"))    cfg.sensitivityX    = j["sensitivityX"];
                        if (j.contains("sensitivityY"))    cfg.sensitivityY    = j["sensitivityY"];
                        if (j.contains("sensitivity")) {
                            float s = j["sensitivity"];
                            cfg.sensitivityX = cfg.sensitivityY = s;
                        }
                        if (j.contains("exponent"))        cfg.exponent        = j["exponent"];
                        if (j.contains("maxSpeed"))        cfg.maxSpeed        = j["maxSpeed"];
                        if (j.contains("deadzone"))        cfg.deadzone        = j["deadzone"];
                        if (j.contains("smoothingFactor")) cfg.smoothingFactor = j["smoothingFactor"];
                        if (j.contains("maxStepPerFrame")) cfg.maxStepPerFrame = j["maxStepPerFrame"];
                        // Legacy compat: convert old smoothSamples → smoothingFactor
                        if (j.contains("smoothSamples") && !j.contains("smoothingFactor")) {
                            int samples = j["smoothSamples"];
                            cfg.smoothingFactor = (samples <= 1) ? 0.0f : static_cast<float>(samples) * 0.001f;
                        }
                        if (j.contains("jitterThreshold")) cfg.jitterThreshold = j["jitterThreshold"];
                        if (j.contains("decayDelay"))      cfg.decayDelay      = j["decayDelay"];
                        if (j.contains("decayRate"))       cfg.decayRate       = j["decayRate"];
                        if (j.contains("decayMinStick"))   cfg.decayMinStick   = j["decayMinStick"];

                        if (j.contains("antiDeadzone"))    cfg.antiDeadzone    = j["antiDeadzone"];

                        if (j.contains("nativeMouseCameraEnabled")) g_mouseCameraConfig.nativeMouseCameraEnabled = j["nativeMouseCameraEnabled"].get<bool>();
                        if (j.contains("mouseCameraSensitivityX"))  g_mouseCameraConfig.mouseCameraSensitivityX = j["mouseCameraSensitivityX"].get<float>();
                        if (j.contains("mouseCameraSensitivityY"))  g_mouseCameraConfig.mouseCameraSensitivityY = j["mouseCameraSensitivityY"].get<float>();
                        if (j.contains("mouseCameraDeadzone"))      g_mouseCameraConfig.mouseCameraDeadzone = j["mouseCameraDeadzone"].get<float>();
                        if (j.contains("mouseCameraCurve"))         g_mouseCameraConfig.mouseCameraCurve = j["mouseCameraCurve"].get<float>();
                        if (j.contains("mouseCameraSmoothing"))     g_mouseCameraConfig.mouseCameraSmoothing = j["mouseCameraSmoothing"].get<float>();
                        if (j.contains("mouseCameraInvertY"))       g_mouseCameraConfig.mouseCameraInvertY = j["mouseCameraInvertY"].get<bool>();

                        if (j.contains("accelCurve") && j["accelCurve"].is_array()) {
                            const auto& arr = j["accelCurve"];
                            cfg.accelPointCount = std::min(static_cast<int>(arr.size()), MAX_ACCEL_POINTS);
                            for (int i = 0; i < cfg.accelPointCount; ++i) {
                                cfg.accelCurve[i].speed     = arr[i].value("speed", 0.0f);
                                cfg.accelCurve[i].multiplier = arr[i].value("mult",  1.0f);
                            }
                        }

                        g_mouseProc.UpdateConfig(cfg);
                        g_nativeMouseCameraEnabled.store(g_mouseCameraConfig.nativeMouseCameraEnabled, std::memory_order_relaxed);
                        if (g_captureEnabled.load(std::memory_order_relaxed)) EnableMouseBlock();
                        return R"({"ok":true})";
                    } catch (...) {
                        return R"({"ok":false,"error":"invalid mouse config"})";
                    }
                }

                case MsgType::GetStatus: {
                    json j;
                    j["connected"]     = vigem.IsConnected();
                    j["profile"]       = profiles.CurrentName();
                    j["captureEnabled"] = g_captureEnabled.load();
                    j["nativeMouseCameraEnabled"] = g_mouseCameraConfig.nativeMouseCameraEnabled;

                    auto dbg = g_mouseProc.GetDebugState();
                    j["debug"]["stickX"]    = dbg.stickX;
                    j["debug"]["stickY"]    = dbg.stickY;
                    j["debug"]["magnitude"] = dbg.magnitude;
                    j["debug"]["mouseSpeed"] = dbg.mouseSpeed;
                    j["debug"]["accelMult"] = dbg.accelMultiplier;
                    j["debug"]["idleMs"]    = dbg.timeSinceLastInput;
                    j["debug"]["decaying"]  = dbg.isDecaying;
                    return j.dump();
                }

                case MsgType::SetCaptureEnabled: {
                    try {
                        auto j = json::parse(payload);
                        bool en = j.is_boolean() ? j.get<bool>() : j.value("enabled", false);
                        g_captureEnabled.store(en);

                        if (en) {
                            EnableMouseBlock();
                        } else {
                            g_mouseCameraProc.Reset();
                            DisableMouseBlock();
                        }

                        return json{{"ok", true}, {"captureEnabled", en}}.dump();
                    } catch (...) {
                        return R"({"ok":false,"error":"invalid payload"})";
                    }
                }

                case MsgType::SetMacroConfig: {
                    try {
                        auto j = json::parse(payload);

                        // Auto-ping
                        if (j.contains("autoPingEnabled"))
                            g_autoPingEnabled.store(j["autoPingEnabled"].get<bool>());
                        if (j.contains("autoPingIntervalMs"))
                            g_autoPingIntervalMs.store(j["autoPingIntervalMs"].get<int>());
                        if (j.contains("autoPingButton"))
                            g_autoPingButton.store(j["autoPingButton"].get<int>());
                        if (j.contains("autoPingDurationMs"))
                            g_autoPingDurationMs.store(j["autoPingDurationMs"].get<int>());

                        // Rapid fire
                        if (j.contains("rapidFireEnabled"))
                            g_rapidFireEnabled.store(j["rapidFireEnabled"].get<bool>());
                        if (j.contains("rapidFireIntervalMs"))
                            g_rapidFireIntervalMs.store(j["rapidFireIntervalMs"].get<int>());
                        if (j.contains("rapidFireButton"))
                            g_rapidFireButton.store(j["rapidFireButton"].get<int>());
                        if (j.contains("rapidFireDurationMs"))
                            g_rapidFireDurationMs.store(j["rapidFireDurationMs"].get<int>());

                        // Sensitivity boost (PQD)
                        if (j.contains("sensBoostEnabled"))
                            g_sensBoostEnabled.store(j["sensBoostEnabled"].get<bool>());
                        if (j.contains("sensBoostKey"))
                            g_sensBoostKey.store(j["sensBoostKey"].get<int>());
                        if (j.contains("sensBoostMultiplier"))
                            g_sensBoostMultiplier.store(j["sensBoostMultiplier"].get<float>());

                        // Drift aim
                        if (j.contains("driftEnabled"))
                            g_driftEnabled.store(j["driftEnabled"].get<bool>());
                        if (j.contains("driftAmplitude"))
                            g_driftAmplitude.store(j["driftAmplitude"].get<float>());
                        if (j.contains("driftIntervalMs"))
                            g_driftIntervalMs.store(j["driftIntervalMs"].get<int>());

                        // YY weapon swap
                        if (j.contains("yyEnabled"))
                            g_yyEnabled.store(j["yyEnabled"].get<bool>());
                        if (j.contains("yyKey"))
                            g_yyKey.store(j["yyKey"].get<int>());
                        if (j.contains("yyDelayMs"))
                            g_yyDelayMs.store(j["yyDelayMs"].get<int>());

                        // Tab scoreboard
                        if (j.contains("tabScoreEnabled"))
                            g_tabScoreEnabled.store(j["tabScoreEnabled"].get<bool>());

                        // No-recoil
                        if (j.contains("noRecoilEnabled"))
                            g_noRecoilEnabled.store(j["noRecoilEnabled"].get<bool>());
                        if (j.contains("noRecoilStrength"))
                            g_noRecoilStrength.store(j["noRecoilStrength"].get<float>());
                        if (j.contains("noRecoilPattern"))
                            g_noRecoilPattern.store(j["noRecoilPattern"].get<int>());
                        if (j.contains("noRecoilActivation"))
                            g_noRecoilActivation.store(j["noRecoilActivation"].get<int>());

                        // Auto-ADS
                        if (j.contains("autoAdsEnabled"))
                            g_autoAdsEnabled.store(j["autoAdsEnabled"].get<bool>());
                        if (j.contains("autoAdsButton"))
                            g_autoAdsButton.store(j["autoAdsButton"].get<int>());

                        // Auto-sprint
                        if (j.contains("autoSprintEnabled"))
                            g_autoSprintEnabled.store(j["autoSprintEnabled"].get<bool>());

                        // Bunny-hop
                        if (j.contains("bunnyHopEnabled"))
                            g_bunnyHopEnabled.store(j["bunnyHopEnabled"].get<bool>());
                        if (j.contains("bunnyHopIntervalMs"))
                            g_bunnyHopIntervalMs.store(j["bunnyHopIntervalMs"].get<int>());
                        if (j.contains("bunnyHopButton"))
                            g_bunnyHopButton.store(j["bunnyHopButton"].get<int>());

                        // Auto-loot
                        if (j.contains("autoLootEnabled"))
                            g_autoLootEnabled.store(j["autoLootEnabled"].get<bool>());
                        if (j.contains("autoLootIntervalMs"))
                            g_autoLootIntervalMs.store(j["autoLootIntervalMs"].get<int>());
                        if (j.contains("autoLootButton"))
                            g_autoLootButton.store(j["autoLootButton"].get<int>());
                        if (j.contains("autoLootDurationMs"))
                            g_autoLootDurationMs.store(j["autoLootDurationMs"].get<int>());

                        // Configurable hotkey
                        if (j.contains("hotkeyVk"))
                            g_hotkeyVk.store(j["hotkeyVk"].get<int>());
                        if (j.contains("hotkeyMods"))
                            g_hotkeyMods.store(j["hotkeyMods"].get<int>());

                        return R"({"ok":true})";
                    } catch (...) {
                        return R"({"ok":false,"error":"invalid macro config"})";
                    }
                }

                default:
                    return R"({"error":"unknown command"})";
            }
        });
        std::cout << "[IPC] Server ready.\n";

        // ====================================================================
        // 4. HIGH-FREQUENCY UPDATE LOOP (1000 Hz)
        // ====================================================================

        std::atomic<bool> running{true};

        auto updateThread = std::thread([&]() {
            using Clock = std::chrono::steady_clock;

            auto lastTime = Clock::now();
            const auto targetInterval = std::chrono::microseconds(1000); // 1 ms
            uint64_t tick = 0;

            // Auto-ping macro state
            float pingTimer = 0.0f;
            float pingHoldTimer = 0.0f;
            bool  pingHolding = false;

            // Rapid-fire macro state
            float rfTimer = 0.0f;
            float rfHoldTimer = 0.0f;
            bool  rfHolding = false;

            // Drift aim macro state
            float driftTimer = 0.0f;
            bool  driftPhase = false; // false=left, true=right

            // YY macro state
            enum class YYState { Idle, Press1, Gap1, Press2, Gap2 };
            YYState yyState = YYState::Idle;
            float yyTimer = 0.0f;
            bool  yyKeyWasDown = false;

            // No-recoil macro state
            bool  nrLmbWasDown = false;
            bool  nrToggled = false;
            float nrSTimer = 0.0f;        // S-pattern oscillation timer

            // Auto-ADS state
            bool  adsRmbWasDown = false;
            bool  adsToggled = false;

            // Auto-sprint state (left-stick click = LS = 0x0040)
            // Engages LS when left stick is pushed forward

            // Bunny-hop state
            float bhTimer = 0.0f;
            float bhHoldTimer = 0.0f;
            bool  bhHolding = false;

            // Auto-loot state
            float alTimer = 0.0f;
            float alHoldTimer = 0.0f;
            bool  alHolding = false;

            while (running.load()) {
                const auto now  = Clock::now();
                const float dt  = std::chrono::duration<float>(now - lastTime).count();
                lastTime = now;

                {
                    std::lock_guard lock(g_stateMutex);

                    if (g_captureEnabled.load())
                        g_mapper.RefreshLeftStickFromKeyboard(g_gamepadState);

                    const bool nativeMouseCameraEnabled = g_mouseCameraConfig.nativeMouseCameraEnabled;
                    if (nativeMouseCameraEnabled) {
                        g_mouseProc.Reset();
                        g_gamepadState.thumbRX = 0;
                        g_gamepadState.thumbRY = 0;
                    } else {
                        int16_t rx = 0, ry = 0;
                        g_mouseProc.Tick(dt, rx, ry);
                        g_mouseCameraProc.Reset();
                        g_gamepadState.thumbRX = rx;
                        g_gamepadState.thumbRY = ry;
                    }

                    // Auto-ping macro — while ADS (LT held), press D-Up on interval
                    if (g_autoPingEnabled.load() && g_captureEnabled.load()) {
                        bool adsHeld = g_gamepadState.leftTrigger > 0;
                        if (adsHeld) {
                            const uint16_t pingBtn = static_cast<uint16_t>(g_autoPingButton.load());
                            const float interval = g_autoPingIntervalMs.load() / 1000.0f;
                            const float duration = g_autoPingDurationMs.load() / 1000.0f;

                            pingTimer += dt;
                            if (pingHolding) {
                                pingHoldTimer += dt;
                                g_gamepadState.buttons |= pingBtn;
                                if (pingHoldTimer >= duration) {
                                    pingHolding = false;
                                    g_gamepadState.buttons &= ~pingBtn;
                                }
                            } else if (pingTimer >= interval) {
                                pingTimer = 0.0f;
                                pingHoldTimer = 0.0f;
                                pingHolding = true;
                                g_gamepadState.buttons |= pingBtn;
                            }
                        } else {
                            pingTimer = 0.0f;
                            pingHolding = false;
                        }
                    } else {
                        pingTimer = 0.0f;
                        pingHolding = false;
                    }

                    // ── Rapid-fire macro ──
                    if (g_rapidFireEnabled.load() && g_captureEnabled.load()) {
                        const uint16_t rfBtn = static_cast<uint16_t>(g_rapidFireButton.load());
                        const float rfInterval = g_rapidFireIntervalMs.load() / 1000.0f;
                        const float rfDuration = g_rapidFireDurationMs.load() / 1000.0f;

                        rfTimer += dt;
                        if (rfHolding) {
                            rfHoldTimer += dt;
                            g_gamepadState.buttons |= rfBtn;
                            if (rfHoldTimer >= rfDuration) {
                                rfHolding = false;
                                g_gamepadState.buttons &= ~rfBtn;
                            }
                        } else if (rfTimer >= rfInterval) {
                            rfTimer = 0.0f;
                            rfHoldTimer = 0.0f;
                            rfHolding = true;
                            g_gamepadState.buttons |= rfBtn;
                        }
                    } else {
                        rfTimer = 0.0f;
                        rfHolding = false;
                    }

                    // ── Sensitivity boost (PQD) ──
                    if (g_sensBoostEnabled.load() && g_captureEnabled.load()) {
                        bool keyDown = g_sensBoostActive.load(std::memory_order_relaxed);
                        g_mouseProc.SetSensitivityMultiplier(keyDown ? g_sensBoostMultiplier.load() : 1.0f);
                    } else {
                        g_mouseProc.SetSensitivityMultiplier(1.0f);
                    }

                    // ── Drift aim macro — oscillate left stick X only while ADS (LT) ──
                    if (g_driftEnabled.load() && g_captureEnabled.load() && g_gamepadState.leftTrigger > 0) {
                        const float driftInterval = g_driftIntervalMs.load() / 1000.0f;
                        const float amplitude = g_driftAmplitude.load();

                        driftTimer += dt;
                        if (driftTimer >= driftInterval) {
                            driftTimer = 0.0f;
                            driftPhase = !driftPhase;
                        }

                        int16_t driftOffset = static_cast<int16_t>(driftPhase ? amplitude : -amplitude);
                        int32_t lx = static_cast<int32_t>(g_gamepadState.thumbLX) + driftOffset;
                        g_gamepadState.thumbLX = static_cast<int16_t>(std::clamp(lx, (int32_t)-32767, (int32_t)32767));
                    } else {
                        driftTimer = 0.0f;
                        driftPhase = false;
                    }

                    // ── YY weapon-swap cancel ──
                    if (g_yyEnabled.load() && g_captureEnabled.load()) {
                        const int yyKeyVk = g_yyKey.load();
                        bool yyKeyDown = (GetAsyncKeyState(yyKeyVk) & 0x8000) != 0;
                        const float yyDelay = g_yyDelayMs.load() / 1000.0f;
                        constexpr uint16_t Y_BTN = 0x8000;

                        // Detect rising edge
                        if (yyKeyDown && !yyKeyWasDown && yyState == YYState::Idle) {
                            yyState = YYState::Press1;
                            yyTimer = 0.0f;
                        }
                        yyKeyWasDown = yyKeyDown;

                        switch (yyState) {
                            case YYState::Press1:
                                g_gamepadState.buttons |= Y_BTN;
                                yyTimer += dt;
                                if (yyTimer >= yyDelay) { yyState = YYState::Gap1; yyTimer = 0.0f; }
                                break;
                            case YYState::Gap1:
                                g_gamepadState.buttons &= ~Y_BTN;
                                yyTimer += dt;
                                if (yyTimer >= yyDelay) { yyState = YYState::Press2; yyTimer = 0.0f; }
                                break;
                            case YYState::Press2:
                                g_gamepadState.buttons |= Y_BTN;
                                yyTimer += dt;
                                if (yyTimer >= yyDelay) { yyState = YYState::Gap2; yyTimer = 0.0f; }
                                break;
                            case YYState::Gap2:
                                g_gamepadState.buttons &= ~Y_BTN;
                                yyTimer += dt;
                                if (yyTimer >= yyDelay) { yyState = YYState::Idle; }
                                break;
                            case YYState::Idle:
                                break;
                        }
                    } else {
                        yyState = YYState::Idle;
                        yyKeyWasDown = false;
                    }

                    // ── Tab scoreboard — hold Tab → hold Back button ──
                    if (g_tabScoreEnabled.load() && g_captureEnabled.load()) {
                        if (GetAsyncKeyState(VK_TAB) & 0x8000) {
                            g_gamepadState.buttons |= 0x0020; // Back/Select
                        }
                    }

                    // ── No-recoil — pull right stick down while firing (RT > 0) ──
                    if (g_noRecoilEnabled.load() && g_captureEnabled.load()) {
                        const int activation = g_noRecoilActivation.load();
                        bool shouldApply = false;

                        // Check fire state from gamepad (RT), not GetAsyncKeyState
                        // (mouse hook blocks GetAsyncKeyState for mouse buttons)
                        bool firing = g_gamepadState.rightTrigger > 0;

                        if (activation == 2) { // always — while firing
                            shouldApply = firing;
                        } else if (activation == 0) { // hold — while firing
                            shouldApply = firing;
                        } else { // toggle — flip on fire rising edge
                            if (firing && !nrLmbWasDown) nrToggled = !nrToggled;
                            nrLmbWasDown = firing;
                            shouldApply = nrToggled;
                        }

                        if (shouldApply) {
                            const float strength = g_noRecoilStrength.load();
                            const int pattern = g_noRecoilPattern.load();

                            // Downward pull on right stick Y (strength * 500 for noticeable effect)
                            int32_t newRY = static_cast<int32_t>(g_gamepadState.thumbRY) - static_cast<int32_t>(strength * 500.0f);
                            g_gamepadState.thumbRY = static_cast<int16_t>(std::clamp(newRY, (int32_t)-32767, (int32_t)32767));

                            // S-pattern: add horizontal wobble
                            if (pattern == 1) {
                                nrSTimer += dt;
                                float wobble = sinf(nrSTimer * 8.0f) * strength * 80.0f;
                                int32_t newRX = static_cast<int32_t>(g_gamepadState.thumbRX) + static_cast<int32_t>(wobble);
                                g_gamepadState.thumbRX = static_cast<int16_t>(std::clamp(newRX, (int32_t)-32767, (int32_t)32767));
                            } else {
                                nrSTimer = 0.0f;
                            }
                        } else {
                            nrSTimer = 0.0f;
                        }
                    } else {
                        nrLmbWasDown = false;
                        nrToggled = false;
                        nrSTimer = 0.0f;
                    }

                    // ── Auto-ADS — toggle LT on right-click ──
                    // Uses leftTrigger state from bindings (RMB→LT) to detect rising edge
                    if (g_autoAdsEnabled.load() && g_captureEnabled.load()) {
                        bool rmbDown = g_gamepadState.leftTrigger > 0;
                        if (rmbDown && !adsRmbWasDown) adsToggled = !adsToggled;
                        adsRmbWasDown = rmbDown;

                        if (adsToggled && !rmbDown) {
                            // Keep LT held even after RMB released (toggle behavior)
                            g_gamepadState.leftTrigger = 255;
                        }
                    } else {
                        adsRmbWasDown = false;
                        adsToggled = false;
                    }

                    // ── Auto-sprint — hold LS when left stick pushed forward ──
                    if (g_autoSprintEnabled.load() && g_captureEnabled.load()) {
                        // If left stick Y is pushed forward (positive = up), press LS (0x0040)
                        if (g_gamepadState.thumbLY > 8000) {
                            g_gamepadState.buttons |= 0x0040; // Left Stick click
                        }
                    }

                    // ── Bunny-hop — timed A-button loop while Space held ──
                    if (g_bunnyHopEnabled.load() && g_captureEnabled.load()) {
                        bool spaceDown = (GetAsyncKeyState(VK_SPACE) & 0x8000) != 0;
                        if (spaceDown) {
                            const uint16_t bhBtn = static_cast<uint16_t>(g_bunnyHopButton.load());
                            const float bhInterval = g_bunnyHopIntervalMs.load() / 1000.0f;
                            const float bhDuration = bhInterval * 0.4f; // 40% press, 60% release

                            bhTimer += dt;
                            if (bhHolding) {
                                bhHoldTimer += dt;
                                g_gamepadState.buttons |= bhBtn;
                                if (bhHoldTimer >= bhDuration) {
                                    bhHolding = false;
                                    g_gamepadState.buttons &= ~bhBtn;
                                }
                            } else if (bhTimer >= bhInterval) {
                                bhTimer = 0.0f;
                                bhHoldTimer = 0.0f;
                                bhHolding = true;
                                g_gamepadState.buttons |= bhBtn;
                            }
                        } else {
                            bhTimer = 0.0f;
                            bhHolding = false;
                        }
                    } else {
                        bhTimer = 0.0f;
                        bhHolding = false;
                    }

                    // ── Auto-loot — rapid X press while key held ──
                    if (g_autoLootEnabled.load() && g_captureEnabled.load()) {
                        bool lootKeyDown = (GetAsyncKeyState(VK_MBUTTON) & 0x8000) != 0; // Middle mouse
                        if (lootKeyDown) {
                            const uint16_t alBtn = static_cast<uint16_t>(g_autoLootButton.load());
                            const float alInterval = g_autoLootIntervalMs.load() / 1000.0f;
                            const float alDuration = g_autoLootDurationMs.load() / 1000.0f;

                            alTimer += dt;
                            if (alHolding) {
                                alHoldTimer += dt;
                                g_gamepadState.buttons |= alBtn;
                                if (alHoldTimer >= alDuration) {
                                    alHolding = false;
                                    g_gamepadState.buttons &= ~alBtn;
                                }
                            } else if (alTimer >= alInterval) {
                                alTimer = 0.0f;
                                alHoldTimer = 0.0f;
                                alHolding = true;
                                g_gamepadState.buttons |= alBtn;
                            }
                        } else {
                            alTimer = 0.0f;
                            alHolding = false;
                        }
                    } else {
                        alTimer = 0.0f;
                        alHolding = false;
                    }

                    if (g_mouseCameraConfig.nativeMouseCameraEnabled) {
                        g_gamepadState.thumbRX = 0;
                        g_gamepadState.thumbRY = 0;
                    }

                    vigem.UpdateState(g_gamepadState);
                }

                // Send telemetry to UI at ~250 Hz (every 4 ticks)
                // Built inside mutex, sent OUTSIDE to prevent deadlock
                // (SendToAll can block if pipe buffer is full)
                std::string telemetryPayload;
                if (++tick % 4 == 0) {
                    std::lock_guard lock(g_stateMutex);
                    using json = nlohmann::json;
                    json gp;
                    gp["buttons"]      = g_gamepadState.buttons;
                    gp["leftTrigger"]  = g_gamepadState.leftTrigger;
                    gp["rightTrigger"] = g_gamepadState.rightTrigger;
                    gp["thumbLX"]      = g_gamepadState.thumbLX;
                    gp["thumbLY"]      = g_gamepadState.thumbLY;
                    gp["thumbRX"]      = g_gamepadState.thumbRX;
                    gp["thumbRY"]      = g_gamepadState.thumbRY;
                    gp["mouseDeltaX"]  = g_teleDeltaX.exchange(0);
                    gp["mouseDeltaY"]  = g_teleDeltaY.exchange(0);
                    telemetryPayload = gp.dump();
                }
                if (!telemetryPayload.empty()) {
                    ipc.SendToAll(MsgType::GamepadState, telemetryPayload);
                }

                std::this_thread::sleep_until(lastTime + targetInterval);
            }
        });

        // ====================================================================
        // 5. RAW INPUT CAPTURE (runs on dedicated thread — non-blocking here)
        // ====================================================================

        std::cout << "[RawInput] Starting capture. Press Shift+F8 to toggle (configurable).\n\n";

        auto& rawInput = RawInputHandler::Get();
        RawInputHandler::Config inputCfg;
        inputCfg.captureKeyboard = true;
        inputCfg.captureMouse    = true;
        inputCfg.backgroundCapture = true; // Required: message-only window never gets focus without RIDEV_INPUTSINK
        rawInput.SetConfig(inputCfg);

        // Track whether we already toggled for this hotkey press (prevent repeat)
        static bool s_hotkeyFired = false;

        rawInput.Start([&](const RawInputEvent& evt) -> bool {
            // Configurable hotkey toggle — processed before capture-enabled check
            // Check on KeyDown (modifiers are reliably held at this moment)
            const uint32_t hkVk = static_cast<uint32_t>(g_hotkeyVk.load());

            if (evt.type == RawInputType::KeyDown && evt.key.vkCode == hkVk) {
                if (!s_hotkeyFired) {
                    int mods = g_hotkeyMods.load();
                    bool modsOk = true;
                    if (mods & 0x01) modsOk = modsOk && ((GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0);
                    if (mods & 0x02) modsOk = modsOk && ((GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0);
                    if (mods & 0x04) modsOk = modsOk && ((GetAsyncKeyState(VK_MENU) & 0x8000) != 0);
                    // If no mods required, always match
                    if (modsOk) {
                        s_hotkeyFired = true;
                        bool next = !g_captureEnabled.load();
                        g_captureEnabled.store(next);
                        std::cout << "[Capture] " << (next ? "ENABLED" : "DISABLED") << " (hotkey)\n";

                        if (next)
                            EnableMouseBlock();
                        else {
                            std::lock_guard lock(g_stateMutex);
                            g_mouseCameraProc.Reset();
                            DisableMouseBlock();
                        }

                        return false;
                    }
                }
            }
            // Reset on KeyUp so next press triggers again
            if (evt.type == RawInputType::KeyUp && evt.key.vkCode == hkVk) {
                s_hotkeyFired = false;
            }

            if (!g_captureEnabled.load()) return false;

            // Sensitivity boost key tracking
            if (g_sensBoostEnabled.load()) {
                const uint32_t boostKey = static_cast<uint32_t>(g_sensBoostKey.load());
                if (evt.type == RawInputType::KeyDown && evt.key.vkCode == boostKey) {
                    g_sensBoostActive.store(true, std::memory_order_relaxed);
                } else if (evt.type == RawInputType::KeyUp && evt.key.vkCode == boostKey) {
                    g_sensBoostActive.store(false, std::memory_order_relaxed);
                }
            }

            if (evt.type == RawInputType::MouseMove &&
                g_nativeMouseCameraEnabled.load(std::memory_order_relaxed)) {
                g_teleDeltaX.fetch_add(static_cast<int>(evt.mouse.deltaX));
                g_teleDeltaY.fetch_add(static_cast<int>(evt.mouse.deltaY));
                return false;
            }

            std::lock_guard lock(g_stateMutex);
            switch (evt.type) {
                case RawInputType::KeyDown:
                    return g_mapper.OnKeyEvent(evt.key.vkCode, true, g_gamepadState);

                case RawInputType::KeyUp:
                    return g_mapper.OnKeyEvent(evt.key.vkCode, false, g_gamepadState);

                case RawInputType::MouseMove:
                    g_teleDeltaX.fetch_add(static_cast<int>(evt.mouse.deltaX));
                    g_teleDeltaY.fetch_add(static_cast<int>(evt.mouse.deltaY));
                    if (g_mouseCameraConfig.nativeMouseCameraEnabled) {
                        g_gamepadState.thumbRX = 0;
                        g_gamepadState.thumbRY = 0;
                        g_mouseProc.Reset();
                        return false;
                    }

                    g_mouseProc.AddDelta(
                        static_cast<float>(evt.mouse.deltaX),
                        static_cast<float>(evt.mouse.deltaY));
                    return false; // raw input deltas only — legacy mouse blocked by hook

                case RawInputType::MouseButton:
                    return g_mapper.OnMouseButton(evt.mouseBtn.button, evt.mouseBtn.pressed, g_gamepadState);

                default: return false;
            }
        });

        // Block main thread until terminated
        std::cout << "[Main] Running. Press Ctrl+C or close the window to exit.\n";
        while (running.load()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }

        // ====================================================================
        // 6. CLEANUP
        // ====================================================================

        running.store(false);
        rawInput.Stop();
        updateThread.join();
        vigem.Disconnect();

        // Release all mouse constraints
        if (g_mouseHook) {
            UnhookWindowsHookEx(g_mouseHook);
            g_mouseHook = nullptr;
        }
        ClipCursor(nullptr);
        while (ShowCursor(TRUE) < 0) {}

        std::cout << "[Main] Shutdown complete.\n";
        return 0;

    } catch (const std::exception& ex) {
        std::cerr << "[Fatal] " << ex.what() << "\n";
        return 1;
    } catch (...) {
        std::cerr << "[Fatal] Unknown exception.\n";
        return 1;
    }
}
