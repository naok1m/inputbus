// MouseAnalogProcessor.cpp — integration (accumulation) model
//
// Core principle:
//   stickX += deltaX * sensitivity * SCALE   (NOT stickX = deltaX)
//
// This means the stick HOLDS its position when the mouse stops, and only
// decays back to center gradually. No more instant return to center.
//
#include "MouseAnalogProcessor.h"
#include <algorithm>
#include <cstring>

namespace {
    constexpr float EPSILON = 1e-5f;

    // Pixels → stick units conversion.
    // At sensitivity=1.0: moving ~2000 pixels pushes stick to full deflection.
    // User adjusts sensitivityX/Y to taste for their DPI.
    constexpr float SENSITIVITY_SCALE = 0.0005f;
}

MouseAnalogProcessor::MouseAnalogProcessor(const AnalogCurveConfig& cfg)
    : m_cfg(cfg)
{}

// ============================================================================
// PUBLIC API
// ============================================================================

void MouseAnalogProcessor::AddDelta(float dx, float dy) {
    std::lock_guard lock(m_mutex);

    // Jitter filter: optical sensors emit noise at rest; ignore sub-threshold moves
    if (std::abs(dx) < m_cfg.jitterThreshold) dx = 0.0f;
    if (std::abs(dy) < m_cfg.jitterThreshold) dy = 0.0f;

    if (std::abs(dx) > EPSILON || std::abs(dy) > EPSILON) {
        m_rawAccX += dx;
        m_rawAccY += dy;
        m_idleTime = 0.0f;
    }
}

void MouseAnalogProcessor::Tick(float deltaTime, int16_t& outX, int16_t& outY) {
    std::lock_guard lock(m_mutex);

    const float dt = std::clamp(deltaTime, 0.0001f, 0.05f);

    // ========================================================================
    // 1. CONSUME ACCUMULATED DELTA
    // ========================================================================

    const float rawX = m_rawAccX;
    const float rawY = m_rawAccY;
    m_rawAccX = 0.0f;
    m_rawAccY = 0.0f;

    m_debugState.rawDeltaX = rawX;
    m_debugState.rawDeltaY = rawY;

    const bool hasInput = std::abs(rawX) > EPSILON || std::abs(rawY) > EPSILON;

    // ========================================================================
    // 2. INTEGRATION: accumulate delta into stick position
    //
    // stickX += deltaX * sensitivity   ← THE correct model
    // stickX = deltaX                  ← the broken model (resets every tick)
    //
    // The stick now holds its position when the mouse stops.
    // ========================================================================

    if (hasInput) {
        m_stickX += rawX * m_cfg.sensitivityX * SENSITIVITY_SCALE;
        m_stickY += rawY * m_cfg.sensitivityY * SENSITIVITY_SCALE;
        m_idleTime = 0.0f;
    } else {
        m_idleTime += dt;
    }

    m_debugState.timeSinceLastInput = m_idleTime * 1000.0f;

    // ========================================================================
    // 3. CLAMP to unit square first, then normalize circle
    // ========================================================================

    m_stickX = std::clamp(m_stickX, -1.0f, 1.0f);
    m_stickY = std::clamp(m_stickY, -1.0f, 1.0f);

    if (m_cfg.normalizeVector) {
        const float mag = std::sqrt(m_stickX * m_stickX + m_stickY * m_stickY);
        if (mag > 1.0f) {
            m_stickX /= mag;
            m_stickY /= mag;
        }
    }

    m_debugState.stickX = m_stickX;
    m_debugState.stickY = m_stickY;

    // ========================================================================
    // 4. DECAY — gradual return to center after mouse stops
    //
    // decayDelay: hold time (ms) before decay starts — lets you "hold aim"
    // decayRate:  exponential decay speed; higher = faster return to center
    // ========================================================================

    const bool isDecaying = (m_idleTime > (m_cfg.decayDelay / 1000.0f));
    m_debugState.isDecaying = isDecaying;

    if (isDecaying) {
        const float decay = std::exp(-m_cfg.decayRate * dt);
        m_stickX *= decay;
        m_stickY *= decay;

        // Snap to zero to avoid floating-point denormals
        if (std::abs(m_stickX) < 0.001f) m_stickX = 0.0f;
        if (std::abs(m_stickY) < 0.001f) m_stickY = 0.0f;
    }

    // ========================================================================
    // 5. EXPONENTIAL SMOOTHING (EMA) on output
    //
    // alpha = dt*1000 / smoothSamples  → time-invariant regardless of tick rate
    // smoothSamples=1: alpha=1 → no lag (output = state)
    // smoothSamples=5: alpha=0.2 → gentle smoothing
    // ========================================================================

    const float alpha = std::min(1.0f,
        (dt * 1000.0f) / static_cast<float>(std::clamp(m_cfg.smoothSamples, 1, 10)));

    m_smoothedX += (m_stickX - m_smoothedX) * alpha;
    m_smoothedY += (m_stickY - m_smoothedY) * alpha;

    m_debugState.smoothedX = m_smoothedX;
    m_debugState.smoothedY = m_smoothedY;

    float vx = m_smoothedX;
    float vy = m_smoothedY;

    // ========================================================================
    // 6. CIRCULAR DEADZONE with smooth rescaling
    // ========================================================================

    float mag = std::sqrt(vx * vx + vy * vy);
    m_debugState.magnitude = mag;

    if (mag < m_cfg.deadzone) {
        vx = vy = 0.0f;
        mag = 0.0f;
    } else if (mag > EPSILON) {
        const float scale = std::clamp(
            (mag - m_cfg.deadzone) / (1.0f - m_cfg.deadzone), 0.0f, 1.0f);
        vx = (vx / mag) * scale;
        vy = (vy / mag) * scale;
        mag = scale;
    }

    // ========================================================================
    // 7. RESPONSE CURVE (applied to magnitude, preserves direction)
    // ========================================================================

    if (mag > EPSILON && m_cfg.exponent != 1.0f) {
        const float curved = std::pow(mag, m_cfg.exponent);
        const float ratio  = curved / mag;
        vx *= ratio;
        vy *= ratio;
        mag = curved;
    }

    // ========================================================================
    // 8. FINAL CLAMP to maxSpeed
    // ========================================================================

    vx = std::clamp(vx * m_cfg.maxSpeed, -1.0f, 1.0f);
    vy = std::clamp(vy * m_cfg.maxSpeed, -1.0f, 1.0f);

    m_debugState.outputX = vx;
    m_debugState.outputY = vy;

    // ========================================================================
    // 9. CONVERT TO INT16 (XInput range)
    //    Y is negated: mouse-down = look-down = negative gamepad Y
    // ========================================================================

    outX = static_cast<int16_t>(vx *  32767.0f);
    outY = static_cast<int16_t>(vy * -32767.0f);
}

void MouseAnalogProcessor::Reset() {
    std::lock_guard lock(m_mutex);
    m_rawAccX = m_rawAccY = 0.0f;
    m_stickX  = m_stickY  = 0.0f;
    m_smoothedX = m_smoothedY = 0.0f;
    m_idleTime = 0.0f;
    std::memset(&m_debugState, 0, sizeof(m_debugState));
}

void MouseAnalogProcessor::UpdateConfig(const AnalogCurveConfig& cfg) {
    std::lock_guard lock(m_mutex);
    m_cfg = cfg;

    // Clamp to safe ranges
    m_cfg.sensitivityX    = std::clamp(m_cfg.sensitivityX,    0.1f,  20.0f);
    m_cfg.sensitivityY    = std::clamp(m_cfg.sensitivityY,    0.1f,  20.0f);
    m_cfg.exponent        = std::clamp(m_cfg.exponent,        0.5f,   3.0f);
    m_cfg.maxSpeed        = std::clamp(m_cfg.maxSpeed,        0.1f,   1.0f);
    m_cfg.deadzone        = std::clamp(m_cfg.deadzone,        0.0f,   0.3f);
    m_cfg.smoothSamples   = std::clamp(m_cfg.smoothSamples,   1,       10);
    m_cfg.jitterThreshold = std::clamp(m_cfg.jitterThreshold, 0.0f,   5.0f);
    m_cfg.decayDelay      = std::clamp(m_cfg.decayDelay,      0.0f, 500.0f);
    m_cfg.decayRate       = std::clamp(m_cfg.decayRate,       0.5f,  20.0f);
}

MouseAnalogProcessor::DebugState MouseAnalogProcessor::GetDebugState() const {
    std::lock_guard lock(m_mutex);
    return m_debugState;
}
