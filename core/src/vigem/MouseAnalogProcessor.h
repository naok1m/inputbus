// MouseAnalogProcessor.h
// Mouse → analog stick: integration (accumulation) model with multi-point acceleration curve.
// Mouse delta is added to stick position each tick, not used as a velocity target.
#pragma once

#include <cstdint>
#include <cmath>
#include <chrono>
#include <mutex>
#include <array>

// ============================================================================
// ACCELERATION CURVE — piecewise linear, up to 8 control points
// ============================================================================

struct AccelPoint {
    float speed;      // Mouse speed in pixels/tick
    float multiplier; // Sensitivity multiplier at this speed [0, ∞)
};

static constexpr int MAX_ACCEL_POINTS = 8;

// ============================================================================
// CONFIGURATION
// ============================================================================

struct AnalogCurveConfig {
    // --- Sensitivity ---
    float sensitivityX    = 1.0f;
    float sensitivityY    = 1.0f;

    // --- Response Curve (output side) ---
    float exponent        = 1.0f;   // 1.0 = linear, >1 = more precision at low stick deflection

    // --- Acceleration Curve (input side) ---
    // Maps mouse speed → sensitivity multiplier via piecewise linear interpolation.
    // When enabled (accelPointCount > 0), the sensitivity is SCALED by the curve value.
    // Example: [{0, 0.15}, {8, 0.35}, {25, 0.75}, {60, 1.0}]
    //   → micro aim (0-8 px) = 15-35% sensitivity
    //   → medium    (8-25 px) = 35-75% sensitivity
    //   → fast flick (25-60+) = 75-100% sensitivity
    std::array<AccelPoint, MAX_ACCEL_POINTS> accelCurve{};
    int accelPointCount   = 0;      // 0 = disabled, use flat sensitivity

    // --- Speed Cap ---
    float maxSpeed        = 1.0f;   // Max normalized output [0, 1]

    // --- Deadzone ---
    float deadzone        = 0.05f;  // Circular deadzone; input below this is ignored

    // --- Smoothing (exponential moving average on output) ---
    int   smoothSamples   = 2;      // 1 = no smoothing, 10 = heavy

    // --- Jitter filter ---
    float jitterThreshold = 1.5f;   // Drop raw deltas smaller than this (pixels)

    // --- Return-to-center decay ---
    float decayDelay      = 100.0f; // ms of idle before decay begins
    float decayRate       = 6.0f;   // Exponential decay speed (higher = faster return)
    float decayMinStick   = 0.0f;   // Stick floor: decay stops below this magnitude (hold-aim)

    // --- Vector normalization ---
    bool  normalizeVector = true;   // Cap diagonal magnitude to 1.0
};

// ============================================================================
// PROCESSOR
// ============================================================================

class MouseAnalogProcessor {
public:
    explicit MouseAnalogProcessor(const AnalogCurveConfig& cfg = {});

    void AddDelta(float dx, float dy);
    void Tick(float deltaTime, int16_t& outX, int16_t& outY);
    void Reset();
    void UpdateConfig(const AnalogCurveConfig& cfg);

    // ========================================================================
    // DEBUG / TELEMETRY
    // ========================================================================

    struct DebugState {
        float rawDeltaX, rawDeltaY;
        float mouseSpeed;             // Current mouse speed (px/tick)
        float accelMultiplier;        // Current acceleration curve value
        float stickX, stickY;
        float smoothedX, smoothedY;
        float outputX, outputY;
        float magnitude;
        float timeSinceLastInput;     // ms
        bool  isDecaying;
    };

    DebugState GetDebugState() const;

private:
    // Evaluate acceleration curve at given mouse speed
    float EvalAccelCurve(float speed) const;

    AnalogCurveConfig m_cfg;
    mutable std::mutex m_mutex;

    float m_rawAccX = 0.0f;
    float m_rawAccY = 0.0f;

    float m_stickX = 0.0f;
    float m_stickY = 0.0f;

    float m_smoothedX = 0.0f;
    float m_smoothedY = 0.0f;

    float m_idleTime = 0.0f;

    mutable DebugState m_debugState{};
};
