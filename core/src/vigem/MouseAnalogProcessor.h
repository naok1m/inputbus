// MouseAnalogProcessor.h
// Mouse → analog stick: integration (accumulation) model with multi-point acceleration curve.
// Mouse delta is added to stick position each tick, not used as a velocity target.
#pragma once

#include <cstdint>
#include <cmath>
#include <chrono>
#include <mutex>
#include <array>
#include <atomic>

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
    // --- Processing mode ---
    // Velocity maps each tick's mouse velocity directly to stick deflection.
    // It feels tighter and more predictable for FPS aim. Integrator preserves
    // the older accumulate-and-decay behavior for legacy profiles.
    bool  velocityMode     = true;
    float velocityScale    = 0.012f;
    // How long the last velocity sample is kept while waiting for the next raw
    // mouse packet. This prevents 1000 Hz update ticks from zeroing the stick
    // between 500/1000 Hz mouse reports.
    float velocityReleaseMs = 8.0f;

    // --- DPI normalization ---
    // All deltas are scaled by (referenceDPI / mouseDPI) so sensitivity
    // settings feel identical regardless of hardware DPI.
    float mouseDPI        = 800.0f;  // User's actual mouse DPI

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
    // 0 = disabled (zero latency), 0.02-0.08 = light, >0.1 = heavy
    float smoothingFactor = 0.0f;

    // --- Anti-acceleration spike ---
    // Max stick change per frame (normalized units). 0 = unlimited.
    // Prevents sudden jumps at movement start. Typical: 0.05 ~ 0.15
    float maxStepPerFrame = 0.0f;

    // --- Jitter filter ---
    float jitterThreshold = 1.5f;   // Drop raw deltas smaller than this (pixels)

    // --- Return-to-center decay ---
    float decayDelay      = 100.0f; // ms of idle before decay begins
    float decayRate       = 6.0f;   // Exponential decay speed (higher = faster return)
    float decayMinStick   = 0.0f;   // Stick floor: decay stops below this magnitude (hold-aim)

    // --- Anti-deadzone (output-side) ---
    // Ensures output always starts above the game's internal deadzone.
    // Maps [0,1] → [antiDeadzone, 1] when output > 0.
    float antiDeadzone    = 0.0f;   // 0 = disabled, typical: 0.02–0.10

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

    // Runtime sensitivity multiplier (e.g. for PQD boost). Thread-safe.
    void SetSensitivityMultiplier(float mult);
    float GetSensitivityMultiplier() const;

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
        bool  velocityMode;
    };

    DebugState GetDebugState() const;

private:
    // Evaluate acceleration curve at given mouse speed
    float EvalAccelCurve(float speed) const;

    AnalogCurveConfig m_cfg;
    mutable std::mutex m_mutex;
    std::atomic<float> m_sensMultiplier{1.0f};

    float m_rawAccX = 0.0f;
    float m_rawAccY = 0.0f;

    float m_stickX = 0.0f;
    float m_stickY = 0.0f;

    float m_smoothedX = 0.0f;
    float m_smoothedY = 0.0f;

    float m_idleTime = 0.0f;
    float m_velocityIdleTime = 0.0f;

    mutable DebugState m_debugState{};
};
