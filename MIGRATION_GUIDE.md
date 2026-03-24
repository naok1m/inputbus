# 🚀 Guia de Migração - InputBus v2.0

## 📋 SUMÁRIO

Este guia explica como migrar do sistema antigo para o sistema refatorado v2.0.

---

## 🔴 PROBLEMAS CORRIGIDOS

### Problemas Críticos Resolvidos:

| # | Problema Original | Causa | Solução Implementada |
|---|-------------------|-------|---------------------|
| **1** | **Retorno instantâneo ao centro** | Acumulador zerado a cada tick | Velocidade como estado contínuo |
| **2** | **Aceleração excessiva** | Ganho fixo mal calibrado (0.16) | Sistema de aceleração/desaceleração |
| **3** | **Flickering / Instabilidade** | Smoothing no lugar errado | Smoothing no input + normalização correta |
| **4** | **Drift** | Sem anti-jitter threshold | Threshold de 0.3-0.5px configurável |
| **5** | **Movimento limitado** | Screen coordinates (hook) | Raw Input API (delta relativo puro) |
| **6** | **Decay instantâneo** | Decay de 5ms + taxa 0.95 | Delay de 80-150ms + taxa exponencial |
| **7** | **Curva quebrada** | powf com valores negativos | Preservação de sinal correta |
| **8** | **Não frame-rate independent** | DeltaTime ignorado | DeltaTime usado em aceleração/decay |

---

## 📂 ARQUIVOS NOVOS vs ANTIGOS

### Core Refatorado:

```
core/src/vigem/
├── MouseAnalogProcessor.cpp      (ANTIGO - NÃO USAR)
├── MouseAnalogProcessor.h        (ANTIGO - NÃO USAR)
├── MouseAnalogProcessor_v2.cpp   (NOVO ✅)
└── MouseAnalogProcessor_v2.h     (NOVO ✅)

core/src/input/
├── inputCapture.cpp              (ANTIGO - screen coords)
├── inputCapture.h                (ANTIGO - screen coords)
├── RawInputHandler.cpp           (ANTIGO - stub/incompleto)
├── RawInputHandler.h             (ANTIGO - stub/incompleto)
├── RawInputHandler_v2.cpp        (NOVO ✅ - Raw Input API)
└── RawInputHandler_v2.h          (NOVO ✅ - Raw Input API)

core/src/
├── main.cpp                      (ANTIGO - hooks)
└── main_v2.cpp                   (NOVO ✅ - Raw Input + loop refatorado)

profiles/
├── default.json                  (ANTIGO - parâmetros v1)
├── fps.json                      (ANTIGO - parâmetros v1)
├── default_v2.json               (NOVO ✅)
├── high_sens_v2.json             (NOVO ✅)
└── precision_v2.json             (NOVO ✅)
```

---

## 🔧 MUDANÇAS NA API

### 1. AnalogCurveConfig (MouseAnalogProcessor)

**ANTES (v1):**
```cpp
struct AnalogCurveConfig {
    float sensitivity    = 1.0f;
    float exponent       = 1.5f;
    float maxSpeed       = 1.0f;
    float deadzone       = 0.05f;
    int   smoothSamples  = 1;
};
```

**DEPOIS (v2):**
```cpp
struct AnalogCurveConfig {
    // Sensitivity separada X/Y
    float sensitivityX       = 2.5f;
    float sensitivityY       = 2.5f;

    // Curva de resposta melhorada
    float exponent           = 1.0f;
    float minCurveThreshold  = 0.1f;

    // Controle de velocidade
    float maxSpeed           = 1.0f;
    float acceleration       = 8.0f;
    float deceleration       = 12.0f;

    // Deadzone + anti-jitter
    float deadzone           = 0.02f;
    float jitterThreshold    = 0.5f;

    // Smoothing aprimorado
    int   smoothSamples      = 3;
    float smoothFactor       = 0.3f;

    // Decay configurável
    float decayDelay         = 80.0f;  // ms
    float decayRate          = 4.5f;

    // Opções avançadas
    bool  normalizeVector    = true;
    bool  independentAxes    = false;
};
```

### 2. Input Capture

**ANTES (v1):**
```cpp
// Usava InputCapture com hooks (WH_MOUSE_LL)
InputCapture::Get().Start([](const InputEvent& evt) { ... });
```

**DEPOIS (v2):**
```cpp
// Usa RawInputHandler com WM_INPUT
RawInputHandler::Get().Start([](const RawInputEvent& evt) { ... });

// Configuração
RawInputHandler::Config cfg;
cfg.captureKeyboard = true;
cfg.captureMouse = true;
cfg.backgroundCapture = false;
RawInputHandler::Get().SetConfig(cfg);
```

### 3. Loop de Atualização

**ANTES (v1):**
```cpp
g_mouseProc.Tick(0.001f, rx, ry);  // DeltaTime fixo (ignorado)
```

**DEPOIS (v2):**
```cpp
float deltaTime = /* tempo real desde último frame */;
g_mouseProc.Tick(deltaTime, rx, ry);  // DeltaTime usado corretamente
```

---

## 🛠️ INSTRUÇÕES DE COMPILAÇÃO

### Passo 1: Atualizar CMakeLists.txt

Adicione os novos arquivos ao seu `CMakeLists.txt`:

```cmake
# core/CMakeLists.txt

add_executable(InputBusCore
    # ... outros arquivos ...

    # NOVO: Processador v2
    src/vigem/MouseAnalogProcessor_v2.cpp
    src/vigem/MouseAnalogProcessor_v2.h

    # NOVO: Raw Input v2
    src/input/RawInputHandler_v2.cpp
    src/input/RawInputHandler_v2.h

    # NOVO: Main v2
    src/main_v2.cpp

    # ... resto ...
)

# ou, se preferir renomear:
# Renomeie main_v2.cpp → main.cpp (após backup do antigo)
```

### Passo 2: Compilar

```bash
cd /c/InputBus
mkdir -p build && cd build
cmake .. -G "Visual Studio 17 2022" -A x64
cmake --build . --config Release
```

### Passo 3: Testar

```bash
cd /c/InputBus/build/Release
./InputBusCore.exe
```

**Output esperado:**
```
==========================================================
  InputBus v2.0 - Mouse-to-Analog Refactored System
==========================================================

[ViGEm] Conectando ao ViGEmBus...
[ViGEm] Conectado com sucesso!
[Profile] Carregando perfil padrão...
[Profile] Perfil carregado: FPS - Balanced (v2)
[IPC] Iniciando servidor de comunicação...
[IPC] Servidor iniciado.
[Update] Iniciando loop de atualização a 1000Hz...
[RawInput] Iniciando captura de input...
           Pressione F12 para habilitar/desabilitar captura.

[Main] Sistema operacional. Pressione Ctrl+C para sair.
==========================================================
```

---

## ⚙️ CONFIGURAÇÃO DE PERFIS

### Perfis Incluídos:

1. **default_v2.json** - Balanceado para FPS geral
   - Sensitivity: 2.8
   - Smoothing: 3 samples
   - Decay: 120ms

2. **high_sens_v2.json** - Alta sensibilidade (flick shots)
   - Sensitivity: 4.2
   - Smoothing: 2 samples
   - Decay: 80ms

3. **precision_v2.json** - Precisão (sniper)
   - Sensitivity: 1.5
   - Smoothing: 5 samples
   - Decay: 150ms

### Ajuste Fino (via IPC ou perfil JSON):

```json
{
    "mouse": {
        "sensitivityX": 2.8,        // Multiplicador X (0.1 - 50.0)
        "sensitivityY": 2.8,        // Multiplicador Y (0.1 - 50.0)
        "exponent": 1.1,            // Curva (1.0 = linear, >1 = exponencial)
        "acceleration": 10.0,       // Velocidade de aceleração (5.0 - 20.0)
        "deceleration": 15.0,       // Velocidade de desaceleração (5.0 - 25.0)
        "decayDelay": 120.0,        // Tempo antes de começar decay (ms)
        "decayRate": 5.5,           // Velocidade de retorno ao centro
        "jitterThreshold": 0.3,     // Ignora movimentos < 0.3px
        "smoothSamples": 3          // Moving average window (1-10)
    }
}
```

---

## 🎯 TESTANDO A CORREÇÃO

### Teste 1: Retorno ao Centro

**ESPERADO:**
- Mova o mouse rapidamente
- Pare de mover
- Stick deve **manter posição** por ~120ms
- Depois, retornar **suavemente** ao centro em ~200-300ms

### Teste 2: Movimento Suave

**ESPERADO:**
- Movimentos pequenos → resposta suave e precisa
- Movimentos rápidos → resposta rápida mas sem spikes
- Diagonal → mesma velocidade que horizontal/vertical (normalizado)

### Teste 3: Sem Drift

**ESPERADO:**
- Mouse em repouso → stick em (0, 0)
- Movimento de 1px (ruído) → ignorado (jitterThreshold)

### Teste 4: Controle Fino

**ESPERADO:**
- Movimentos lentos → valores incrementais precisos
- Sem saturação instantânea
- Possível fazer ajustes de mira fina

---

## 🐛 TROUBLESHOOTING

### Problema: Stick ainda retorna instantaneamente

**Causa:** Pode estar usando o código antigo.

**Solução:**
1. Verifique se está compilando `main_v2.cpp`
2. Confirme que `MouseAnalogProcessor_v2` está sendo usado
3. Verifique no debugger: `m_velocityX/Y` deve manter valor entre frames

### Problema: Movimento muito lento

**Causa:** Sensitivity muito baixa ou PIXEL_TO_NORMALIZED inadequado.

**Solução:**
1. Aumente `sensitivityX/Y` no perfil (tente 4.0 - 6.0)
2. Ou ajuste `PIXEL_TO_NORMALIZED` em MouseAnalogProcessor_v2.cpp:27

### Problema: Movimento não suave

**Causa:** Smoothing insuficiente ou polling rate baixo.

**Solução:**
1. Aumente `smoothSamples` (tente 5)
2. Verifique se o loop está rodando a 1000Hz (adicione log de FPS)

### Problema: Raw Input não captura mouse

**Causa:** Permissões ou ViGEm interferindo.

**Solução:**
1. Execute como Administrador
2. Verifique se não há outro software capturando input (Razer Synapse, etc.)
3. Adicione log em `ProcessMouseInput()` para confirmar recebimento

---

## 📈 PERFORMANCE

### Métricas Esperadas:

- **Latência de input:** ~1-2ms (Raw Input)
- **Update rate:** 1000Hz (1ms por tick)
- **CPU usage:** <1% em CPU moderna (single core)
- **Smoothness:** Zero frame hitching

### Profiling:

Se necessário otimizar:
1. Remova logs de console (std::cout)
2. Use `std::chrono::high_resolution_clock` no loop
3. Desabilite smoothing se latência for crítica

---

## ✅ CHECKLIST DE MIGRAÇÃO

- [ ] Backup do código antigo
- [ ] Copiar arquivos `_v2.*` para projeto
- [ ] Atualizar CMakeLists.txt
- [ ] Compilar sem erros
- [ ] Copiar perfis `*_v2.json` para pasta `profiles/`
- [ ] Testar retorno ao centro (deve manter posição)
- [ ] Testar movimento suave (sem flickering)
- [ ] Testar drift (mouse em repouso = stick em 0)
- [ ] Ajustar sensitivity no perfil
- [ ] Testar com jogo real

---

## 🚀 PRÓXIMOS PASSOS (OPCIONAL)

### Melhorias Futuras:

1. **Curvas customizadas por perfil**
   - Bezier curves
   - Lookup tables

2. **Calibração automática**
   - Detectar DPI do mouse
   - Auto-ajustar PIXEL_TO_NORMALIZED

3. **Multiple analog sources**
   - Gyro (Steam Deck, DualShock)
   - Trackpad

4. **UI para ajuste em tempo real**
   - Slider de sensitivity
   - Visualização de curva
   - Telemetria de movimento

5. **Gerenciamento de profiles avançado**
   - Profile per-game (via executable name)
   - Switching automático

---

## 📞 SUPORTE

Se encontrar bugs ou tiver dúvidas:

1. Verifique este guia primeiro
2. Adicione logs de debug em pontos críticos:
   - `AddDelta()` → confirmar recebimento de input
   - `Tick()` → verificar velocidade e output
   - `ProcessMouseInput()` → confirmar Raw Input funcionando

3. Compare comportamento com sistema antigo (se necessário)

---

**Boa sorte com a migração! O sistema refatorado deve resolver TODOS os problemas relatados.**
