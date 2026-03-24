// RawInputHandler_v2.cpp
#include "RawInputHandler_v2.h"
#include <stdexcept>
#include <vector>
#include <iostream>

RawInputHandler* RawInputHandler::s_instance = nullptr;

namespace {
    constexpr wchar_t WINDOW_CLASS_NAME[] = L"InputBus_RawInputWindow";
}

// ============================================================================
// SINGLETON
// ============================================================================

RawInputHandler& RawInputHandler::Get() {
    static RawInputHandler instance;
    s_instance = &instance;
    return instance;
}

RawInputHandler::~RawInputHandler() {
    Stop();
}

// ============================================================================
// START / STOP
// ============================================================================

bool RawInputHandler::Start(RawInputCallback callback) {
    std::lock_guard lock(m_mutex);

    if (m_running.load()) {
        return false; // Já está rodando
    }

    m_callback = std::move(callback);
    m_running.store(true);

    // Cria thread dedicada para message pump
    m_thread = std::thread(&RawInputHandler::ThreadMain, this);

    return true;
}

void RawInputHandler::Stop() {
    if (!m_running.load()) return;

    m_running.store(false);

    // Sinaliza thread para terminar
    if (m_hwnd) {
        PostMessageW(m_hwnd, WM_QUIT, 0, 0);
    }

    if (m_thread.joinable()) {
        m_thread.join();
    }

    std::lock_guard lock(m_mutex);
    UnregisterDevices();
}

void RawInputHandler::SetConfig(const Config& cfg) {
    std::lock_guard lock(m_mutex);
    m_config = cfg;

    if (m_running.load() && m_hwnd) {
        RegisterDevices();
    }
}

// ============================================================================
// THREAD PRINCIPAL
// ============================================================================

void RawInputHandler::ThreadMain() {
    // 1. Registra classe de janela
    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = StaticWindowProc;
    wc.hInstance = GetModuleHandleW(nullptr);
    wc.lpszClassName = WINDOW_CLASS_NAME;

    if (!RegisterClassExW(&wc)) {
        DWORD err = GetLastError();
        if (err != ERROR_CLASS_ALREADY_EXISTS) {
            std::cerr << "[RawInput] RegisterClassEx falhou: " << err << std::endl;
            m_running.store(false);
            return;
        }
    }

    // 2. Cria janela message-only
    m_hwnd = CreateWindowExW(
        0,
        WINDOW_CLASS_NAME,
        L"InputBus RawInput",
        0,
        0, 0, 0, 0,
        HWND_MESSAGE, // Message-only window
        nullptr,
        GetModuleHandleW(nullptr),
        this // lParam para WM_CREATE
    );

    if (!m_hwnd) {
        std::cerr << "[RawInput] CreateWindowEx falhou: " << GetLastError() << std::endl;
        m_running.store(false);
        return;
    }

    // 3. Registra dispositivos Raw Input
    RegisterDevices();

    std::cout << "[RawInput] Iniciado com sucesso (HWND=" << m_hwnd << ")" << std::endl;

    // 4. Message pump
    MSG msg;
    while (m_running.load() && GetMessageW(&msg, nullptr, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    // 5. Cleanup
    UnregisterDevices();

    if (m_hwnd) {
        DestroyWindow(m_hwnd);
        m_hwnd = nullptr;
    }

    UnregisterClassW(WINDOW_CLASS_NAME, GetModuleHandleW(nullptr));

    std::cout << "[RawInput] Parado" << std::endl;
}

// ============================================================================
// REGISTRO DE DISPOSITIVOS
// ============================================================================

void RawInputHandler::RegisterDevices() {
    std::vector<RAWINPUTDEVICE> devices;

    // Keyboard
    if (m_config.captureKeyboard) {
        RAWINPUTDEVICE kb{};
        kb.usUsagePage = 0x01; // HID_USAGE_PAGE_GENERIC
        kb.usUsage = 0x06;     // HID_USAGE_GENERIC_KEYBOARD
        kb.dwFlags = m_config.keyboardFlags;

        if (m_config.backgroundCapture) {
            kb.dwFlags |= RIDEV_INPUTSINK;
        }

        kb.hwndTarget = m_hwnd;
        devices.push_back(kb);
    }

    // Mouse
    if (m_config.captureMouse) {
        RAWINPUTDEVICE mouse{};
        mouse.usUsagePage = 0x01; // HID_USAGE_PAGE_GENERIC
        mouse.usUsage = 0x02;     // HID_USAGE_GENERIC_MOUSE
        mouse.dwFlags = m_config.mouseFlags;

        if (m_config.backgroundCapture) {
            mouse.dwFlags |= RIDEV_INPUTSINK;
        }

        mouse.hwndTarget = m_hwnd;
        devices.push_back(mouse);
    }

    if (devices.empty()) {
        std::cerr << "[RawInput] Nenhum dispositivo para registrar" << std::endl;
        return;
    }

    if (!RegisterRawInputDevices(devices.data(), static_cast<UINT>(devices.size()), sizeof(RAWINPUTDEVICE))) {
        std::cerr << "[RawInput] RegisterRawInputDevices falhou: " << GetLastError() << std::endl;
    } else {
        std::cout << "[RawInput] Dispositivos registrados: " << devices.size() << std::endl;
    }
}

void RawInputHandler::UnregisterDevices() {
    std::vector<RAWINPUTDEVICE> devices;

    if (m_config.captureKeyboard) {
        RAWINPUTDEVICE kb{};
        kb.usUsagePage = 0x01;
        kb.usUsage = 0x06;
        kb.dwFlags = RIDEV_REMOVE;
        kb.hwndTarget = nullptr;
        devices.push_back(kb);
    }

    if (m_config.captureMouse) {
        RAWINPUTDEVICE mouse{};
        mouse.usUsagePage = 0x01;
        mouse.usUsage = 0x02;
        mouse.dwFlags = RIDEV_REMOVE;
        mouse.hwndTarget = nullptr;
        devices.push_back(mouse);
    }

    if (!devices.empty()) {
        RegisterRawInputDevices(devices.data(), static_cast<UINT>(devices.size()), sizeof(RAWINPUTDEVICE));
    }
}

// ============================================================================
// WINDOW PROC
// ============================================================================

LRESULT CALLBACK RawInputHandler::StaticWindowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    RawInputHandler* handler = nullptr;

    if (msg == WM_CREATE) {
        auto* cs = reinterpret_cast<CREATESTRUCTW*>(lParam);
        handler = static_cast<RawInputHandler*>(cs->lpCreateParams);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(handler));
    } else {
        handler = reinterpret_cast<RawInputHandler*>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    }

    if (handler) {
        return handler->WindowProc(hwnd, msg, wParam, lParam);
    }

    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

LRESULT RawInputHandler::WindowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
        case WM_INPUT: {
            ProcessRawInput(reinterpret_cast<HRAWINPUT>(lParam));
            return 0;
        }

        case WM_DESTROY:
            PostQuitMessage(0);
            return 0;

        default:
            return DefWindowProcW(hwnd, msg, wParam, lParam);
    }
}

// ============================================================================
// PROCESSAMENTO DE RAW INPUT
// ============================================================================

void RawInputHandler::ProcessRawInput(HRAWINPUT hRawInput) {
    // 1. Obtém tamanho necessário
    UINT size = 0;
    GetRawInputData(hRawInput, RID_INPUT, nullptr, &size, sizeof(RAWINPUTHEADER));

    if (size == 0) return;

    // 2. Aloca buffer e lê dados
    std::vector<BYTE> buffer(size);
    UINT result = GetRawInputData(hRawInput, RID_INPUT, buffer.data(), &size, sizeof(RAWINPUTHEADER));

    if (result == static_cast<UINT>(-1)) {
        std::cerr << "[RawInput] GetRawInputData falhou: " << GetLastError() << std::endl;
        return;
    }

    auto* raw = reinterpret_cast<RAWINPUT*>(buffer.data());

    // 3. Processa conforme tipo
    switch (raw->header.dwType) {
        case RIM_TYPEMOUSE:
            ProcessMouseInput(raw->data.mouse);
            break;

        case RIM_TYPEKEYBOARD:
            ProcessKeyboardInput(raw->data.keyboard);
            break;

        default:
            break;
    }
}

void RawInputHandler::ProcessMouseInput(const RAWMOUSE& mouse) {
    if (!m_callback) return;

    RawInputEvent evt{};
    evt.timestamp = GetTickCount();

    // ========================================================================
    // MOVIMENTO
    // ========================================================================

    if ((mouse.usFlags & MOUSE_MOVE_ABSOLUTE) == 0) {
        // MOVIMENTO RELATIVO (o que queremos para FPS)
        if (mouse.lLastX != 0 || mouse.lLastY != 0) {
            evt.type = RawInputType::MouseMove;
            evt.mouse.deltaX = mouse.lLastX;
            evt.mouse.deltaY = mouse.lLastY;
            evt.mouse.isAbsolute = false;
            m_callback(evt); // Não suprime movimento
        }
    } else {
        // Movimento absoluto (tablets, etc.) - podemos suportar se necessário
        evt.type = RawInputType::MouseMove;
        evt.mouse.deltaX = mouse.lLastX;
        evt.mouse.deltaY = mouse.lLastY;
        evt.mouse.isAbsolute = true;
        m_callback(evt);
    }

    // ========================================================================
    // BOTÕES
    // ========================================================================

    const USHORT btnFlags = mouse.usButtonFlags;

    auto sendButton = [&](int btn, bool pressed) {
        evt.type = RawInputType::MouseButton;
        evt.mouseBtn.button = btn;
        evt.mouseBtn.pressed = pressed;
        m_callback(evt);
    };

    if (btnFlags & RI_MOUSE_LEFT_BUTTON_DOWN)   sendButton(0, true);
    if (btnFlags & RI_MOUSE_LEFT_BUTTON_UP)     sendButton(0, false);
    if (btnFlags & RI_MOUSE_RIGHT_BUTTON_DOWN)  sendButton(1, true);
    if (btnFlags & RI_MOUSE_RIGHT_BUTTON_UP)    sendButton(1, false);
    if (btnFlags & RI_MOUSE_MIDDLE_BUTTON_DOWN) sendButton(2, true);
    if (btnFlags & RI_MOUSE_MIDDLE_BUTTON_UP)   sendButton(2, false);
    if (btnFlags & RI_MOUSE_BUTTON_4_DOWN)      sendButton(3, true);
    if (btnFlags & RI_MOUSE_BUTTON_4_UP)        sendButton(3, false);
    if (btnFlags & RI_MOUSE_BUTTON_5_DOWN)      sendButton(4, true);
    if (btnFlags & RI_MOUSE_BUTTON_5_UP)        sendButton(4, false);

    // ========================================================================
    // WHEEL
    // ========================================================================

    if (btnFlags & RI_MOUSE_WHEEL) {
        evt.type = RawInputType::MouseWheel;
        evt.wheel.delta = static_cast<SHORT>(mouse.usButtonData);
        m_callback(evt);
    }
}

void RawInputHandler::ProcessKeyboardInput(const RAWKEYBOARD& kb) {
    if (!m_callback) return;

    // Ignora teclas "fake" (prefixo E0/E1)
    if (kb.VKey == 0xFF) return;

    RawInputEvent evt{};
    evt.timestamp = GetTickCount();
    evt.type = (kb.Flags & RI_KEY_BREAK) ? RawInputType::KeyUp : RawInputType::KeyDown;
    evt.key.vkCode = kb.VKey;
    evt.key.scanCode = kb.MakeCode;
    evt.key.extended = (kb.Flags & RI_KEY_E0) || (kb.Flags & RI_KEY_E1);

    m_callback(evt);
}
