#pragma once
#include <cstdint>
#include <string>

// Pipe name
constexpr wchar_t PIPE_NAME[] = L"\\\\.\\pipe\\rewsd_core";

enum class MsgType : uint32_t {
    // UI → Core
    LoadProfile     = 1,
    SetBinding      = 2,
    SetMouseConfig  = 3,
    GetStatus       = 4,
    SetActiveProfile= 5,
    SetCaptureEnabled = 6,
    
    // Core → UI
    StatusResponse  = 100,
    GamepadState    = 101,
    Error           = 200,
};

#pragma pack(push, 1)
struct MsgHeader {
    uint32_t magic   = 0x52455753; // "REWS"
    MsgType  type;
    uint32_t payloadLen;
};
#pragma pack(pop)

// All messages: MsgHeader + JSON payload (payloadLen bytes)