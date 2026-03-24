// ViGEmManager.h
#pragma once
#include <Windows.h>
#include <ViGEm/Client.h>
#include <cstdint>
#include "GamepadState.h"

class ViGEmManager {
public:
    static ViGEmManager& Get();
    
    bool Connect();
    void Disconnect();
    void UpdateState(const GamepadState& state);
    bool IsConnected() const { return m_target != nullptr; }

private:
    ViGEmManager() = default;
    ~ViGEmManager() { Disconnect(); }

    PVIGEM_CLIENT m_client = nullptr;
    PVIGEM_TARGET m_target = nullptr;
    XUSB_REPORT   m_report{};
};