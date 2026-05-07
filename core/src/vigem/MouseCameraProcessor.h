#pragma once

#include <cmath>
#include <utility>

struct MouseCameraConfig {
    bool nativeMouseCameraEnabled = false;

    float mouseCameraSensitivityX = 18.0f;
    float mouseCameraSensitivityY = 18.0f;

    float mouseCameraDeadzone = 0.08f;
    float mouseCameraCurve = 1.30f;
    float mouseCameraSmoothing = 0.0f;

    bool mouseCameraInvertY = false;
};

struct MouseDelta {
    int dx = 0;
    int dy = 0;

    bool IsZero() const { return dx == 0 && dy == 0; }
};

class MouseCameraProcessor {
public:
    MouseDelta Process(float x, float y, float deltaTime, const MouseCameraConfig& settings);
    MouseDelta ProcessRawDelta(float dx, float dy, float deltaTime, const MouseCameraConfig& settings);
    void Reset();

private:
    static std::pair<float, float> ApplyDeadzone(float x, float y, float deadzone);
    static float ApplyCurve(float value, float curve);

    float m_previousDx = 0.0f;
    float m_previousDy = 0.0f;
    float m_accumulatedX = 0.0f;
    float m_accumulatedY = 0.0f;
};
