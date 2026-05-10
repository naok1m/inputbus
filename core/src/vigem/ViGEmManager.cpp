// ViGEmManager.cpp
#include "ViGEmManager.h"
#include <ViGEm/Util.h>
#include <stdexcept>
#include <iostream>

ViGEmManager& ViGEmManager::Get() {
    static ViGEmManager inst;
    return inst;
}

bool ViGEmManager::Connect() {
    if (m_client && m_target) return true;

    m_client = vigem_alloc();
    if (!m_client) {
        std::cerr << "[ViGEm] vigem_alloc falhou" << std::endl;
        return false;
    }

    auto err = vigem_connect(m_client);
    if (!VIGEM_SUCCESS(err)) {
        std::cerr << "[ViGEm] vigem_connect falhou, erro=" << static_cast<int>(err) << std::endl;
        vigem_free(m_client);
        m_client = nullptr;
        return false;
    }

    if (!AddTarget()) {
        vigem_disconnect(m_client);
        vigem_free(m_client);
        m_client = nullptr;
        return false;
    }

    std::cerr << "[ViGEm] Conectado com sucesso" << std::endl;
    return true;
}

void ViGEmManager::Disconnect() {
    RemoveTarget();
    if (m_client) {
        vigem_disconnect(m_client);
        vigem_free(m_client);
        m_client = nullptr;
    }
}

bool ViGEmManager::SetControllerType(VirtualControllerType type) {
    if (m_type == type) return true;

    m_type = type;
    if (!m_client) return true;

    RemoveTarget();
    return AddTarget();
}

bool ViGEmManager::AddTarget() {
    if (!m_client) return false;

    if (m_type == VirtualControllerType::DualShock4) {
        m_target = vigem_target_ds4_alloc();
        if (!m_target) {
            std::cerr << "[ViGEm] vigem_target_ds4_alloc falhou" << std::endl;
            return false;
        }
    } else {
        m_target = vigem_target_x360_alloc();
        if (!m_target) {
            std::cerr << "[ViGEm] vigem_target_x360_alloc falhou" << std::endl;
            return false;
        }
    }

    const auto err = vigem_target_add(m_client, m_target);
    if (!VIGEM_SUCCESS(err)) {
        std::cerr << "[ViGEm] vigem_target_add falhou, erro=" << static_cast<int>(err) << std::endl;
        vigem_target_free(m_target);
        m_target = nullptr;
        return false;
    }

    XUSB_REPORT_INIT(&m_report);
    DS4_REPORT_INIT(&m_ds4Report);
    std::cerr << "[ViGEm] Target ativo: "
              << (m_type == VirtualControllerType::DualShock4 ? "DualShock 4" : "Xbox 360")
              << std::endl;
    return true;
}

void ViGEmManager::RemoveTarget() {
    if (m_target) {
        vigem_target_remove(m_client, m_target);
        vigem_target_free(m_target);
        m_target = nullptr;
    }
}

void ViGEmManager::UpdateState(const GamepadState& state) {
    if (!m_target) return;

    m_report.wButtons     = state.buttons;
    m_report.bLeftTrigger  = state.leftTrigger;
    m_report.bRightTrigger = state.rightTrigger;
    m_report.sThumbLX      = state.thumbLX;
    m_report.sThumbLY      = state.thumbLY;
    m_report.sThumbRX      = state.thumbRX;
    m_report.sThumbRY      = state.thumbRY;

    VIGEM_ERROR err;
    if (m_type == VirtualControllerType::DualShock4) {
        DS4_REPORT_INIT(&m_ds4Report);
        XUSB_TO_DS4_REPORT(&m_report, &m_ds4Report);
        err = vigem_target_ds4_update(m_client, m_target, m_ds4Report);
    } else {
        err = vigem_target_x360_update(m_client, m_target, m_report);
    }

    if (!VIGEM_SUCCESS(err)) {
        std::cerr << "[ViGEm] update falhou, erro=" << static_cast<int>(err) << std::endl;
    }
}
