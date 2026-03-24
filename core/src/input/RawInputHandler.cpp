#include "RawInputHandler.h"
#include <hidusage.h>

void RawInputHandler::Register(HWND hwnd) {
    RAWINPUTDEVICE rid{};
    rid.usUsagePage = HID_USAGE_PAGE_GENERIC;
    rid.usUsage     = HID_USAGE_GENERIC_MOUSE;
    rid.dwFlags     = RIDEV_INPUTSINK; // capture even when not focused
    rid.hwndTarget  = hwnd;
    RegisterRawInputDevices(&rid, 1, sizeof(rid));
}

void RawInputHandler::Process(LPARAM lParam, MouseDeltaCallback cb) {
    UINT size = 0;
    GetRawInputData(reinterpret_cast<HRAWINPUT>(lParam), RID_INPUT, 
                    nullptr, &size, sizeof(RAWINPUTHEADER));
    
    std::vector<BYTE> buf(size);
    GetRawInputData(reinterpret_cast<HRAWINPUT>(lParam), RID_INPUT,
                    buf.data(), &size, sizeof(RAWINPUTHEADER));

    auto* raw = reinterpret_cast<RAWINPUT*>(buf.data());
    if (raw->header.dwType != RIM_TYPEMOUSE) return;

    if (raw->data.mouse.usFlags & MOUSE_MOVE_ABSOLUTE) return; // ignore absolute (touch, tablet)

    long dx = raw->data.mouse.lLastX;
    long dy = raw->data.mouse.lLastY;
    
    if (dx != 0 || dy != 0) cb(dx, dy);
}