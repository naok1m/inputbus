// MouseAnalogProcessor_v2.cpp
#include "MouseAnalogProcessor_v2.h"
#include <algorithm>
#include <cstring>

// ============================================================================
// CONSTANTES
// ============================================================================

namespace {
    constexpr float EPSILON = 0.00001f;
    constexpr float MAX_VELOCITY = 1.0f; // Velocidade máxima normalizada

    // Conversão pixel → unidades normalizadas
    // Base: 1000 DPI, movimento de 10cm = ~4000 pixels = analógico cheio
    // Ajustável via sensitivity
    constexpr float PIXEL_TO_NORMALIZED = 0.00025f;
}

// ============================================================================
// CONSTRUTOR
// ============================================================================

MouseAnalogProcessor::MouseAnalogProcessor(const AnalogCurveConfig& cfg)
    : m_cfg(cfg)
    , m_lastInputTime(Clock::now())
{
    m_smoothBufferX.fill(0.0f);
    m_smoothBufferY.fill(0.0f);
}

// ============================================================================
// API PÚBLICA
// ============================================================================

void MouseAnalogProcessor::AddDelta(float dx, float dy) {
    std::lock_guard lock(m_mutex);

    // Anti-jitter: ignora micro-movimentos
    if (std::abs(dx) < m_cfg.jitterThreshold) dx = 0.0f;
    if (std::abs(dy) < m_cfg.jitterThreshold) dy = 0.0f;

    if (std::abs(dx) > EPSILON || std::abs(dy) > EPSILON) {
        m_rawAccX += dx;
        m_rawAccY += dy;
        m_lastInputTime = Clock::now();
        m_idleTime = 0.0f;
    }
}

void MouseAnalogProcessor::Tick(float deltaTime, int16_t& outX, int16_t& outY) {
    std::lock_guard lock(m_mutex);

    // ========================================================================
    // 1. LEITURA DO DELTA BRUTO (NÃO ZERA AINDA)
    // ========================================================================

    float rawX = m_rawAccX;
    float rawY = m_rawAccY;

    // Atualiza debug
    m_debugState.rawDeltaX = rawX;
    m_debugState.rawDeltaY = rawY;

    // ========================================================================
    // 2. CONVERSÃO PIXEL → NORMALIZADO
    // ========================================================================

    // Aplica ganho base (separado X/Y) e conversão pixel → normalizado
    float inputX = rawX * PIXEL_TO_NORMALIZED * m_cfg.sensitivityX;
    float inputY = rawY * PIXEL_TO_NORMALIZED * m_cfg.sensitivityY;

    // ========================================================================
    // 3. SMOOTHING DO INPUT (MOVING AVERAGE)
    // ========================================================================

    if (m_cfg.smoothSamples > 1) {
        m_smoothBufferX[m_smoothIndex] = inputX;
        m_smoothBufferY[m_smoothIndex] = inputY;
        m_smoothIndex = (m_smoothIndex + 1) % std::min(m_cfg.smoothSamples, MAX_SMOOTH_SAMPLES);
        m_smoothCount = std::min(m_smoothCount + 1, std::min(m_cfg.smoothSamples, MAX_SMOOTH_SAMPLES));

        // Média
        float sumX = 0.0f, sumY = 0.0f;
        for (int i = 0; i < m_smoothCount; ++i) {
            sumX += m_smoothBufferX[i];
            sumY += m_smoothBufferY[i];
        }
        inputX = sumX / static_cast<float>(m_smoothCount);
        inputY = sumY / static_cast<float>(m_smoothCount);
    }

    m_debugState.smoothedX = inputX;
    m_debugState.smoothedY = inputY;

    // ========================================================================
    // 4. AGORA ZERA O ACUMULADOR (APÓS LER E PROCESSAR)
    // ========================================================================

    m_rawAccX = 0.0f;
    m_rawAccY = 0.0f;

    // ========================================================================
    // 5. ACELERAÇÃO / DESACELERAÇÃO (VELOCIDADE COMO ESTADO CONTÍNUO)
    // ========================================================================

    // Se há input, acelera em direção ao target; se não, desacelera
    float targetVelX = inputX;
    float targetVelY = inputY;

    if (std::abs(inputX) > EPSILON || std::abs(inputY) > EPSILON) {
        // HÁ INPUT: acelera
        float rate = m_cfg.acceleration * deltaTime;
        m_velocityX += (targetVelX - m_velocityX) * std::min(rate, 1.0f);
        m_velocityY += (targetVelY - m_velocityY) * std::min(rate, 1.0f);
    } else {
        // SEM INPUT: desacelera
        m_idleTime += deltaTime;

        if (m_idleTime > (m_cfg.decayDelay / 1000.0f)) {
            // Começou decay
            float decay = std::exp(-m_cfg.decayRate * deltaTime);
            m_velocityX *= decay;
            m_velocityY *= decay;

            // Snap to zero
            if (std::abs(m_velocityX) < 0.001f) m_velocityX = 0.0f;
            if (std::abs(m_velocityY) < 0.001f) m_velocityY = 0.0f;
        } else {
            // Ainda em hold period: mantém velocidade mas desacelera suavemente
            float decelRate = m_cfg.deceleration * deltaTime;
            m_velocityX *= (1.0f - std::min(decelRate * 0.1f, 0.5f));
            m_velocityY *= (1.0f - std::min(decelRate * 0.1f, 0.5f));
        }
    }

    m_debugState.velocityX = m_velocityX;
    m_debugState.velocityY = m_velocityY;
    m_debugState.timeSinceLastInput = m_idleTime * 1000.0f;
    m_debugState.isDecaying = (m_idleTime > (m_cfg.decayDelay / 1000.0f));

    // ========================================================================
    // 6. NORMALIZAÇÃO VETORIAL (OPCIONAL)
    // ========================================================================

    float vx = m_velocityX;
    float vy = m_velocityY;

    if (!m_cfg.independentAxes && m_cfg.normalizeVector) {
        NormalizeVector(vx, vy);
    }

    // Clamp individual
    vx = std::clamp(vx, -MAX_VELOCITY, MAX_VELOCITY);
    vy = std::clamp(vy, -MAX_VELOCITY, MAX_VELOCITY);

    m_debugState.normalizedX = vx;
    m_debugState.normalizedY = vy;

    // ========================================================================
    // 7. DEADZONE CIRCULAR
    // ========================================================================

    float mag = std::sqrt(vx * vx + vy * vy);
    m_debugState.magnitude = mag;

    if (mag < m_cfg.deadzone) {
        vx = vy = 0.0f;
        mag = 0.0f;
    } else {
        // Deadzone com remapeamento suave
        float scale = (mag - m_cfg.deadzone) / (MAX_VELOCITY - m_cfg.deadzone);
        scale = std::clamp(scale, 0.0f, 1.0f);

        if (mag > EPSILON) {
            vx = (vx / mag) * scale;
            vy = (vy / mag) * scale;
            mag = scale;
        }
    }

    // ========================================================================
    // 8. CURVA DE RESPOSTA
    // ========================================================================

    if (mag > m_cfg.minCurveThreshold) {
        float curvedMag = ApplyCurve(mag);

        if (mag > EPSILON) {
            float ratio = curvedMag / mag;
            vx *= ratio;
            vy *= ratio;
        }
    }

    m_debugState.curvedX = vx;
    m_debugState.curvedY = vy;

    // ========================================================================
    // 9. CLAMP FINAL A MAXSPEED
    // ========================================================================

    vx = std::clamp(vx * m_cfg.maxSpeed, -1.0f, 1.0f);
    vy = std::clamp(vy * m_cfg.maxSpeed, -1.0f, 1.0f);

    // ========================================================================
    // 10. CONVERSÃO PARA INT16 (XINPUT RANGE)
    // ========================================================================

    // Y invertido: mouse down = look down = Y negativo no gamepad
    outX = static_cast<int16_t>(vx *  32767.0f);
    outY = static_cast<int16_t>(vy * -32767.0f);
}

void MouseAnalogProcessor::Reset() {
    std::lock_guard lock(m_mutex);

    m_rawAccX = 0.0f;
    m_rawAccY = 0.0f;
    m_velocityX = 0.0f;
    m_velocityY = 0.0f;
    m_idleTime = 0.0f;
    m_smoothIndex = 0;
    m_smoothCount = 0;
    m_smoothBufferX.fill(0.0f);
    m_smoothBufferY.fill(0.0f);
    m_lastInputTime = Clock::now();

    std::memset(&m_debugState, 0, sizeof(m_debugState));
}

void MouseAnalogProcessor::UpdateConfig(const AnalogCurveConfig& cfg) {
    std::lock_guard lock(m_mutex);
    m_cfg = cfg;

    // Valida ranges
    m_cfg.sensitivityX = std::clamp(m_cfg.sensitivityX, 0.1f, 50.0f);
    m_cfg.sensitivityY = std::clamp(m_cfg.sensitivityY, 0.1f, 50.0f);
    m_cfg.exponent = std::clamp(m_cfg.exponent, 0.5f, 3.0f);
    m_cfg.maxSpeed = std::clamp(m_cfg.maxSpeed, 0.1f, 1.0f);
    m_cfg.deadzone = std::clamp(m_cfg.deadzone, 0.0f, 0.3f);
    m_cfg.smoothSamples = std::clamp(m_cfg.smoothSamples, 1, MAX_SMOOTH_SAMPLES);
    m_cfg.jitterThreshold = std::clamp(m_cfg.jitterThreshold, 0.0f, 3.0f);
    m_cfg.decayDelay = std::clamp(m_cfg.decayDelay, 0.0f, 500.0f);
    m_cfg.decayRate = std::clamp(m_cfg.decayRate, 0.5f, 20.0f);
}

MouseAnalogProcessor::DebugState MouseAnalogProcessor::GetDebugState() const {
    std::lock_guard lock(m_mutex);
    return m_debugState;
}

// ============================================================================
// PROCESSAMENTO INTERNO
// ============================================================================

float MouseAnalogProcessor::ApplyCurve(float normalized) const {
    if (normalized < EPSILON) return 0.0f;

    // Power curve que preserva sinal
    float sign = (normalized >= 0.0f) ? 1.0f : -1.0f;
    float abs_val = std::abs(normalized);
    float curved = std::pow(abs_val, m_cfg.exponent);

    return sign * curved;
}

void MouseAnalogProcessor::NormalizeVector(float& x, float& y) const {
    float mag = std::sqrt(x * x + y * y);

    if (mag > MAX_VELOCITY) {
        x = (x / mag) * MAX_VELOCITY;
        y = (y / mag) * MAX_VELOCITY;
    }
}
