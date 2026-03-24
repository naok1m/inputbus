// main.cpp
#include "input/InputCapture.h"
#include "mapping/MappingEngine.h"
#include "mapping/ProfileManager.h"
#include "vigem/MouseAnalogProcessor.h"
#include "vigem/ViGEmManager.h"
#include "ipc/PipeServer.h"
#include <thread>
#include <chrono>
#include <atomic>
#include <filesystem>
#include <mutex>
#include <iostream>
#include <nlohmann/json.hpp>

static GamepadState g_gamepadState{};
static MappingEngine g_mapper;
static MouseAnalogProcessor g_mouseProc;
static std::mutex g_stateMutex;
static std::atomic<bool> g_captureEnabled{false};
static int g_mouseDeltaX = 0;
static int g_mouseDeltaY = 0;

int main() {
    try {
    // 1. Connect ViGEmBus
    auto& vigem = ViGEmManager::Get();
    bool connected = false;
    for (int attempt = 1; attempt <= 10; ++attempt) {
        if (vigem.Connect()) {
            connected = true;
            break;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(300));
    }

    if (!connected) {
        OutputDebugStringW(L"ViGEmBus connection failed\n");
        return 1;
    }

    // 2. Load default profile
    ProfileManager profiles;
    profiles.Load("profiles/default.json", g_mapper, g_mouseProc);

    // 3. Start IPC server
    PipeServer ipc;
    ipc.Start([&](MsgType type, const std::string& payload, HANDLE) -> std::string {
        using json = nlohmann::json;
        std::lock_guard lock(g_stateMutex);

        auto loadProfileFromPayload = [&](const std::string& rawPayload) -> bool {
            try {
                auto j = json::parse(rawPayload);
                if (j.is_string()) {
                    const auto file = (std::filesystem::path("profiles") / j.get<std::string>()).string();
                    return profiles.Load(file, g_mapper, g_mouseProc);
                }
                if (j.is_object() && j.contains("profileFile")) {
                    const auto file = (std::filesystem::path("profiles") / j["profileFile"].get<std::string>()).string();
                    return profiles.Load(file, g_mapper, g_mouseProc);
                }
            } catch (...) {
                // Ignore parse issues here and fall back to direct JSON profile payload.
            }

            return profiles.LoadFromJson(rawPayload, g_mapper, g_mouseProc);
        };
        
        switch (type) {
            case MsgType::LoadProfile: {
                const bool ok = loadProfileFromPayload(payload);
                return ok ? R"({"ok":true})" : R"({"ok":false,"error":"invalid profile payload"})";
            }
            case MsgType::SetActiveProfile: {
                const bool ok = profiles.LoadFromJson(payload, g_mapper, g_mouseProc);
                return ok ? R"({"ok":true})" : R"({"ok":false,"error":"invalid active profile payload"})";
            }
            case MsgType::SetMouseConfig: {
                try {
                    auto j = json::parse(payload);
                    AnalogCurveConfig cfg{};
                    cfg.sensitivity = j.value("sensitivity", cfg.sensitivity);
                    cfg.exponent = j.value("exponent", cfg.exponent);
                    cfg.maxSpeed = j.value("maxSpeed", cfg.maxSpeed);
                    cfg.deadzone = j.value("deadzone", cfg.deadzone);
                    cfg.smoothSamples = j.value("smoothSamples", cfg.smoothSamples);
                    g_mouseProc.UpdateConfig(cfg);
                } catch (...) {
                    return R"({"ok":false,"error":"invalid mouse config"})";
                }
                return R"({"ok":true})";
            }
            case MsgType::GetStatus: {
                json j;
                j["connected"] = vigem.IsConnected();
                j["profile"] = profiles.CurrentName();
                j["captureEnabled"] = g_captureEnabled.load();
                return j.dump();
            }
            case MsgType::SetCaptureEnabled: {
                try {
                    bool enabled = false;
                    auto j = json::parse(payload);
                    if (j.is_boolean()) {
                        enabled = j.get<bool>();
                    } else if (j.is_object()) {
                        enabled = j.value("enabled", false);
                    } else {
                        return R"({"ok":false,"error":"invalid capture payload"})";
                    }

                    g_captureEnabled.store(enabled);
                    json out;
                    out["ok"] = true;
                    out["captureEnabled"] = enabled;
                    return out.dump();
                } catch (...) {
                    return R"({"ok":false,"error":"invalid capture payload"})";
                }
            }
            default:
                return R"({"error":"unknown"})";
        }
    });

    // 4. High-frequency update loop (1000Hz — gamepad polling standard)
    std::atomic<bool> running{true};
    auto updateThread = std::thread([&]() {
        using clock = std::chrono::steady_clock;
        auto next = clock::now();
        const auto interval = std::chrono::microseconds(1000); // 1ms = 1000Hz
        uint32_t tickCounter = 0;

        while (running) {
            {
                std::lock_guard lock(g_stateMutex);

                if (g_captureEnabled.load()) {
                    g_mapper.RefreshLeftStickFromKeyboard(g_gamepadState);
                }
                
                int16_t rx, ry;
                g_mouseProc.Tick(0.001f, rx, ry);
                g_gamepadState.thumbRX = rx;
                g_gamepadState.thumbRY = ry;

                vigem.UpdateState(g_gamepadState);

                // Envia preview updates a cada 4 ticks (~250Hz)
                tickCounter += 1;
                if (tickCounter % 4 == 0) {
                    using json = nlohmann::json;
                    json gp;
                    gp["buttons"] = g_gamepadState.buttons;
                    gp["leftTrigger"] = g_gamepadState.leftTrigger;
                    gp["rightTrigger"] = g_gamepadState.rightTrigger;
                    gp["thumbLX"] = g_gamepadState.thumbLX;
                    gp["thumbLY"] = g_gamepadState.thumbLY;
                    gp["thumbRX"] = g_gamepadState.thumbRX;
                    gp["thumbRY"] = g_gamepadState.thumbRY;
                    gp["mouseDeltaX"] = g_mouseDeltaX;
                    gp["mouseDeltaY"] = g_mouseDeltaY;
                    ipc.SendToAll(MsgType::GamepadState, gp.dump());

                    // Keep this as latest-frame telemetry so UI can show live movement.
                    g_mouseDeltaX = 0;
                    g_mouseDeltaY = 0;
                }
            }

            next += interval;
            std::this_thread::sleep_until(next);
        }
    });

    // 5. Input capture (blocks — runs message pump on this thread)
    auto& capture = InputCapture::Get();
    capture.Start([&](const InputEvent& evt) -> bool {
        std::lock_guard lock(g_stateMutex);

        // F12 is a panic toggle to prevent accidental desktop lockout.
        if (evt.type == InputEventType::KeyUp && evt.key.vkCode == 123) {
            const bool next = !g_captureEnabled.load();
            g_captureEnabled.store(next);
            return false;
        }

        if (!g_captureEnabled.load()) {
            return false;
        }

        switch (evt.type) {
            case InputEventType::KeyDown:
                return g_mapper.OnKeyEvent(evt.key.vkCode, true, g_gamepadState);

            case InputEventType::KeyUp:
                return g_mapper.OnKeyEvent(evt.key.vkCode, false, g_gamepadState);

            case InputEventType::MouseMove:
                g_mouseProc.AddDelta(evt.mouse.deltaX, evt.mouse.deltaY);
                g_mouseDeltaX += static_cast<int>(evt.mouse.deltaX);
                g_mouseDeltaY += static_cast<int>(evt.mouse.deltaY);
                // Do not suppress move events; suppressing can freeze cursor and kill delta flow.
                return false;

            case InputEventType::MouseButton:
                return g_mapper.OnMouseButton(evt.mouseBtn.button, evt.mouseBtn.pressed, g_gamepadState);

            default: return false;
        }
    });

    running = false;
    updateThread.join();
    vigem.Disconnect();
    return 0;
    } catch (const std::exception& ex) {
        std::cerr << "[core] Fatal: " << ex.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "[core] Fatal: unknown exception" << std::endl;
        return 1;
    }
}