#pragma once

#include <Windows.h>
#include "../vigem/MouseCameraProcessor.h"

class NativeMouseInputService {
public:
    static constexpr ULONG_PTR INPUTBUS_MOUSE_EXTRA_INFO = 0x49424D43; // "IBMC"

    void SendMouse(const MouseDelta& delta) const;
};
