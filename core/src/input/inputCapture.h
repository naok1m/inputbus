#pragma once
#include <Windows.h>
#include <functional>
#include <atomic>

enum class InputEventType { KeyDown, KeyUp, MouseMove, MouseButton, MouseWheel };

struct InputEvent {
    InputEventType type;
    union {
        struct { DWORD vkCode; bool extended; } key;
        struct { long deltaX; long deltaY; } mouse;
        struct { int button; bool pressed; } mouseBtn;
        struct { int delta; } wheel;
    };
    DWORD timestamp;
};

using InputCallback = std::function<bool(const InputEvent&)>; // returns true = suppress

class InputCapture {
public:
    static InputCapture& Get();
    
    void Start(InputCallback cb);
    void Stop();
    bool IsRunning() const { return m_running; }

private:
    InputCapture() = default;
    
    static LRESULT CALLBACK LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam);
    static LRESULT CALLBACK LowLevelMouseProc(int nCode, WPARAM wParam, LPARAM lParam);
    void RegisterRawInput(HWND hwnd);
    
    HHOOK m_kbHook = nullptr;
    HHOOK m_mouseHook = nullptr;
    HWND  m_rawInputWnd = nullptr;
    bool  m_hasLastMousePos = false;
    long  m_lastMouseX = 0;
    long  m_lastMouseY = 0;
    InputCallback m_callback;
    std::atomic<bool> m_running{false};
    
    static InputCapture* s_instance;
};