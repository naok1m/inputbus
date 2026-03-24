// MappingEngine.h
#pragma once
#include <unordered_map>
#include <unordered_set>
#include <cstdint>
#include <string>
#include "../vigem/GamepadState.h"

// What a key/button maps to on the virtual gamepad
enum class TargetType { Button, LeftTrigger, RightTrigger, LeftStickX, LeftStickY };

struct Binding {
    TargetType target;
    uint16_t   buttonMask = 0;  // for Button type
    float      axisValue  = 1.f; // for axis/trigger types (-1 to 1)
};

class MappingEngine {
public:
    // Returns updated gamepad state after processing event
    bool OnKeyEvent(uint32_t vkCode, bool pressed, GamepadState& state);
    bool OnMouseButton(int btn, bool pressed, GamepadState& state);

    bool HasKeyBinding(uint32_t vkCode) const { return m_keyMap.find(vkCode) != m_keyMap.end(); }
    bool HasMouseBinding(int btn) const { return m_mouseMap.find(btn) != m_mouseMap.end(); }

    // Recomputes LS axes from current keyboard state to avoid missed key up/down events.
    void RefreshLeftStickFromKeyboard(GamepadState& state);

    void SetBinding(uint32_t vkCode, Binding b) { m_keyMap[vkCode] = b; }
    void SetMouseBinding(int btn, Binding b)     { m_mouseMap[btn] = b; }
    void ClearBindings() { m_keyMap.clear(); m_mouseMap.clear(); }
    
    void LoadFromJson(const std::string& json);
    std::string SaveToJson() const;

private:
    void ApplyBinding(const Binding& b, bool pressed, GamepadState& state);
    void RecomputeLeftStick(GamepadState& state);
    
    std::unordered_map<uint32_t, Binding> m_keyMap;
    std::unordered_map<int,      Binding> m_mouseMap;
    std::unordered_set<uint32_t> m_pressedKeys;
};