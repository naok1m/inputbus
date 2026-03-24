#include "InputCapture.h"
#include <stdexcept>
#include <string>

InputCapture* InputCapture::s_instance = nullptr;

InputCapture& InputCapture::Get() {
    static InputCapture inst;
    s_instance = &inst;
    return inst;
}

void InputCapture::Start(InputCallback cb) {
    m_callback = std::move(cb);
    m_running = true;

    // Low-level hooks — runs on dedicated thread with message pump
    m_kbHook = SetWindowsHookExW(WH_KEYBOARD_LL, LowLevelKeyboardProc, GetModuleHandleW(nullptr), 0);
    m_mouseHook = SetWindowsHookExW(WH_MOUSE_LL, LowLevelMouseProc, GetModuleHandleW(nullptr), 0);

    if (!m_kbHook || !m_mouseHook) {
        const DWORD err = GetLastError();
        throw std::runtime_error("Failed to install hooks. GetLastError=" + std::to_string(static_cast<unsigned long>(err)));
    }

    // Message pump (blocks — run on dedicated thread)
    MSG msg;
    while (m_running && GetMessageW(&msg, nullptr, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
}

void InputCapture::Stop() {
    m_running = false;
    if (m_kbHook) { UnhookWindowsHookEx(m_kbHook); m_kbHook = nullptr; }
    if (m_mouseHook) { UnhookWindowsHookEx(m_mouseHook); m_mouseHook = nullptr; }
    PostThreadMessageW(GetCurrentThreadId(), WM_QUIT, 0, 0);
}

LRESULT CALLBACK InputCapture::LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode < 0 || !s_instance) return CallNextHookEx(nullptr, nCode, wParam, lParam);

    auto* kbdll = reinterpret_cast<KBDLLHOOKSTRUCT*>(lParam);
    
    // Skip injected events to avoid re-processing our own synthetic input
    if (kbdll->flags & LLKHF_INJECTED)
        return CallNextHookEx(nullptr, nCode, wParam, lParam);

    InputEvent evt{};
    evt.type = (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN) 
               ? InputEventType::KeyDown : InputEventType::KeyUp;
    evt.key.vkCode = kbdll->vkCode;
    evt.key.extended = (kbdll->flags & LLKHF_EXTENDED) != 0;
    evt.timestamp = kbdll->time;

    bool suppress = s_instance->m_callback(evt);
    return suppress ? 1 : CallNextHookEx(nullptr, nCode, wParam, lParam);
}

LRESULT CALLBACK InputCapture::LowLevelMouseProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode < 0 || !s_instance) return CallNextHookEx(nullptr, nCode, wParam, lParam);

    auto* msdll = reinterpret_cast<MSLLHOOKSTRUCT*>(lParam);
    
    if (msdll->flags & LLMHF_INJECTED)
        return CallNextHookEx(nullptr, nCode, wParam, lParam);

    InputEvent evt{};
    evt.timestamp = msdll->time;
    bool suppress = false;

    switch (wParam) {
        case WM_MOUSEMOVE:
            evt.type = InputEventType::MouseMove;
            if (!s_instance->m_hasLastMousePos) {
                s_instance->m_lastMouseX = msdll->pt.x;
                s_instance->m_lastMouseY = msdll->pt.y;
                s_instance->m_hasLastMousePos = true;
                evt.mouse.deltaX = 0;
                evt.mouse.deltaY = 0;
            } else {
                evt.mouse.deltaX = static_cast<long>(msdll->pt.x - s_instance->m_lastMouseX);
                evt.mouse.deltaY = static_cast<long>(msdll->pt.y - s_instance->m_lastMouseY);
                s_instance->m_lastMouseX = msdll->pt.x;
                s_instance->m_lastMouseY = msdll->pt.y;
            }
            suppress = s_instance->m_callback(evt);
            break;

        case WM_LBUTTONDOWN: case WM_LBUTTONUP:
            evt.type = InputEventType::MouseButton;
            evt.mouseBtn.button = 0;
            evt.mouseBtn.pressed = (wParam == WM_LBUTTONDOWN);
            suppress = s_instance->m_callback(evt);
            break;

        case WM_RBUTTONDOWN: case WM_RBUTTONUP:
            evt.type = InputEventType::MouseButton;
            evt.mouseBtn.button = 1;
            evt.mouseBtn.pressed = (wParam == WM_RBUTTONDOWN);
            suppress = s_instance->m_callback(evt);
            break;

        case WM_MBUTTONDOWN: case WM_MBUTTONUP:
            evt.type = InputEventType::MouseButton;
            evt.mouseBtn.button = 2;
            evt.mouseBtn.pressed = (wParam == WM_MBUTTONDOWN);
            suppress = s_instance->m_callback(evt);
            break;

        case WM_XBUTTONDOWN: case WM_XBUTTONUP: {
            evt.type = InputEventType::MouseButton;
            const WORD xButton = HIWORD(msdll->mouseData);
            evt.mouseBtn.button = (xButton == XBUTTON1) ? 3 : 4;
            evt.mouseBtn.pressed = (wParam == WM_XBUTTONDOWN);
            suppress = s_instance->m_callback(evt);
            break;
        }

        case WM_MOUSEWHEEL:
            evt.type = InputEventType::MouseWheel;
            evt.wheel.delta = GET_WHEEL_DELTA_WPARAM(msdll->mouseData);
            suppress = s_instance->m_callback(evt);
            break;
    }

    return suppress ? 1 : CallNextHookEx(nullptr, nCode, wParam, lParam);
}