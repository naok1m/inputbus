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

    ApplyBinding(it->second, pressed, state);

    if (it->second.target == TargetType::LeftStickX || it->second.target == TargetType::LeftStickY) {
        RecomputeLeftStick(state);
    }

    return true;
}

bool MappingEngine::OnMouseButton(int btn, bool pressed, GamepadState& state) {
    auto it = m_mouseMap.find(btn);
    if (it == m_mouseMap.end()) return false;
    ApplyBinding(it->second, pressed, state);
    return true;
}

void MappingEngine::ApplyBinding(const Binding& b, bool pressed, GamepadState& state) {
    switch (b.target) {
        case TargetType::Button:
            if (pressed) state.buttons |= b.buttonMask;
            else         state.buttons &= ~b.buttonMask;
            break;
        case TargetType::LeftTrigger:
            state.leftTrigger = pressed ? static_cast<uint8_t>(b.axisValue * 255.f) : 0;
            break;
        case TargetType::RightTrigger:
            state.rightTrigger = pressed ? static_cast<uint8_t>(b.axisValue * 255.f) : 0;
            break;
        case TargetType::LeftStickX:
        case TargetType::LeftStickY:
            // Axis is recomputed from all currently pressed keys.
            break;
        default: break;
    }
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