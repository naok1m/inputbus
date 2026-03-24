// MouseAnalogProcessor.cpp
#include "MouseAnalogProcessor.h"
#include <numeric>
#include <algorithm>

void MouseAnalogProcessor::AddDelta(long dx, long dy) {
    // Convert to float and apply stronger gain for low-pixel mouse motion.
    m_accX += static_cast<float>(dx) * m_cfg.sensitivity * 0.16f;
    m_accY += static_cast<float>(dy) * m_cfg.sensitivity * 0.16f;
}

void MouseAnalogProcessor::Tick(float /*deltaTime*/, int16_t& outX, int16_t& outY) {
    // --- Normalize accumulated delta ---
    float nx = std::clamp(m_accX, -1.f, 1.f);
    float ny = std::clamp(m_accY, -1.f, 1.f);
    m_accX = 0.f; m_accY = 0.f;

    // --- Apply deadzone (circular) ---
    // Mouse deltas are already discrete and clean, so we soften the configured
    // deadzone to preserve fine aim adjustments.
    const float effectiveDeadzone = std::clamp(m_cfg.deadzone * 0.25f, 0.0f, 0.2f);
    float mag = std::sqrtf(nx*nx + ny*ny);
    if (mag < effectiveDeadzone) {
        nx = ny = 0.f;
        mag = 0.f;
    } else {
        float scale = (mag - effectiveDeadzone) / (1.f - effectiveDeadzone);
        if (mag > 0.f) { nx = nx/mag * scale; ny = ny/mag * scale; }
    }

    // --- Apply acceleration curve ---
    if (mag > 0.f) {
        float curved = ApplyCurve(std::min(mag, 1.f));
        float ratio = curved / mag;
        nx *= ratio; ny *= ratio;
    }

    // --- Clamp to max speed ---
    nx = std::clamp(nx * m_cfg.maxSpeed, -1.f, 1.f);
    ny = std::clamp(ny * m_cfg.maxSpeed, -1.f, 1.f);

    // --- Dynamic response ---
    // Fast acquisition when there is input, smooth release when stopping.
    const float response = 0.98f;
    const float releaseDecay = 0.95f;
    const int holdTicks = 5; // ~5ms at 1000Hz
    if (std::abs(nx) > 0.0001f || std::abs(ny) > 0.0001f) {
        m_idleTicks = 0;
        m_outX += (nx - m_outX) * response;
        m_outY += (ny - m_outY) * response;
    } else {
        m_idleTicks += 1;
        if (m_idleTicks > holdTicks) {
            m_outX *= releaseDecay;
            m_outY *= releaseDecay;
        }
        if (std::abs(m_outX) < 0.0005f) m_outX = 0.0f;
        if (std::abs(m_outY) < 0.0005f) m_outY = 0.0f;
    }

    // --- Smoothing (moving average over dynamic output) ---
    m_smoothX.push_back(m_outX);
    m_smoothY.push_back(m_outY);
    if ((int)m_smoothX.size() > m_cfg.smoothSamples) { m_smoothX.pop_front(); m_smoothY.pop_front(); }

    float sx = std::accumulate(m_smoothX.begin(), m_smoothX.end(), 0.f) / (float)m_smoothX.size();
    float sy = std::accumulate(m_smoothY.begin(), m_smoothY.end(), 0.f) / (float)m_smoothY.size();

    // --- Scale to int16 range ---
    // Note: Y axis is inverted (mouse down = look down = negative Y in gamepad convention)
    outX = static_cast<int16_t>(sx *  32767.f);
    outY = static_cast<int16_t>(sy * -32767.f);
}

float MouseAnalogProcessor::ApplyCurve(float v) const {
    // Signed power curve: preserves sign, applies exponent to magnitude
    return std::powf(v, m_cfg.exponent);
}

void MouseAnalogProcessor::Reset() {
    m_accX = m_accY = 0.f;
    m_outX = m_outY = 0.f;
    m_idleTicks = 0;
    m_smoothX.clear();
    m_smoothY.clear();
}