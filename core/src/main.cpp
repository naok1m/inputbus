// main.cpp — InputBus core process
// Input pipeline: Raw Input API → MappingEngine → MouseAnalogProcessor → ViGEmBus
#include "input/RawInputHandler_v2.h"
#include "vigem/MappingEngine.h"
#include "mapping/ProfileManager.h"
#include "vigem/MouseAnalogProcessor.h"
#include "vigem/ViGEmManager.h"
#include "ipc/PipeServer.h"

#include <thread>
#include <chrono>
#include <atomic>
#include <mutex>
#include <iostream>
#include <filesystem>
#include <nlohmann/json.hpp>

// ============================================================================
// SHARED STATE (all access under g_stateMutex except atomics)
// ============================================================================

static GamepadState        g_gamepadState{};
static MappingEngine       g_mapper;
static MouseAnalogProcessor g_mouseProc;
static std::mutex          g_stateMutex;
static std::atomic<bool>   g_captureEnabled{false};

// Telemetry delta accumulators (atomic — written by input thread, read+reset by update thread)
static std::atomic<int> g_teleDeltaX{0};
static std::atomic<int> g_teleDeltaY{0};

// ============================================================================
// ENTRY POINT
// ============================================================================

int main() {
    try {
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
        if (profiles.Load("profiles/default.json", g_mapper, g_mouseProc)) {
            std::cout << "[Profile] Loaded: " << profiles.CurrentName() << "\n";
        } else {
            std::cout << "[Profile] No default profile found — using built-in defaults.\n";
        }

        // ====================================================================
        // 3. IPC SERVER (UI communication)
        // ====================================================================

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

                        if (!file.empty() && profiles.Load(file, g_mapper, g_mouseProc))
                            return R"({"ok":true})";
                        if (profiles.LoadFromJson(payload, g_mapper, g_mouseProc))
                            return R"({"ok":true})";
                    } catch (...) {}
                    return R"({"ok":false,"error":"invalid profile"})";
                }

                case MsgType::SetActiveProfile: {
                    return profiles.LoadFromJson(payload, g_mapper, g_mouseProc)
                        ? R"({"ok":true})"
                        : R"({"ok":false,"error":"invalid profile"})";
                }

                case MsgType::SetMouseConfig: {
                    try {
                        auto j = json::parse(payload);
                        AnalogCurveConfig cfg{};

                        if (j.contains("sensitivityX"))    cfg.sensitivityX    = j["sensitivityX"];
                        if (j.contains("sensitivityY"))    cfg.sensitivityY    = j["sensitivityY"];
                        if (j.contains("sensitivity")) {
                            float s = j["sensitivity"];
                            cfg.sensitivityX = cfg.sensitivityY = s;
                        }
                        if (j.contains("exponent"))        cfg.exponent        = j["exponent"];
                        if (j.contains("maxSpeed"))        cfg.maxSpeed        = j["maxSpeed"];
                        if (j.contains("deadzone"))        cfg.deadzone        = j["deadzone"];
                        if (j.contains("smoothSamples"))   cfg.smoothSamples   = j["smoothSamples"];
                        if (j.contains("jitterThreshold")) cfg.jitterThreshold = j["jitterThreshold"];
                        if (j.contains("decayDelay"))      cfg.decayDelay      = j["decayDelay"];
                        if (j.contains("decayRate"))       cfg.decayRate       = j["decayRate"];

                        g_mouseProc.UpdateConfig(cfg);
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

                    auto dbg = g_mouseProc.GetDebugState();
                    j["debug"]["stickX"]    = dbg.stickX;
                    j["debug"]["stickY"]    = dbg.stickY;
                    j["debug"]["magnitude"] = dbg.magnitude;
                    j["debug"]["idleMs"]    = dbg.timeSinceLastInput;
                    j["debug"]["decaying"]  = dbg.isDecaying;
                    return j.dump();
                }

                case MsgType::SetCaptureEnabled: {
                    try {
                        auto j = json::parse(payload);
                        bool en = j.is_boolean() ? j.get<bool>() : j.value("enabled", false);
                        g_captureEnabled.store(en);
                        return json{{"ok", true}, {"captureEnabled", en}}.dump();
                    } catch (...) {
                        return R"({"ok":false,"error":"invalid payload"})";
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

            while (running.load()) {
                const auto now  = Clock::now();
                const float dt  = std::chrono::duration<float>(now - lastTime).count();
                lastTime = now;

                {
                    std::lock_guard lock(g_stateMutex);

                    if (g_captureEnabled.load())
                        g_mapper.RefreshLeftStickFromKeyboard(g_gamepadState);

                    int16_t rx = 0, ry = 0;
                    g_mouseProc.Tick(dt, rx, ry);
                    g_gamepadState.thumbRX = rx;
                    g_gamepadState.thumbRY = ry;

                    vigem.UpdateState(g_gamepadState);
                }

                // Send telemetry to UI at ~250 Hz (every 4 ticks)
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
                    ipc.SendToAll(MsgType::GamepadState, gp.dump());
                }

                std::this_thread::sleep_until(lastTime + targetInterval);
            }
        });

        // ====================================================================
        // 5. RAW INPUT CAPTURE (runs on dedicated thread — non-blocking here)
        // ====================================================================

        std::cout << "[RawInput] Starting capture. Press F12 to toggle on/off.\n\n";

        auto& rawInput = RawInputHandler::Get();
        RawInputHandler::Config inputCfg;
        inputCfg.captureKeyboard = true;
        inputCfg.captureMouse    = true;
        inputCfg.backgroundCapture = true; // Required: message-only window never gets focus without RIDEV_INPUTSINK
        rawInput.SetConfig(inputCfg);

        rawInput.Start([&](const RawInputEvent& evt) -> bool {
            // F12 panic toggle — processed before capture-enabled check
            if (evt.type == RawInputType::KeyUp && evt.key.vkCode == VK_F12) {
                bool next = !g_captureEnabled.load();
                g_captureEnabled.store(next);
                std::cout << "[Capture] " << (next ? "ENABLED" : "DISABLED") << " (F12)\n";
                return false;
            }

            if (!g_captureEnabled.load()) return false;

            std::lock_guard lock(g_stateMutex);
            switch (evt.type) {
                case RawInputType::KeyDown:
                    return g_mapper.OnKeyEvent(evt.key.vkCode, true, g_gamepadState);

                case RawInputType::KeyUp:
                    return g_mapper.OnKeyEvent(evt.key.vkCode, false, g_gamepadState);

                case RawInputType::MouseMove:
                    g_mouseProc.AddDelta(
                        static_cast<float>(evt.mouse.deltaX),
                        static_cast<float>(evt.mouse.deltaY));
                    g_teleDeltaX.fetch_add(static_cast<int>(evt.mouse.deltaX));
                    g_teleDeltaY.fetch_add(static_cast<int>(evt.mouse.deltaY));
                    return false; // don't suppress — cursor must keep working

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
