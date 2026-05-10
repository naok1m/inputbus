// ViGEmManager.h
#pragma once
#include <Windows.h>
#include <ViGEm/Client.h>
#include <cstdint>
#include "GamepadState.h"

enum class VirtualControllerType {
    Xbox360,
    DualShock4,
};

class ViGEmManager {
public:
    static ViGEmManager& Get();
    
    bool Connect();
    void Disconnect();
    bool SetControllerType(VirtualControllerType type);
    void UpdateState(const GamepadState& state);
    bool IsConnected() const { return m_target != nullptr; }

private:
    ViGEmManager() = default;
    ~ViGEmManager() { Disconnect(); }

    bool AddTarget();
    void RemoveTarget();

    PVIGEM_CLIENT m_client = nullptr;
    PVIGEM_TARGET m_target = nullptr;
    XUSB_REPORT   m_report{};
    DS4_REPORT    m_ds4Report{};
    VirtualControllerType m_type = VirtualControllerType::Xbox360;
};
