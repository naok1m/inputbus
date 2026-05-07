#include "MouseCameraProcessor.h"
#include <algorithm>

namespace {
    constexpr float EPSILON = 1e-5f;
}

std::pair<float, float> MouseCameraProcessor::ApplyDeadzone(float x, float y, float deadzone) {
    const float dz = std::clamp(deadzone, 0.0f, 0.99f);
    const float mag = std::sqrt((x * x) + (y * y));
    if (mag < dz || mag < EPSILON) return {0.0f, 0.0f};

    const float norm = std::clamp((mag - dz) / (1.0f - dz), 0.0f, 1.0f);
    const float scale = norm / mag;

    return {x * scale, y * scale};
}

float MouseCameraProcessor::ApplyCurve(float value, float curve) {
    const float exp = std::max(curve, 0.01f);
    return std::copysign(std::pow(std::abs(value), exp), value);
}

MouseDelta MouseCameraProcessor::Process(float x, float y, float deltaTime, const MouseCameraConfig& settings) {
    const auto [deadX, deadY] = ApplyDeadzone(
        std::clamp(x, -1.0f, 1.0f),
        std::clamp(y, -1.0f, 1.0f),
        settings.mouseCameraDeadzone);

    if (std::abs(deadX) < EPSILON && std::abs(deadY) < EPSILON) {
        Reset();
        return {};
    }

    const float curvedX = ApplyCurve(deadX, settings.mouseCameraCurve);
    float curvedY = ApplyCurve(deadY, settings.mouseCameraCurve);
    if (settings.mouseCameraInvertY) curvedY = -curvedY;

    float dx = curvedX * settings.mouseCameraSensitivityX;
    float dy = curvedY * settings.mouseCameraSensitivityY;

    const float smoothing = std::clamp(settings.mouseCameraSmoothing, 0.0f, 1.0f);
    if (smoothing > EPSILON) {
        const float dt = std::clamp(deltaTime, 0.0001f, 0.05f);
        const float alpha = std::clamp(dt / (smoothing + dt), 0.0f, 1.0f);
        dx = m_previousDx + (dx - m_previousDx) * alpha;
        dy = m_previousDy + (dy - m_previousDy) * alpha;
    }

    m_previousDx = dx;
    m_previousDy = dy;

    m_accumulatedX += dx;
    m_accumulatedY += dy;

    const int outX = static_cast<int>(std::trunc(m_accumulatedX));
    const int outY = static_cast<int>(std::trunc(m_accumulatedY));

    m_accumulatedX -= static_cast<float>(outX);
    m_accumulatedY -= static_cast<float>(outY);

    return {outX, outY};
}

MouseDelta MouseCameraProcessor::ProcessRawDelta(float rawDx, float rawDy, float deltaTime, const MouseCameraConfig& settings) {
    if (std::abs(rawDx) < EPSILON && std::abs(rawDy) < EPSILON) {
        Reset();
        return {};
    }

    // Native mouse mode must feel like mouse input, not an analog stick.
    // The default sensitivity (18.0) maps to 1:1 raw relative movement.
    float dx = rawDx * (std::max(settings.mouseCameraSensitivityX, 0.0f) / 18.0f);
    float dy = rawDy * (std::max(settings.mouseCameraSensitivityY, 0.0f) / 18.0f);
    if (settings.mouseCameraInvertY) dy = -dy;

    const float smoothing = std::clamp(settings.mouseCameraSmoothing, 0.0f, 1.0f);
    if (smoothing > EPSILON) {
        const float dt = std::clamp(deltaTime, 0.0001f, 0.05f);
        const float alpha = std::clamp(dt / (smoothing + dt), 0.0f, 1.0f);
        dx = m_previousDx + (dx - m_previousDx) * alpha;
        dy = m_previousDy + (dy - m_previousDy) * alpha;
    }

    m_previousDx = dx;
    m_previousDy = dy;

    m_accumulatedX += dx;
    m_accumulatedY += dy;

    const int outX = static_cast<int>(std::trunc(m_accumulatedX));
    const int outY = static_cast<int>(std::trunc(m_accumulatedY));

    m_accumulatedX -= static_cast<float>(outX);
    m_accumulatedY -= static_cast<float>(outY);

    return {outX, outY};
}

void MouseCameraProcessor::Reset() {
    m_previousDx = 0.0f;
    m_previousDy = 0.0f;
    m_accumulatedX = 0.0f;
    m_accumulatedY = 0.0f;
}
