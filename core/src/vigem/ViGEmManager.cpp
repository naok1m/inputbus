// ViGEmManager.cpp
#include "ViGEmManager.h"
#include <stdexcept>
#include <iostream>

ViGEmManager& ViGEmManager::Get() {
    static ViGEmManager inst;
    return inst;
}

bool ViGEmManager::Connect() {
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

    m_target = vigem_target_x360_alloc();
    if (!m_target) {
        std::cerr << "[ViGEm] vigem_target_x360_alloc falhou" << std::endl;
        vigem_disconnect(m_client);
        vigem_free(m_client);
        m_client = nullptr;
        return false;
    }

    err = vigem_target_add(m_client, m_target);
    if (!VIGEM_SUCCESS(err)) {
        std::cerr << "[ViGEm] vigem_target_add falhou, erro=" << static_cast<int>(err) << std::endl;
        vigem_target_free(m_target);
        m_target = nullptr;
        vigem_disconnect(m_client);
        vigem_free(m_client);
        m_client = nullptr;
        return false;
    }

    XUSB_REPORT_INIT(&m_report);
    std::cerr << "[ViGEm] Conectado com sucesso" << std::endl;
    return true;
}

void ViGEmManager::Disconnect() {
    if (m_target) {
        vigem_target_remove(m_client, m_target);
        vigem_target_free(m_target);
        m_target = nullptr;
    }
    if (m_client) {
        vigem_disconnect(m_client);
        vigem_free(m_client);
        m_client = nullptr;
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

    const auto err = vigem_target_x360_update(m_client, m_target, m_report);
    if (!VIGEM_SUCCESS(err)) {
        std::cerr << "[ViGEm] update falhou, erro=" << static_cast<int>(err) << std::endl;
    }
}