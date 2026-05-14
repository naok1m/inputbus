// MappingEngine.cpp
#include "MappingEngine.h"
#include <nlohmann/json.hpp>
#include <algorithm>
#include <cmath>
#include <Windows.h>

namespace {
Binding ParseBinding(const nlohmann::json& bindJson) {
    Binding b{};
    std::string ttype = bindJson.value("target", "button");
    if (ttype == "button") {
        b.target = TargetType::Button;
        b.buttonMask = bindJson.value("mask", 0);
    } else if (ttype == "leftTrigger") {
        b.target = TargetType::LeftTrigger;
    } else if (ttype == "rightTrigger") {
        b.target = TargetType::RightTrigger;
    } else if (ttype == "leftStickX") {
        b.target = TargetType::LeftStickX;
    } else if (ttype == "leftStickY") {
        b.target = TargetType::LeftStickY;
    } else {
        b.target = TargetType::Button;
    }

    if (bindJson.contains("axisValue")) b.axisValue = bindJson["axisValue"];
    b.axisValue = std::clamp(b.axisValue, -1.0f, 1.0f);
    return b;
}
}

bool MappingEngine::OnKeyEvent(uint32_t vkCode, bool pressed, GamepadState& state) {
    auto it = m_keyMap.find(vkCode);
    if (it == m_keyMap.end()) return false;

    if (pressed) m_pressedKeys.insert(vkCode);
    else m_pressedKeys.erase(vkCode);

    RecomputeDigitalState(state);

    if (it->second.target == TargetType::LeftStickX || it->second.target == TargetType::LeftStickY) {
        RecomputeLeftStick(state);
    }

    return true;
}

bool MappingEngine::OnMouseButton(int btn, bool pressed, GamepadState& state) {
    auto it = m_mouseMap.find(btn);
    if (it == m_mouseMap.end()) return false;
    if (pressed) m_pressedMouseButtons.insert(btn);
    else m_pressedMouseButtons.erase(btn);
    RecomputeDigitalState(state);
    return true;
}

bool MappingEngine::GetMouseWheelBinding(int delta, Binding& out) const {
    const int wheelCode = delta > 0 ? 5 : 6;
    auto it = m_mouseMap.find(wheelCode);
    if (it == m_mouseMap.end()) return false;
    out = it->second;
    return true;
}

void MappingEngine::RecomputeDigitalState(GamepadState& state) {
    uint16_t mappedButtonMask = 0;
    uint16_t activeButtons = 0;
    uint8_t activeLT = 0;
    uint8_t activeRT = 0;
    bool hasLT = false;
    bool hasRT = false;

    auto scan = [&](const auto& map, const auto& pressedSet) {
        for (const auto& [source, bind] : map) {
            if (bind.target == TargetType::Button) {
                mappedButtonMask |= bind.buttonMask;
            } else if (bind.target == TargetType::LeftTrigger) {
                hasLT = true;
            } else if (bind.target == TargetType::RightTrigger) {
                hasRT = true;
            }

            if (pressedSet.find(source) == pressedSet.end()) continue;

            if (bind.target == TargetType::Button) {
                activeButtons |= bind.buttonMask;
            } else if (bind.target == TargetType::LeftTrigger) {
                const auto value = static_cast<uint8_t>(std::clamp(bind.axisValue, 0.0f, 1.0f) * 255.0f);
                activeLT = std::max(activeLT, value);
            } else if (bind.target == TargetType::RightTrigger) {
                const auto value = static_cast<uint8_t>(std::clamp(bind.axisValue, 0.0f, 1.0f) * 255.0f);
                activeRT = std::max(activeRT, value);
            }
        }
    };

    scan(m_keyMap, m_pressedKeys);
    scan(m_mouseMap, m_pressedMouseButtons);

    state.buttons = static_cast<uint16_t>((state.buttons & ~mappedButtonMask) | activeButtons);
    if (hasLT) state.leftTrigger = activeLT;
    if (hasRT) state.rightTrigger = activeRT;
}

void MappingEngine::RecomputeLeftStick(GamepadState& state) {
    float x = 0.0f;
    float y = 0.0f;

    for (const auto& [vk, bind] : m_keyMap) {
        if (m_pressedKeys.find(vk) == m_pressedKeys.end()) continue;

        if (bind.target == TargetType::LeftStickX) x += bind.axisValue;
        if (bind.target == TargetType::LeftStickY) y += bind.axisValue;
    }

    x = std::clamp(x, -1.0f, 1.0f);
    y = std::clamp(y, -1.0f, 1.0f);

    // Normalize diagonals to keep consistent movement speed.
    const float mag = std::sqrt((x * x) + (y * y));
    if (mag > 1.0f) {
        x /= mag;
        y /= mag;
    }

    state.thumbLX = static_cast<int16_t>(x * 32767.0f);
    state.thumbLY = static_cast<int16_t>(y * 32767.0f);
}

void MappingEngine::RefreshLeftStickFromKeyboard(GamepadState& state) {
    float x = 0.0f;
    float y = 0.0f;

    for (const auto& [vk, bind] : m_keyMap) {
        if (bind.target != TargetType::LeftStickX && bind.target != TargetType::LeftStickY) continue;

        const bool down = (GetAsyncKeyState(static_cast<int>(vk)) & 0x8000) != 0;
        if (!down) continue;

        if (bind.target == TargetType::LeftStickX) x += bind.axisValue;
        if (bind.target == TargetType::LeftStickY) y += bind.axisValue;
    }

    x = std::clamp(x, -1.0f, 1.0f);
    y = std::clamp(y, -1.0f, 1.0f);

    const float mag = std::sqrt((x * x) + (y * y));
    if (mag > 1.0f) {
        x /= mag;
        y /= mag;
    }

    state.thumbLX = static_cast<int16_t>(x * 32767.0f);
    state.thumbLY = static_cast<int16_t>(y * 32767.0f);
}

void MappingEngine::LoadFromJson(const std::string& jsonStr) {
    using json = nlohmann::json;
    auto j = json::parse(jsonStr);
    
    ClearBindings();
    m_pressedKeys.clear();
    m_pressedMouseButtons.clear();

    if (j.contains("keyBindings") && j["keyBindings"].is_object()) {
        for (auto& [vk, bindJson] : j["keyBindings"].items()) {
            m_keyMap[std::stoul(vk)] = ParseBinding(bindJson);
        }
    }

    if (j.contains("mouseBindings") && j["mouseBindings"].is_object()) {
        for (auto& [btn, bindJson] : j["mouseBindings"].items()) {
            m_mouseMap[std::stoi(btn)] = ParseBinding(bindJson);
        }
    }
}
