#include "NativeMouseInputService.h"

void NativeMouseInputService::SendMouse(const MouseDelta& delta) const {
    if (delta.IsZero()) return;

    INPUT input{};
    input.type = INPUT_MOUSE;
    input.mi.dx = delta.dx;
    input.mi.dy = delta.dy;
    input.mi.dwFlags = MOUSEEVENTF_MOVE;
    input.mi.dwExtraInfo = INPUTBUS_MOUSE_EXTRA_INFO;

    SendInput(1, &input, sizeof(INPUT));
}
