// RawInputHandler_v2.h
// Sistema de captura via Raw Input API (WM_INPUT) - substitui hooks com screen coordinates
#pragma once

#include <Windows.h>
#include <functional>
#include <atomic>
#include <thread>
#include <mutex>

// ============================================================================
// EVENTOS
// ============================================================================

enum class RawInputType {
    MouseMove,
    MouseButton,
    MouseWheel,
    KeyDown,
    KeyUp
};

struct RawInputEvent {
    RawInputType type;

    union {
        struct {
            long deltaX;
            long deltaY;
            bool isAbsolute; // Geralmente false para mouse
        } mouse;

        struct {
            int button;      // 0=LMB, 1=RMB, 2=MMB, 3/4=X1/X2
            bool pressed;
        } mouseBtn;

        struct {
            int delta;       // Múltiplos de WHEEL_DELTA (120)
        } wheel;

        struct {
            DWORD vkCode;
            DWORD scanCode;
            bool extended;
        } key;
    };

    DWORD timestamp;
};

using RawInputCallback = std::function<bool(const RawInputEvent&)>; // true = suppress

// ============================================================================
// HANDLER
// ============================================================================

class RawInputHandler {
public:
    static RawInputHandler& Get();

    // Inicia captura em thread dedicada (não-bloqueante)
    bool Start(RawInputCallback callback);

    // Para captura e cleanup
    void Stop();

    bool IsRunning() const { return m_running.load(); }

    // ========================================================================
    // CONFIGURAÇÃO
    // ========================================================================

    struct Config {
        bool captureKeyboard = true;
        bool captureMouse = true;

        // Flags RIDEV_* adicionais
        DWORD keyboardFlags = 0; // Ex: RIDEV_NOLEGACY para suprimir mensagens WM_KEY*
        DWORD mouseFlags = 0;    // Ex: RIDEV_NOLEGACY para suprimir WM_MOUSE*

        // Background capture (captura mesmo quando janela não tem foco)
        bool backgroundCapture = false;
    };

    void SetConfig(const Config& cfg);

private:
    RawInputHandler() = default;
    ~RawInputHandler();

    void ThreadMain();
    void RegisterDevices();
    void UnregisterDevices();

    LRESULT WindowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);
    static LRESULT CALLBACK StaticWindowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);

    void ProcessRawInput(HRAWINPUT hRawInput);
    void ProcessMouseInput(const RAWMOUSE& mouse);
    void ProcessKeyboardInput(const RAWKEYBOARD& kb);

    // ========================================================================
    // ESTADO
    // ========================================================================

    Config m_config;
    RawInputCallback m_callback;

    std::atomic<bool> m_running{false};
    std::thread m_thread;
    HWND m_hwnd = nullptr;

    mutable std::mutex m_mutex;

    static RawInputHandler* s_instance;
};
