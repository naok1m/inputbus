// MouseAnalogProcessor_v2.h
// Refatoração completa: sistema de conversão mouse → analógico com estado contínuo
#pragma once

#include <cstdint>
#include <cmath>
#include <array>
#include <chrono>
#include <mutex>

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

struct AnalogCurveConfig {
    // --- Sensitivity ---
    float sensitivityX       = 2.5f;   // Multiplicador base X (separado)
    float sensitivityY       = 2.5f;   // Multiplicador base Y (separado)

    // --- Response Curve ---
    float exponent           = 1.0f;   // Curva de resposta (1.0 = linear, >1 = exponencial)
    float minCurveThreshold  = 0.1f;   // Threshold mínimo para aplicar curva

    // --- Speed Control ---
    float maxSpeed           = 1.0f;   // Velocidade máxima normalizada [0, 1]
    float acceleration       = 8.0f;   // Taxa de aceleração (maior = mais rápido para atingir maxSpeed)
    float deceleration       = 12.0f;  // Taxa de desaceleração (maior = para mais rápido)

    // --- Deadzone ---
    float deadzone           = 0.02f;  // Deadzone circular normalizado [0, 0.3]
    float jitterThreshold    = 0.5f;   // Ignora deltas menores que este valor (em pixels)

    // --- Smoothing ---
    int   smoothSamples      = 3;      // Moving average window (1 = sem smoothing, max 10)
    float smoothFactor       = 0.3f;   // Exponential smoothing (0 = sem, 1 = máximo)

    // --- Decay (retorno ao centro) ---
    float decayDelay         = 80.0f;  // Tempo sem input antes de começar decay (ms)
    float decayRate          = 4.5f;   // Taxa de decay exponencial (maior = mais rápido)

    // --- Advanced ---
    bool  normalizeVector    = true;   // Normalizar vetor diagonal
    bool  independentAxes    = false;  // Se true, X e Y não afetam magnitude um do outro
};

// ============================================================================
// PROCESSADOR
// ============================================================================

class MouseAnalogProcessor {
public:
    explicit MouseAnalogProcessor(const AnalogCurveConfig& cfg = {});

    // ========================================================================
    // API PRINCIPAL
    // ========================================================================

    // Adiciona delta do mouse (thread-safe)
    // dx, dy: movimento em pixels (pode ser acumulado entre chamadas)
    void AddDelta(float dx, float dy);

    // Atualiza estado interno e retorna valores do analógico (thread-safe)
    // deltaTime: tempo desde último Tick em SEGUNDOS
    // outX, outY: saída no range [-32767, 32767] (int16 do XInput)
    void Tick(float deltaTime, int16_t& outX, int16_t& outY);

    // Reseta completamente o estado (thread-safe)
    void Reset();

    // Atualiza configuração (thread-safe)
    void UpdateConfig(const AnalogCurveConfig& cfg);

    // ========================================================================
    // DEBUG / TELEMETRIA
    // ========================================================================

    struct DebugState {
        float rawDeltaX, rawDeltaY;           // Delta bruto acumulado
        float smoothedX, smoothedY;           // Após smoothing
        float normalizedX, normalizedY;       // Normalizado [-1, 1]
        float curvedX, curvedY;               // Após curva
        float velocityX, velocityY;           // Velocidade atual
        float magnitude;                      // Magnitude do vetor
        float timeSinceLastInput;             // Tempo desde último input (ms)
        bool  isDecaying;                     // Se está em modo decay
    };

    DebugState GetDebugState() const;

private:
    // ========================================================================
    // PROCESSAMENTO INTERNO
    // ========================================================================

    float ApplyCurve(float normalized) const;
    float ApplyDeadzone(float value) const;
    void  ApplySmoothing(float& x, float& y);
    void  ApplyAcceleration(float& vx, float& vy, float deltaTime);
    void  ApplyDecay(float& vx, float& vy, float deltaTime);
    void  NormalizeVector(float& x, float& y) const;

    // ========================================================================
    // ESTADO
    // ========================================================================

    AnalogCurveConfig m_cfg;
    mutable std::mutex m_mutex;

    // Delta bruto acumulado (entre Ticks)
    float m_rawAccX = 0.0f;
    float m_rawAccY = 0.0f;

    // Velocidade ATUAL do analógico (estado contínuo, NÃO reseta)
    float m_velocityX = 0.0f;
    float m_velocityY = 0.0f;

    // Smoothing buffers (moving average)
    static constexpr int MAX_SMOOTH_SAMPLES = 10;
    std::array<float, MAX_SMOOTH_SAMPLES> m_smoothBufferX{};
    std::array<float, MAX_SMOOTH_SAMPLES> m_smoothBufferY{};
    int m_smoothIndex = 0;
    int m_smoothCount = 0;

    // Tempo desde último input (para decay)
    using Clock = std::chrono::steady_clock;
    Clock::time_point m_lastInputTime;
    float m_idleTime = 0.0f; // em segundos

    // Debug
    mutable DebugState m_debugState{};
};
