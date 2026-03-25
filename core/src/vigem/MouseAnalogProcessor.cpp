// MouseAnalogProcessor.cpp — integration model with multi-point acceleration curve
//
// Core idea:
//   mouseSpeed = length(delta)
//   accelMult  = EvalAccelCurve(mouseSpeed)   ← piecewise linear lookup
//   stickX    += deltaX * sensitivity * accelMult * SCALE
//
// The stick HOLDS its position when mouse stops.
// Decay is gradual, configurable, with optional floor (hold-aim).
//
#include "MouseAnalogProcessor.h"
#include <algorithm>
#include <cstring>

namespace {
    constexpr float EPSILON = 1e-5f;
    constexpr float SENSITIVITY_SCALE = 0.0005f;
}

MouseAnalogProcessor::MouseAnalogProcessor(const AnalogCurveConfig& cfg)
    : m_cfg(cfg)
{}

// ============================================================================
// ACCELERATION CURVE — piecewise linear interpolation
// ============================================================================

float MouseAnalogProcessor::EvalAccelCurve(float speed) const {
    if (m_cfg.accelPointCount <= 0) return 1.0f; // No curve = flat multiplier
    if (m_cfg.accelPointCount == 1) return m_cfg.accelCurve[0].multiplier;

    const int n = m_cfg.accelPointCount;

    // Below first point
    if (speed <= m_cfg.accelCurve[0].speed)
        return m_cfg.accelCurve[0].multiplier;

    // Above last point
    if (speed >= m_cfg.accelCurve[n - 1].speed)
        return m_cfg.accelCurve[n - 1].multiplier;

    // Find segment and interpolate
    for (int i = 0; i < n - 1; ++i) {
        const auto& a = m_cfg.accelCurve[i];
        const auto& b = m_cfg.accelCurve[i + 1];

        if (speed >= a.speed && speed <= b.speed) {
            const float range = b.speed - a.speed;
            if (range < EPSILON) return a.multiplier;
            const float t = (speed - a.speed) / range;
            return a.multiplier + t * (b.multiplier - a.multiplier);
        }
    }

    return m_cfg.accelCurve[n - 1].multiplier;
}

// ============================================================================
// PUBLIC API
// ============================================================================

void MouseAnalogProcessor::AddDelta(float dx, float dy) {
    std::lock_guard lock(m_mutex);

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
    // 2. ACCELERATION CURVE — speed-dependent sensitivity
    //
    // Mouse speed = euclidean length of raw delta (pixels this tick).
    // Curve maps speed → multiplier that scales sensitivity.
    // Micro aim → low multiplier → surgeon precision.
    // Fast flick → high multiplier → quick turn.
    // ========================================================================

    float accelMult = 1.0f;

    if (hasInput) {
        const float mouseSpeed = std::sqrt(rawX * rawX + rawY * rawY);
        accelMult = EvalAccelCurve(mouseSpeed);

        m_debugState.mouseSpeed = mouseSpeed;
        m_debugState.accelMultiplier = accelMult;

        // Integration: accumulate into stick position
        m_stickX += rawX * m_cfg.sensitivityX * accelMult * SENSITIVITY_SCALE;
        m_stickY += rawY * m_cfg.sensitivityY * accelMult * SENSITIVITY_SCALE;
        m_idleTime = 0.0f;
    } else {
        m_idleTime += dt;
        m_debugState.mouseSpeed = 0.0f;
        m_debugState.accelMultiplier = 0.0f;
    }

    m_debugState.timeSinceLastInput = m_idleTime * 1000.0f;

    // ========================================================================
    // 3. CLAMP to unit circle
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
    // decayDelay:    hold time (ms) before decay starts
    // decayRate:     exponential decay speed
    // decayMinStick: floor — decay stops when magnitude drops below this
    //                (lets you "hold aim" at a position indefinitely)
    // ========================================================================

    const bool isDecaying = (m_cfg.decayRate > 0.0f) && (m_idleTime > (m_cfg.decayDelay / 1000.0f));
    m_debugState.isDecaying = isDecaying;

    if (isDecaying) {
        const float stickMag = std::sqrt(m_stickX * m_stickX + m_stickY * m_stickY);

        if (stickMag > m_cfg.decayMinStick) {
            const float decay = std::exp(-m_cfg.decayRate * dt);
            m_stickX *= decay;
            m_stickY *= decay;

            // Snap to floor or zero
            const float newMag = std::sqrt(m_stickX * m_stickX + m_stickY * m_stickY);
            if (newMag < std::max(m_cfg.decayMinStick, 0.001f)) {
                if (m_cfg.decayMinStick > EPSILON && stickMag > m_cfg.decayMinStick) {
                    // Clamp to floor, preserving direction
                    const float scale = m_cfg.decayMinStick / (newMag + EPSILON);
                    m_stickX *= scale;
                    m_stickY *= scale;
                } else {
                    m_stickX = 0.0f;
                    m_stickY = 0.0f;
                }
            }
        }
    }

    // ========================================================================
    // 5. EXPONENTIAL SMOOTHING (EMA)
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
    //    Y negated: mouse-down = look-down = negative gamepad Y
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

    m_cfg.sensitivityX    = std::clamp(m_cfg.sensitivityX,    0.1f,  20.0f);
    m_cfg.sensitivityY    = std::clamp(m_cfg.sensitivityY,    0.1f,  20.0f);
    m_cfg.exponent        = std::clamp(m_cfg.exponent,        0.5f,   3.0f);
    m_cfg.maxSpeed        = std::clamp(m_cfg.maxSpeed,        0.1f,   1.0f);
    m_cfg.deadzone        = std::clamp(m_cfg.deadzone,        0.0f,   0.3f);
    m_cfg.smoothSamples   = std::clamp(m_cfg.smoothSamples,   1,       10);
    m_cfg.jitterThreshold = std::clamp(m_cfg.jitterThreshold, 0.0f,   5.0f);
    m_cfg.decayDelay      = std::clamp(m_cfg.decayDelay,      0.0f, 2000.0f);
    m_cfg.decayRate       = std::clamp(m_cfg.decayRate,       0.0f,  20.0f);
    m_cfg.decayMinStick   = std::clamp(m_cfg.decayMinStick,   0.0f,   0.5f);
    m_cfg.accelPointCount = std::clamp(m_cfg.accelPointCount, 0, MAX_ACCEL_POINTS);
}

MouseAnalogProcessor::DebugState MouseAnalogProcessor::GetDebugState() const {
    std::lock_guard lock(m_mutex);
    return m_debugState;
}
