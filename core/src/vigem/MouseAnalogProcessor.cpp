// MouseAnalogProcessor.cpp - mouse-to-analog processor with natural velocity mode.
//
// Velocity mode maps mouse speed directly to right-stick deflection, then uses
// a very short response filter. Legacy mode keeps the previous leaky integrator
// for profiles that intentionally want hold/decay behavior.
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

float MouseAnalogProcessor::EvalAccelCurve(float speed) const {
    if (m_cfg.accelPointCount <= 0) return 1.0f;
    if (m_cfg.accelPointCount == 1) return m_cfg.accelCurve[0].multiplier;

    const int n = m_cfg.accelPointCount;

    if (speed <= m_cfg.accelCurve[0].speed)
        return m_cfg.accelCurve[0].multiplier;

    if (speed >= m_cfg.accelCurve[n - 1].speed)
        return m_cfg.accelCurve[n - 1].multiplier;

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

    constexpr float REF_DT = 0.001f;
    const float dtNorm = dt / REF_DT;

    constexpr float REFERENCE_DPI = 800.0f;
    const float dpiScale = (m_cfg.mouseDPI > EPSILON)
                         ? (REFERENCE_DPI / m_cfg.mouseDPI)
                         : 1.0f;

    const float rawX = m_rawAccX * dpiScale;
    const float rawY = m_rawAccY * dpiScale;
    m_rawAccX = 0.0f;
    m_rawAccY = 0.0f;

    m_debugState.rawDeltaX = rawX;
    m_debugState.rawDeltaY = rawY;

    const bool hasInput = std::abs(rawX) > EPSILON || std::abs(rawY) > EPSILON;

    float accelMult = 1.0f;

    if (hasInput) {
        const float rawSpeed = std::sqrt(rawX * rawX + rawY * rawY);
        const float mouseSpeed = (dtNorm > EPSILON) ? rawSpeed / dtNorm : rawSpeed;
        accelMult = EvalAccelCurve(mouseSpeed);

        m_debugState.mouseSpeed = mouseSpeed;
        m_debugState.accelMultiplier = accelMult;
    } else {
        m_debugState.mouseSpeed = 0.0f;
        m_debugState.accelMultiplier = 0.0f;
    }

    if (m_cfg.velocityMode) {
        const float sensMult = m_sensMultiplier.load(std::memory_order_relaxed);
        float targetX = 0.0f;
        float targetY = 0.0f;

        if (hasInput) {
            const float speedX = (dtNorm > EPSILON) ? rawX / dtNorm : rawX;
            const float speedY = (dtNorm > EPSILON) ? rawY / dtNorm : rawY;
            targetX = speedX * m_cfg.sensitivityX * sensMult * accelMult * m_cfg.velocityScale;
            targetY = speedY * m_cfg.sensitivityY * sensMult * accelMult * m_cfg.velocityScale;
            m_idleTime = 0.0f;
        } else {
            m_idleTime += dt;
        }

        targetX = std::clamp(targetX, -1.0f, 1.0f);
        targetY = std::clamp(targetY, -1.0f, 1.0f);

        if (m_cfg.normalizeVector) {
            const float targetMag = std::sqrt(targetX * targetX + targetY * targetY);
            if (targetMag > 1.0f) {
                targetX /= targetMag;
                targetY /= targetMag;
            }
        }

        const float response = hasInput ? m_cfg.responseTime : m_cfg.stopTime;
        const float alpha = (response <= EPSILON) ? 1.0f : (dt / (response + dt));
        m_stickX += (targetX - m_stickX) * alpha;
        m_stickY += (targetY - m_stickY) * alpha;
        m_debugState.isDecaying = !hasInput
            && (std::abs(m_stickX) > EPSILON || std::abs(m_stickY) > EPSILON);
    } else {
        const bool shouldDecay = (m_cfg.decayRate > 0.0f)
                              && (m_idleTime >= (m_cfg.decayDelay / 1000.0f));
        m_debugState.isDecaying = shouldDecay;

        if (shouldDecay) {
            const float stickMag = std::sqrt(m_stickX * m_stickX + m_stickY * m_stickY);

            if (stickMag > m_cfg.decayMinStick) {
                const float decay = std::exp(-m_cfg.decayRate * dt);
                m_stickX *= decay;
                m_stickY *= decay;

                const float newMag = std::sqrt(m_stickX * m_stickX + m_stickY * m_stickY);
                if (newMag < std::max(m_cfg.decayMinStick, 0.001f)) {
                    if (m_cfg.decayMinStick > EPSILON && stickMag > m_cfg.decayMinStick) {
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

        if (hasInput) {
            const float sensMult = m_sensMultiplier.load(std::memory_order_relaxed);
            float stepX = rawX * m_cfg.sensitivityX * sensMult * accelMult * SENSITIVITY_SCALE;
            float stepY = rawY * m_cfg.sensitivityY * sensMult * accelMult * SENSITIVITY_SCALE;

            if (m_cfg.maxStepPerFrame > EPSILON) {
                const float maxStep = m_cfg.maxStepPerFrame * dtNorm;
                stepX = std::clamp(stepX, -maxStep, maxStep);
                stepY = std::clamp(stepY, -maxStep, maxStep);
            }

            m_stickX += stepX;
            m_stickY += stepY;
            m_idleTime = 0.0f;
        } else {
            m_idleTime += dt;
        }
    }

    m_debugState.timeSinceLastInput = m_idleTime * 1000.0f;

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

    float vx, vy;

    if (m_cfg.smoothingFactor <= EPSILON) {
        m_smoothedX = m_stickX;
        m_smoothedY = m_stickY;
        vx = m_stickX;
        vy = m_stickY;
    } else {
        const float alpha = dt / (m_cfg.smoothingFactor + dt);
        m_smoothedX += (m_stickX - m_smoothedX) * alpha;
        m_smoothedY += (m_stickY - m_smoothedY) * alpha;
        vx = m_smoothedX;
        vy = m_smoothedY;
    }

    m_debugState.smoothedX = m_smoothedX;
    m_debugState.smoothedY = m_smoothedY;

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

    if (mag > EPSILON && m_cfg.exponent != 1.0f) {
        const float curved = std::pow(mag, m_cfg.exponent);
        const float ratio = curved / mag;
        vx *= ratio;
        vy *= ratio;
        mag = curved;
    }

    if (m_cfg.antiDeadzone > EPSILON && mag > EPSILON) {
        const float remapped = m_cfg.antiDeadzone + mag * (1.0f - m_cfg.antiDeadzone);
        const float ratio = remapped / mag;
        vx *= ratio;
        vy *= ratio;
    }

    vx = std::clamp(vx * m_cfg.maxSpeed, -1.0f, 1.0f);
    vy = std::clamp(vy * m_cfg.maxSpeed, -1.0f, 1.0f);

    m_debugState.outputX = vx;
    m_debugState.outputY = vy;

    outX = static_cast<int16_t>(vx *  32767.0f);
    outY = static_cast<int16_t>(vy * -32767.0f);
}

void MouseAnalogProcessor::Reset() {
    std::lock_guard lock(m_mutex);
    m_rawAccX = m_rawAccY = 0.0f;
    m_stickX = m_stickY = 0.0f;
    m_smoothedX = m_smoothedY = 0.0f;
    m_idleTime = 0.0f;
    std::memset(&m_debugState, 0, sizeof(m_debugState));
}

void MouseAnalogProcessor::UpdateConfig(const AnalogCurveConfig& cfg) {
    std::lock_guard lock(m_mutex);
    m_cfg = cfg;

    m_cfg.mouseDPI        = std::clamp(m_cfg.mouseDPI,      100.0f, 16000.0f);
    m_cfg.sensitivityX    = std::clamp(m_cfg.sensitivityX,    0.1f,  20.0f);
    m_cfg.sensitivityY    = std::clamp(m_cfg.sensitivityY,    0.1f,  20.0f);
    m_cfg.exponent        = std::clamp(m_cfg.exponent,        0.1f,   3.0f);
    m_cfg.maxSpeed        = std::clamp(m_cfg.maxSpeed,        0.1f,   1.0f);
    m_cfg.deadzone        = std::clamp(m_cfg.deadzone,        0.0f,   0.3f);
    m_cfg.smoothingFactor = std::clamp(m_cfg.smoothingFactor, 0.0f,   0.5f);
    m_cfg.maxStepPerFrame = std::clamp(m_cfg.maxStepPerFrame, 0.0f,   1.0f);
    m_cfg.jitterThreshold = std::clamp(m_cfg.jitterThreshold, 0.0f,   5.0f);
    m_cfg.decayDelay      = std::clamp(m_cfg.decayDelay,      0.0f, 2000.0f);
    m_cfg.decayRate       = std::clamp(m_cfg.decayRate,       0.0f,  20.0f);
    m_cfg.decayMinStick   = std::clamp(m_cfg.decayMinStick,   0.0f,   0.5f);
    m_cfg.accelPointCount = std::clamp(m_cfg.accelPointCount, 0, MAX_ACCEL_POINTS);
    m_cfg.antiDeadzone    = std::clamp(m_cfg.antiDeadzone,    0.0f,   0.3f);
    m_cfg.velocityScale   = std::clamp(m_cfg.velocityScale,   0.001f, 0.1f);
    m_cfg.responseTime    = std::clamp(m_cfg.responseTime,    0.0f,   0.05f);
    m_cfg.stopTime        = std::clamp(m_cfg.stopTime,        0.0f,   0.05f);
}

void MouseAnalogProcessor::SetSensitivityMultiplier(float mult) {
    m_sensMultiplier.store(std::clamp(mult, 0.1f, 10.0f), std::memory_order_relaxed);
}

float MouseAnalogProcessor::GetSensitivityMultiplier() const {
    return m_sensMultiplier.load(std::memory_order_relaxed);
}

MouseAnalogProcessor::DebugState MouseAnalogProcessor::GetDebugState() const {
    std::lock_guard lock(m_mutex);
    return m_debugState;
}
