# InputBus v2.0 - Sistema Refatorado de Mouse → Analógico

## 🎮 O QUE É?

Sistema de conversão de input de mouse+teclado para controlador virtual Xbox 360 (via ViGEmBus), com foco em **qualidade profissional** para jogos que requerem controlador.

## ✨ NOVIDADES DA v2.0

### Problemas Corrigidos:
- ✅ **Retorno instantâneo ao centro** → Agora mantém posição suavemente
- ✅ **Aceleração excessiva** → Sistema de aceleração/desaceleração controlado
- ✅ **Flickering** → Movimento suave e estável
- ✅ **Drift** → Completamente eliminado (anti-jitter)
- ✅ **Input limitado** → Raw Input API (delta ilimitado)

### Melhorias Técnicas:
- 🚀 **Raw Input API** → Latência <2ms, delta puro do hardware
- 🎯 **Estado contínuo** → Velocity-based (não reseta)
- ⚙️ **15+ configurações** → Totalmente customizável
- 🔧 **Frame-rate independent** → Comportamento consistente
- 🧵 **Thread-safe** → Sem race conditions

---

## 🚀 INÍCIO RÁPIDO

### 1. Pré-requisitos

- Windows 10/11
- [ViGEmBus Driver](https://github.com/ViGEm/ViGEmBus/releases) instalado
- Visual Studio 2022 ou MinGW com C++17

### 2. Compilar

```bash
cd /c/InputBus
mkdir -p build && cd build
cmake .. -G "Visual Studio 17 2022" -A x64
cmake --build . --config Release
```

### 3. Executar

```bash
cd /c/InputBus/build/Release
./InputBusCore.exe
```

### 4. Usar

1. Pressione **F12** para ativar/desativar captura
2. Mouse → Stick direito (câmera)
3. WASD → Stick esquerdo (movimento)
4. Configuração adicional via `profiles/*.json`

---

## 📋 PERFIS DISPONÍVEIS

### `default_v2.json` - Balanceado
- Sensibilidade: 2.8
- Decay: 120ms
- Smoothing: 3 samples
- **Uso:** FPS geral, jogos de ação

### `high_sens_v2.json` - Alta Sensibilidade
- Sensibilidade: 4.2
- Decay: 80ms
- Smoothing: 2 samples
- **Uso:** Flick shots, movimentos rápidos

### `precision_v2.json` - Precisão/Sniper
- Sensibilidade: 1.5
- Decay: 150ms
- Smoothing: 5 samples
- **Uso:** Mira precisa, snipers, controle fino

---

## ⚙️ CONFIGURAÇÃO

### Parâmetros Principais (JSON):

```json
{
  "mouse": {
    "sensitivityX": 2.8,      // Multiplicador horizontal (0.1 - 50.0)
    "sensitivityY": 2.8,      // Multiplicador vertical (0.1 - 50.0)
    "exponent": 1.1,          // Curva de resposta (1.0 = linear, >1 = exponencial)
    "acceleration": 10.0,     // Velocidade de aceleração (5.0 - 20.0)
    "deceleration": 15.0,     // Velocidade de desaceleração (5.0 - 25.0)
    "decayDelay": 120.0,      // Tempo antes de retornar ao centro (ms)
    "decayRate": 5.5,         // Velocidade de retorno (1.0 - 20.0)
    "deadzone": 0.015,        // Deadzone circular (0.0 - 0.3)
    "jitterThreshold": 0.3,   // Ignora movimentos < X pixels (anti-drift)
    "smoothSamples": 3        // Moving average window (1 - 10)
  }
}
```

### Ajuste Fino:

**Sensibilidade muito baixa?**
→ Aumente `sensitivityX/Y` (tente 4.0 - 6.0)

**Movimento não suave?**
→ Aumente `smoothSamples` (tente 5)

**Retorna ao centro muito rápido?**
→ Aumente `decayDelay` (tente 150-200ms)
→ Reduza `decayRate` (tente 3.0)

**Drift mesmo parado?**
→ Aumente `jitterThreshold` (tente 0.5 - 1.0)

**Resposta muito lenta?**
→ Aumente `acceleration` (tente 15.0)
→ Reduza `smoothSamples` (tente 2)

---

## 🎯 MAPEAMENTO PADRÃO

### Teclado:
- **W/A/S/D** → Stick esquerdo (movimento)
- **Space** → A (pular)
- **Ctrl** → B (agachar)
- **Shift** → X (correr)
- **F** → Y (usar/interagir)
- **Q** → LB (habilidade 1)
- **E** → RB (habilidade 2)
- **R** → RT (recarregar)
- **G** → LT (granada)
- **Tab** → Back
- **Esc** → Start

### Mouse:
- **Movimento** → Stick direito (câmera)
- **LMB** → RT (atirar)
- **RMB** → LT (mirar)
- **MMB** → RS Click (melee)
- **X1** → LS Click
- **X2** → Y (usar)

### Hotkey:
- **F12** → Ativar/desativar captura (panic button)

---

## 📊 DIAGNÓSTICO

### Verificar se está funcionando:

1. **ViGEm conectado?**
   - Console deve mostrar: `[ViGEm] Conectado com sucesso!`
   - Se não: instale ViGEmBus driver

2. **Input sendo capturado?**
   - Pressione F12 (deve mostrar `[Capture] ATIVADO`)
   - Mova mouse e veja telemetria no console

3. **Controlador aparecendo?**
   - Abra `joy.cpl` (Windows)
   - Deve aparecer "Xbox 360 Controller"
   - Teste movendo mouse e pressionando teclas

### Problemas Comuns:

**"ViGEm connection failed"**
→ Instale/reinstale ViGEmBus driver

**"Movimento não funciona"**
→ Pressione F12 para ativar captura
→ Verifique se não há outro software capturando input

**"Movimento muito sensível"**
→ Reduza `sensitivity` no perfil

**"Stick não volta ao centro"**
→ Verifique `decayDelay` e `decayRate` no perfil

---

## 🔧 DESENVOLVIMENTO

### Estrutura de Arquivos:

```
core/src/
├── input/
│   ├── RawInputHandler_v2.cpp     # Captura via WM_INPUT
│   └── RawInputHandler_v2.h
├── vigem/
│   ├── MouseAnalogProcessor_v2.cpp # Conversão mouse → analógico
│   ├── MouseAnalogProcessor_v2.h
│   ├── ViGEmManager.cpp            # Interface ViGEmBus
│   └── ViGEmManager.h
├── mapping/
│   ├── MappingEngine.cpp           # Mapeamento teclas → botões
│   └── MappingEngine.h
└── main_v2.cpp                     # Loop principal
```

### Adicionar novo binding:

Edite `profiles/default_v2.json`:

```json
{
  "keyBindings": {
    "86": { "target": "button", "mask": 2048, "label": "V → Novo Botão" }
  }
}
```

VK Codes: [Microsoft Docs](https://docs.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes)

Button masks (XInput):
- DPAD_UP = 1, DPAD_DOWN = 2, DPAD_LEFT = 4, DPAD_RIGHT = 8
- START = 16, BACK = 32, LS = 64, RS = 128
- LB = 256, RB = 512, A = 4096, B = 8192, X = 16384, Y = 32768

---

## 📚 DOCUMENTAÇÃO ADICIONAL

- **Análise técnica completa:** `TECHNICAL_ANALYSIS.md`
- **Guia de migração:** `MIGRATION_GUIDE.md`
- **Explicação dos algoritmos:** Ver comentários em `MouseAnalogProcessor_v2.cpp`

---

## 🐛 RELATAR BUGS

Se encontrar problemas:

1. Verifique se está usando arquivos `_v2` (não os antigos)
2. Confirme ViGEmBus driver instalado
3. Teste com perfil default_v2.json
4. Adicione logs de debug se necessário

---

## 📄 LICENÇA

Verifique LICENSE.txt no repositório principal.

---

## 🎉 CONTRIBUIR

Pull requests são bem-vindos! Áreas de melhoria:

- Curvas de resposta customizáveis (Bezier)
- Auto-calibração de DPI
- Profile switcher por jogo
- GUI de configuração
- Suporte a gyro (Steam Deck, DualShock)

---

**Transforme sua experiência de mouse+teclado em controle preciso de analógico!** 🎮
