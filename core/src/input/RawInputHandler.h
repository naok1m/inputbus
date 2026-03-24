#pragma once

#include <Windows.h>
#include <functional>
#include <vector>

class RawInputHandler {
public:
    using MouseDeltaCallback = std::function<void(long, long)>;

    static void Register(HWND hwnd);
    static void Process(LPARAM lParam, MouseDeltaCallback cb);
};
