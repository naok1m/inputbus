// main_v2.cpp
// Refatoração completa: loop de alta frequência com Raw Input e estado contínuo
#include "input/RawInputHandler_v2.h"
#include "mapping/MappingEngine.h"
#include "mapping/ProfileManager.h"
#include "vigem/MouseAnalogProcessor_v2.h"
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
// ESTADO GLOBAL (THREAD-SAFE)
// ============================================================================

static GamepadState g_gamepadState{};
static MappingEngine g_mapper;
static MouseAnalogProcessor g_mouseProc;
static std::mutex g_stateMutex;
static std::atomic<bool> g_captureEnabled{false};

// Telemetria para UI
static std::atomic<int> g_telemetryDeltaX{0};
static std::atomic<int> g_telemetryDeltaY{0};

// ============================================================================
// ENTRADA PRINCIPAL
// ============================================================================

int main() {
    try {
        std::cout << "==========================================================\n";
        std::cout << "  InputBus v2.0 - Mouse-to-Analog Refactored System\n";
        std::cout << "==========================================================\n\n";

        // ====================================================================
        // 1. CONECTA VIGEMBUS
        // ====================================================================

        std::cout << "[ViGEm] Conectando ao ViGEmBus...\n";
        auto& vigem = ViGEmManager::Get();
        bool connected = false;

        for (int attempt = 1; attempt <= 10; ++attempt) {
            if (vigem.Connect()) {
                connected = true;
                std::cout << "[ViGEm] Conectado com sucesso!\n";
                break;
            }
            std::cout << "[ViGEm] Tentativa " << attempt << "/10 falhou, aguardando...\n";
            std::this_thread::sleep_for(std::chrono::milliseconds(300));
        }

        if (!connected) {
            std::cerr << "[ViGEm] ERRO: Não foi possível conectar ao ViGEmBus.\n";
            std::cerr << "         Certifique-se de que o driver ViGEmBus está instalado.\n";
            return 1;
        }

        // ====================================================================
        // 2. CARREGA PERFIL DEFAULT
        // ====================================================================

        std::cout << "[Profile] Carregando perfil padrão...\n";
        ProfileManager profiles;

        if (profiles.Load("profiles/default.json", g_mapper, g_mouseProc)) {
            std::cout << "[Profile] Perfil carregado: " << profiles.CurrentName() << "\n";
        } else {
            std::cerr << "[Profile] AVISO: Não foi possível carregar perfil default, usando configuração padrão.\n";
        }

        // ====================================================================
        // 3. INICIA SERVIDOR IPC (COMUNICAÇÃO COM UI)
        // ====================================================================

        std::cout << "[IPC] Iniciando servidor de comunicação...\n";
        PipeServer ipc;

        ipc.Start([&](MsgType type, const std::string& payload, HANDLE) -> std::string {
            using json = nlohmann::json;
            std::lock_guard lock(g_stateMutex);

            switch (type) {
                case MsgType::LoadProfile: {
                    try {
                        auto j = json::parse(payload);
                        std::string file;

                        if (j.is_string()) {
                            file = (std::filesystem::path("profiles") / j.get<std::string>()).string();
                        } else if (j.is_object() && j.contains("profileFile")) {
                            file = (std::filesystem::path("profiles") / j["profileFile"].get<std::string>()).string();
                        }

                        if (!file.empty() && profiles.Load(file, g_mapper, g_mouseProc)) {
                            return R"({"ok":true})";
                        }

                        // Fallback: tenta carregar payload direto como JSON
                        if (profiles.LoadFromJson(payload, g_mapper, g_mouseProc)) {
                            return R"({"ok":true})";
                        }
                    } catch (...) {}
                    return R"({"ok":false,"error":"invalid profile"})";
                }

                case MsgType::SetMouseConfig: {
                    try {
                        auto j = json::parse(payload);
                        AnalogCurveConfig cfg{};

                        // Carrega valores (mantém default se não existir no payload)
                        if (j.contains("sensitivityX")) cfg.sensitivityX = j["sensitivityX"];
                        if (j.contains("sensitivityY")) cfg.sensitivityY = j["sensitivityY"];
                        if (j.contains("sensitivity")) {
                            // Fallback: se só tiver "sensitivity", aplica em X e Y
                            float s = j["sensitivity"];
                            cfg.sensitivityX = cfg.sensitivityY = s;
                        }
                        if (j.contains("exponent")) cfg.exponent = j["exponent"];
                        if (j.contains("maxSpeed")) cfg.maxSpeed = j["maxSpeed"];
                        if (j.contains("deadzone")) cfg.deadzone = j["deadzone"];
                        if (j.contains("smoothSamples")) cfg.smoothSamples = j["smoothSamples"];
                        if (j.contains("smoothFactor")) cfg.smoothFactor = j["smoothFactor"];
                        if (j.contains("jitterThreshold")) cfg.jitterThreshold = j["jitterThreshold"];
                        if (j.contains("decayDelay")) cfg.decayDelay = j["decayDelay"];
                        if (j.contains("decayRate")) cfg.decayRate = j["decayRate"];
                        if (j.contains("acceleration")) cfg.acceleration = j["acceleration"];
                        if (j.contains("deceleration")) cfg.deceleration = j["deceleration"];

                        g_mouseProc.UpdateConfig(cfg);
                        return R"({"ok":true})";
                    } catch (...) {
                        return R"({"ok":false,"error":"invalid mouse config"})";
                    }
                }

                case MsgType::GetStatus: {
                    json j;
                    j["connected"] = vigem.IsConnected();
                    j["profile"] = profiles.CurrentName();
                    j["captureEnabled"] = g_captureEnabled.load();

                    // Debug info
                    auto debug = g_mouseProc.GetDebugState();
                    j["debug"]["velocityX"] = debug.velocityX;
                    j["debug"]["velocityY"] = debug.velocityY;
                    j["debug"]["magnitude"] = debug.magnitude;
                    j["debug"]["idleTime"] = debug.timeSinceLastInput;

                    return j.dump();
                }

                case MsgType::SetCaptureEnabled: {
                    try {
                        auto j = json::parse(payload);
                        bool enabled = j.is_boolean() ? j.get<bool>() : j.value("enabled", false);

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
                    return R"({"error":"unknown command"})";
            }
        });

        std::cout << "[IPC] Servidor iniciado.\n";

        // ====================================================================
        // 4. LOOP DE ATUALIZAÇÃO DE ALTA FREQUÊNCIA (1000Hz)
        // ====================================================================

        std::cout << "[Update] Iniciando loop de atualização a 1000Hz...\n";
        std::atomic<bool> running{true};

        auto updateThread = std::thread([&]() {
            using Clock = std::chrono::steady_clock;
            using Microseconds = std::chrono::microseconds;

            auto lastTime = Clock::now();
            const Microseconds targetInterval(1000); // 1ms = 1000Hz
            uint64_t tickCounter = 0;

            while (running.load()) {
                auto currentTime = Clock::now();
                auto elapsed = std::chrono::duration_cast<std::chrono::duration<float>>(currentTime - lastTime);
                float deltaTime = elapsed.count(); // em SEGUNDOS
                lastTime = currentTime;

                // Protege estado compartilhado
                {
                    std::lock_guard lock(g_stateMutex);

                    // Atualiza keyboard → left stick (se habilitado)
                    if (g_captureEnabled.load()) {
                        g_mapper.RefreshLeftStickFromKeyboard(g_gamepadState);
                    }

                    // Atualiza mouse → right stick (SEMPRE processa, mesmo se capture disabled)
                    // Isso garante que decay funcione corretamente
                    int16_t rx = 0, ry = 0;
                    g_mouseProc.Tick(deltaTime, rx, ry);

                    g_gamepadState.thumbRX = rx;
                    g_gamepadState.thumbRY = ry;

                    // Envia para ViGEm
                    vigem.UpdateState(g_gamepadState);
                }

                // Telemetria para UI (cada 4 ticks = ~250Hz)
                tickCounter++;
                if (tickCounter % 4 == 0) {
                    std::lock_guard lock(g_stateMutex);

                    using json = nlohmann::json;
                    json gp;
                    gp["buttons"] = g_gamepadState.buttons;
                    gp["leftTrigger"] = g_gamepadState.leftTrigger;
                    gp["rightTrigger"] = g_gamepadState.rightTrigger;
                    gp["thumbLX"] = g_gamepadState.thumbLX;
                    gp["thumbLY"] = g_gamepadState.thumbLY;
                    gp["thumbRX"] = g_gamepadState.thumbRX;
                    gp["thumbRY"] = g_gamepadState.thumbRY;
                    gp["mouseDeltaX"] = g_telemetryDeltaX.exchange(0);
                    gp["mouseDeltaY"] = g_telemetryDeltaY.exchange(0);

                    ipc.SendToAll(MsgType::GamepadState, gp.dump());
                }

                // Sleep até próximo tick (high-resolution)
                auto nextTime = lastTime + targetInterval;
                std::this_thread::sleep_until(nextTime);
            }

            std::cout << "[Update] Loop de atualização finalizado.\n";
        });

        // ====================================================================
        // 5. CAPTURA DE INPUT VIA RAW INPUT API
        // ====================================================================

        std::cout << "[RawInput] Iniciando captura de input...\n";
        std::cout << "           Pressione F12 para habilitar/desabilitar captura.\n\n";

        auto& rawInput = RawInputHandler::Get();

        RawInputHandler::Config inputCfg;
        inputCfg.captureKeyboard = true;
        inputCfg.captureMouse = true;
        inputCfg.backgroundCapture = false; // Captura apenas com foco (segurança)
        // NÃO usa RIDEV_NOLEGACY para manter compatibilidade com sistema operacional
        rawInput.SetConfig(inputCfg);

        rawInput.Start([&](const RawInputEvent& evt) -> bool {
            std::lock_guard lock(g_stateMutex);

            // ================================================================
            // TECLA PANIC: F12 (VK_F12 = 0x7B = 123)
            // ================================================================
            if (evt.type == RawInputType::KeyUp && evt.key.vkCode == 0x7B) {
                bool next = !g_captureEnabled.load();
                g_captureEnabled.store(next);
                std::cout << "[Capture] " << (next ? "ATIVADO" : "DESATIVADO") << " (F12)\n";
                return false; // Não suprime F12
            }

            // Se captura desabilitada, não processa input
            if (!g_captureEnabled.load()) {
                return false;
            }

            // ================================================================
            // PROCESSAMENTO DE INPUT
            // ================================================================

            switch (evt.type) {
                case RawInputType::KeyDown:
                    return g_mapper.OnKeyEvent(evt.key.vkCode, true, g_gamepadState);

                case RawInputType::KeyUp:
                    return g_mapper.OnKeyEvent(evt.key.vkCode, false, g_gamepadState);

                case RawInputType::MouseMove: {
                    // RAW INPUT: delta relativo puro (não limitado por tela)
                    g_mouseProc.AddDelta(static_cast<float>(evt.mouse.deltaX),
                                         static_cast<float>(evt.mouse.deltaY));

                    // Telemetria
                    g_telemetryDeltaX.fetch_add(static_cast<int>(evt.mouse.deltaX));
                    g_telemetryDeltaY.fetch_add(static_cast<int>(evt.mouse.deltaY));

                    // NÃO suprime movimento (para manter cursor funcional)
                    return false;
                }

                case RawInputType::MouseButton:
                    return g_mapper.OnMouseButton(evt.mouseBtn.button, evt.mouseBtn.pressed, g_gamepadState);

                case RawInputType::MouseWheel:
                    // TODO: implementar mapeamento de wheel se necessário
                    return false;

                default:
                    return false;
            }
        });

        // Bloqueia thread principal (RawInputHandler roda em sua própria thread)
        std::cout << "[Main] Sistema operacional. Pressione Ctrl+C para sair.\n";
        std::cout << "==========================================================\n\n";

        // Aguarda sinal de término (Ctrl+C, etc.)
        // Em produção, você implementaria um handler de sinal aqui
        while (running.load()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(100));

            // Pode adicionar lógica para detectar Ctrl+C ou comando de UI para parar
            // Por enquanto, roda indefinidamente até término forçado
        }

        // ====================================================================
        // 6. CLEANUP
        // ====================================================================

        std::cout << "\n[Main] Encerrando...\n";

        running.store(false);
        rawInput.Stop();
        updateThread.join();
        vigem.Disconnect();

        std::cout << "[Main] Finalizado com sucesso.\n";
        return 0;

    } catch (const std::exception& ex) {
        std::cerr << "\n[ERRO FATAL] " << ex.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "\n[ERRO FATAL] Exceção desconhecida" << std::endl;
        return 1;
    }
}
