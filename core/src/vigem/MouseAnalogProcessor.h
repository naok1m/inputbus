// MouseAnalogProcessor.h
#pragma once
#include <cstdint>
#include <cmath>
#include <deque>

struct AnalogCurveConfig {
    float sensitivity    = 1.0f;   // base multiplier
    float exponent       = 1.5f;   // curve exponent (1.0 = linear)
    float maxSpeed       = 1.0f;   // normalized max [0,1]
    float deadzone       = 0.05f;  // normalized deadzone
    int   smoothSamples  = 1;      // moving average window (1 = sem smoothing)
};

class MouseAnalogProcessor {
public:
    explicit MouseAnalogProcessor(AnalogCurveConfig cfg = {}) : m_cfg(cfg) {}

    // Call with raw mouse delta each frame (or accumulate per update tick)
    void AddDelta(long dx, long dy);
    
    // Call at fixed rate (e.g., 1000Hz) to get current axis values
    void Tick(float deltaTime, int16_t& outX, int16_t& outY);
    
    void UpdateConfig(const AnalogCurveConfig& cfg) { m_cfg = cfg; }
    void Reset();

private:
    float ApplyCurve(float normalized) const;
    float ApplyDeadzone(float value) const;

    AnalogCurveConfig m_cfg;

    // Accumulated raw delta since last Tick
    float m_accX = 0.f, m_accY = 0.f;

    // Smoothing buffers
    std::deque<float> m_smoothX, m_smoothY;

    // Current output (decays to zero when no input)
    float m_outX = 0.f, m_outY = 0.f;
    int m_idleTicks = 0;
};