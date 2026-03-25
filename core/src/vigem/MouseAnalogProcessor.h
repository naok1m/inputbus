// MouseAnalogProcessor.h
// Mouse → analog stick: integration (accumulation) model.
// Mouse delta is added to stick position each tick, not used as a velocity target.
#pragma once

#include <cstdint>
#include <cmath>
#include <chrono>
#include <mutex>

// ============================================================================
// CONFIGURATION
// ============================================================================

struct AnalogCurveConfig {
    // --- Sensitivity ---
    // Scale factor applied to each pixel of mouse movement.
    // 1.0 = reference (800 DPI, ~2 cm wrist flick ≈ full stick deflection)
    float sensitivityX    = 1.0f;
    float sensitivityY    = 1.0f;

    // --- Response Curve ---
    float exponent        = 1.0f;   // 1.0 = linear, >1 = more precision at low speeds

    // --- Speed Cap ---
    float maxSpeed        = 1.0f;   // Max normalized output [0, 1]

    // --- Deadzone ---
    float deadzone        = 0.05f;  // Circular deadzone; input below this is ignored

    // --- Smoothing (exponential moving average on output) ---
    // 1 = no smoothing (instant), 10 = heavy smoothing (slow to respond)
    int   smoothSamples   = 2;

    // --- Jitter filter ---
    float jitterThreshold = 1.5f;   // Drop raw deltas smaller than this (pixels)

    // --- Return-to-center decay ---
    float decayDelay      = 100.0f; // ms of idle before decay begins
    float decayRate       = 6.0f;   // Exponential decay speed (higher = faster center return)

    // --- Vector normalization ---
    bool  normalizeVector = true;   // Cap diagonal magnitude to 1.0
};

// ============================================================================
// PROCESSOR
// ============================================================================

class MouseAnalogProcessor {
public:
    explicit MouseAnalogProcessor(const AnalogCurveConfig& cfg = {});

    // Accumulate raw mouse delta (thread-safe, called from input thread)
    void AddDelta(float dx, float dy);

    // Compute analog output (thread-safe, called from update thread at fixed rate)
    // deltaTime: seconds since last Tick
    // outX, outY: XInput range [-32767, 32767]
    void Tick(float deltaTime, int16_t& outX, int16_t& outY);

    // Full state reset (thread-safe)
    void Reset();

    // Hot-reload config (thread-safe)
    void UpdateConfig(const AnalogCurveConfig& cfg);

    // ========================================================================
    // DEBUG / TELEMETRY
    // ========================================================================

    struct DebugState {
        float rawDeltaX, rawDeltaY;   // Raw accumulated pixels this tick
        float stickX, stickY;         // Integrated stick position [-1, 1]
        float smoothedX, smoothedY;   // After EMA smoothing
        float outputX, outputY;       // After deadzone + curve
        float magnitude;
        float timeSinceLastInput;     // ms
        bool  isDecaying;
    };

    DebugState GetDebugState() const;

private:
    AnalogCurveConfig m_cfg;
    mutable std::mutex m_mutex;

    // Accumulated raw delta (input thread writes, Tick reads+resets)
    float m_rawAccX = 0.0f;
    float m_rawAccY = 0.0f;

    // Integrated stick position state — persists between ticks
    float m_stickX = 0.0f;
    float m_stickY = 0.0f;

    // EMA smoothed output
    float m_smoothedX = 0.0f;
    float m_smoothedY = 0.0f;

    // Idle tracking for decay
    float m_idleTime = 0.0f; // seconds

    mutable DebugState m_debugState{};
};
