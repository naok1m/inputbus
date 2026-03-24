# ✅ Checklist de Implementação - InputBus v2.0

Use este checklist para rastrear o progresso da migração para o sistema refatorado.

---

## 📋 FASE 1: PREPARAÇÃO

### Backup e Organização

- [ ] **Criar backup** do código atual
  ```bash
  cd /c/InputBus
  git commit -am "Backup before v2 migration" || cp -r . ../InputBus_backup
  ```

- [ ] **Verificar dependências instaladas**
  - [ ] ViGEmBus driver instalado
  - [ ] CMake ≥ 3.15
  - [ ] Visual Studio 2022 ou MinGW
  - [ ] nlohmann/json library

- [ ] **Ler documentação**
  - [ ] `TECHNICAL_ANALYSIS.md` (entender problemas)
  - [ ] `MIGRATION_GUIDE.md` (entender mudanças)
  - [ ] `README_V2.md` (entender uso)

---

## 📦 FASE 2: COPIAR ARQUIVOS NOVOS

### Core - Input System

- [ ] **Copiar `RawInputHandler_v2.h`** → `core/src/input/`
- [ ] **Copiar `RawInputHandler_v2.cpp`** → `core/src/input/`

### Core - Mouse Processor

- [ ] **Copiar `MouseAnalogProcessor_v2.h`** → `core/src/vigem/`
- [ ] **Copiar `MouseAnalogProcessor_v2.cpp`** → `core/src/vigem/`

### Core - Main

- [ ] **Copiar `main_v2.cpp`** → `core/src/`

### Profiles

- [ ] **Copiar `default_v2.json`** → `profiles/`
- [ ] **Copiar `high_sens_v2.json`** → `profiles/`
- [ ] **Copiar `precision_v2.json`** → `profiles/`

### Build System

- [ ] **Copiar `CMakeLists_v2.txt`** → `core/CMakeLists.txt` (ou renomear)

### Documentação

- [ ] **Copiar `TECHNICAL_ANALYSIS.md`** → raiz do projeto
- [ ] **Copiar `MIGRATION_GUIDE.md`** → raiz do projeto
- [ ] **Copiar `README_V2.md`** → raiz do projeto
- [ ] **Copiar `REFACTORING_SUMMARY.md`** → raiz do projeto

---

## 🔧 FASE 3: CONFIGURAÇÃO DE BUILD

### Atualizar CMakeLists.txt

- [ ] **Verificar `CMakeLists.txt`** contém:
  ```cmake
  option(USE_V2_SYSTEM "Use refactored v2 system (recommended)" ON)
  ```

- [ ] **Verificar arquivos `_v2` na lista de sources**
  ```cmake
  src/input/RawInputHandler_v2.cpp
  src/input/RawInputHandler_v2.h
  src/vigem/MouseAnalogProcessor_v2.cpp
  src/vigem/MouseAnalogProcessor_v2.h
  src/main_v2.cpp
  ```

- [ ] **Verificar exclusão de arquivos antigos** (se BUILD_V2=ON)
  - NÃO incluir: `inputCapture.cpp/h`
  - NÃO incluir: `MouseAnalogProcessor.cpp/h` (sem _v2)
  - NÃO incluir: `main.cpp` (sem _v2)

---

## 🏗️ FASE 4: COMPILAÇÃO

### Build

- [ ] **Limpar build anterior**
  ```bash
  cd /c/InputBus
  rm -rf build
  mkdir build && cd build
  ```

- [ ] **Configurar CMake**
  ```bash
  cmake .. -G "Visual Studio 17 2022" -A x64 -DUSE_V2_SYSTEM=ON
  ```
  OU (MinGW):
  ```bash
  cmake .. -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release -DUSE_V2_SYSTEM=ON
  ```

- [ ] **Compilar**
  ```bash
  cmake --build . --config Release
  ```

- [ ] **Verificar executável criado**
  - [ ] `build/Release/InputBusCore.exe` existe
  - [ ] Tamanho: ~500KB - 1MB
  - [ ] Não há erros de linking

### Verificar Output

- [ ] **Console deve mostrar**:
  ```
  -- Building with v2 refactored system
  -- Copying profiles to output directory
  ```

---

## 🧪 FASE 5: TESTE INICIAL

### Setup

- [ ] **Navegar para pasta de output**
  ```bash
  cd /c/InputBus/build/Release
  ```

- [ ] **Verificar arquivos**
  - [ ] `InputBusCore.exe` existe
  - [ ] `profiles/default_v2.json` existe
  - [ ] `ViGEmClient.dll` existe (ou linkado estaticamente)

### Execução

- [ ] **Executar pela primeira vez**
  ```bash
  ./InputBusCore.exe
  ```

- [ ] **Verificar output no console**:
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

- [ ] **Sem erros no console**

---

## 🎮 FASE 6: TESTES FUNCIONAIS

### Teste 1: Controlador Virtual

- [ ] **Abrir `joy.cpl` (Windows + R → joy.cpl)**
- [ ] **Verificar "Xbox 360 Controller" aparece**
- [ ] **Abrir propriedades do controlador**
- [ ] **Stick direito está centralizado (0, 0)**

### Teste 2: Ativação de Captura

- [ ] **Pressionar F12**
- [ ] **Console mostra**: `[Capture] ATIVADO (F12)`
- [ ] **Pressionar F12 novamente**
- [ ] **Console mostra**: `[Capture] DESATIVADO (F12)`

### Teste 3: Movimento do Mouse → Stick Direito

**Com captura ATIVADA (F12):**

- [ ] **Mover mouse para direita**
  - [ ] Stick direito em `joy.cpl` move para direita
  - [ ] Mantém posição por ~100-150ms após parar
  - [ ] Retorna suavemente ao centro

- [ ] **Mover mouse para esquerda**
  - [ ] Stick move para esquerda
  - [ ] Comportamento suave

- [ ] **Mover mouse para cima**
  - [ ] Stick move para cima (ou baixo, dependendo de inversão)
  - [ ] Comportamento suave

- [ ] **Movimento diagonal (direita + cima)**
  - [ ] Stick move diagonalmente
  - [ ] Velocidade similar a horizontal/vertical (normalizado)

### Teste 4: Controle Fino

- [ ] **Movimento MUITO lento do mouse**
  - [ ] Stick responde com precisão
  - [ ] Valores pequenos (não satura instantaneamente)
  - [ ] Possível fazer micro-ajustes

### Teste 5: Sem Drift

- [ ] **Mouse completamente parado**
  - [ ] Stick em exatamente (0, 0)
  - [ ] Não oscila ou se move sozinho
  - [ ] Permanece estável por 10+ segundos

### Teste 6: Teclas → Stick Esquerdo

- [ ] **Pressionar W** → Stick esquerdo para cima
- [ ] **Pressionar S** → Stick esquerdo para baixo
- [ ] **Pressionar A** → Stick esquerdo para esquerda
- [ ] **Pressionar D** → Stick esquerdo para direita
- [ ] **Diagonal (W+D)** → Stick diagonal (normalizado)

### Teste 7: Botões

- [ ] **Space** → Botão A acende em `joy.cpl`
- [ ] **LMB (botão esquerdo do mouse)** → RT (trigger direito)
- [ ] **RMB (botão direito do mouse)** → LT (trigger esquerdo)

---

## 🎯 FASE 7: AJUSTE DE CONFIGURAÇÃO

### Testar Perfis

- [ ] **Parar InputBusCore** (Ctrl+C)

- [ ] **Editar `profiles/default_v2.json`**
  - [ ] Alterar `sensitivityX` para `4.0`
  - [ ] Salvar

- [ ] **Reiniciar InputBusCore**

- [ ] **Verificar movimento mais rápido**
  - [ ] Mouse move mesma distância → stick vai mais longe

### Customizar para seu Uso

- [ ] **Ajustar sensitivity** conforme preferência
  - Muito lento? → Aumentar `sensitivityX/Y` (tente 4.0 - 6.0)
  - Muito rápido? → Reduzir `sensitivityX/Y` (tente 1.5 - 2.0)

- [ ] **Ajustar smoothing** se necessário
  - Movimento jittery? → Aumentar `smoothSamples` (5-7)
  - Lag perceptível? → Reduzir `smoothSamples` (2-3)

- [ ] **Ajustar decay** se necessário
  - Retorna muito rápido? → Aumentar `decayDelay` (150-200ms)
  - Retorna muito lento? → Reduzir `decayDelay` (60-80ms)

---

## 🐛 FASE 8: TROUBLESHOOTING

### Se algo não funciona:

#### Problema: "ViGEm connection failed"

- [ ] **Verificar ViGEmBus driver instalado**
  - Download: https://github.com/ViGEm/ViGEmBus/releases
  - Instalar e reiniciar PC

- [ ] **Verificar Device Manager**
  - "Nefarius Virtual Gamepad Emulation Bus" deve estar presente

#### Problema: "Movimento não funciona"

- [ ] **Captura está ATIVADA?**
  - Pressionar F12 (verificar console)

- [ ] **Verificar em joy.cpl**
  - Stick se move ao mover mouse?

- [ ] **Verificar console**
  - Há mensagens de erro?

#### Problema: "Stick ainda retorna instantaneamente"

- [ ] **Verificar se está usando código v2**
  - Console deve mostrar: `InputBus v2.0`
  - Verificar CMakeLists.txt: `USE_V2_SYSTEM=ON`

- [ ] **Recompilar do zero**
  ```bash
  rm -rf build && mkdir build && cd build
  cmake .. -DUSE_V2_SYSTEM=ON
  cmake --build . --config Release
  ```

#### Problema: "Movimento muito sensível"

- [ ] **Reduzir sensitivity no perfil**
  ```json
  "sensitivityX": 1.5,
  "sensitivityY": 1.5
  ```

- [ ] **Ou ajustar `PIXEL_TO_NORMALIZED`** em `MouseAnalogProcessor_v2.cpp:27`

#### Problema: "Raw Input não captura"

- [ ] **Executar como Administrador**
  ```bash
  # Right-click → Run as Administrator
  ```

- [ ] **Verificar antivírus/firewall**
  - Pode estar bloqueando input capture

---

## ✅ FASE 9: VALIDAÇÃO FINAL

### Checklist de Qualidade:

- [ ] **Retorno ao centro é SUAVE** (não instantâneo)
- [ ] **Movimento é ESTÁVEL** (sem flickering)
- [ ] **Drift está ELIMINADO** (stick em 0 quando mouse parado)
- [ ] **Controle fino FUNCIONA** (micro-movimentos precisos)
- [ ] **Diagonal NORMALIZADO** (mesma velocidade que X/Y)
- [ ] **Performance é BOA** (CPU < 2%, latência < 2ms)

### Se TODOS ✅:

**🎉 SUCESSO! Sistema v2 implementado corretamente.**

---

## 📈 FASE 10: OTIMIZAÇÃO (OPCIONAL)

### Melhorias Avançadas:

- [ ] **Criar perfis específicos por jogo**
  - FPS rápido (Doom, Quake) → `high_sens_v2.json`
  - FPS tático (CS:GO, Valorant) → `precision_v2.json`
  - Aventura (Dark Souls) → `default_v2.json`

- [ ] **Adicionar logs de telemetria** (debug)
  ```cpp
  std::cout << "Velocity: (" << m_velocityX << ", " << m_velocityY << ")\n";
  ```

- [ ] **Implementar profile switcher** (hotkey)
  - Ex: F9/F10 para trocar perfis

- [ ] **Adicionar UI de configuração** (opcional)
  - Sliders para ajustar sensitivity em tempo real

---

## 📞 SUPORTE

### Recursos:

- **Análise técnica:** `TECHNICAL_ANALYSIS.md`
- **Guia de migração:** `MIGRATION_GUIDE.md`
- **Manual de uso:** `README_V2.md`
- **Resumo executivo:** `REFACTORING_SUMMARY.md`

### Debug:

Se precisar investigar problemas:

1. **Adicionar logs** em pontos críticos:
   ```cpp
   std::cout << "[DEBUG] AddDelta: " << dx << ", " << dy << "\n";
   std::cout << "[DEBUG] Velocity: " << m_velocityX << ", " << m_velocityY << "\n";
   std::cout << "[DEBUG] Output: " << outX << ", " << outY << "\n";
   ```

2. **Verificar valores** em `joy.cpl` Properties

3. **Comparar** com sistema antigo (se necessário)

---

## 🎊 CONCLUSÃO

Ao completar este checklist:

✅ Sistema refatorado implementado
✅ Todos bugs corrigidos
✅ Performance otimizada
✅ Configuração personalizada
✅ Qualidade profissional alcançada

**Parabéns! Você transformou um protótipo em um sistema de input de nível ReWASD.** 🚀
