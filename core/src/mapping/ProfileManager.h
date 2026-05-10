#pragma once

#include "../vigem/MappingEngine.h"
#include "../vigem/MouseAnalogProcessor.h"
#include "../vigem/MouseCameraProcessor.h"
#include <nlohmann/json.hpp>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>

class ProfileManager {
public:
    bool Load(const std::string& path, MappingEngine& mapper, MouseAnalogProcessor& mouseProc, MouseCameraConfig* mouseCamera = nullptr) {
        std::ifstream in(path, std::ios::binary);
        if (!in) return false;
        std::ostringstream ss;
        ss << in.rdbuf();
        return LoadFromJson(ss.str(), mapper, mouseProc, mouseCamera);
    }

    bool LoadFromJson(const std::string& jsonPayload, MappingEngine& mapper, MouseAnalogProcessor& mouseProc, MouseCameraConfig* mouseCamera = nullptr) {
        try {
            using json = nlohmann::json;
            auto j = json::parse(jsonPayload);

            mapper.LoadFromJson(jsonPayload);

            AnalogCurveConfig cfg{};
            if (j.contains("mouse")) {
                const auto& m = j["mouse"];

                if (m.contains("mouseDPI"))        cfg.mouseDPI        = m["mouseDPI"].get<float>();
                if (m.contains("sensitivity")) {
                    float s = m["sensitivity"].get<float>();
                    cfg.sensitivityX = cfg.sensitivityY = s;
                }
                if (m.contains("sensitivityX"))    cfg.sensitivityX    = m["sensitivityX"].get<float>();
                if (m.contains("sensitivityY"))    cfg.sensitivityY    = m["sensitivityY"].get<float>();
                if (m.contains("exponent"))        cfg.exponent        = m["exponent"].get<float>();
                if (m.contains("maxSpeed"))        cfg.maxSpeed        = m["maxSpeed"].get<float>();
                if (m.contains("velocityMode"))    cfg.velocityMode    = m["velocityMode"].get<bool>();
                if (m.contains("velocityScale"))   cfg.velocityScale   = m["velocityScale"].get<float>();
                if (m.contains("responseTime"))    cfg.responseTime    = m["responseTime"].get<float>();
                if (m.contains("velocityHoldTime")) cfg.velocityHoldTime = m["velocityHoldTime"].get<float>();
                if (m.contains("stopTime"))        cfg.stopTime        = m["stopTime"].get<float>();
                if (m.contains("deadzone"))        cfg.deadzone        = m["deadzone"].get<float>();
                if (m.contains("smoothingFactor")) cfg.smoothingFactor = m["smoothingFactor"].get<float>();
                if (m.contains("maxStepPerFrame")) cfg.maxStepPerFrame = m["maxStepPerFrame"].get<float>();
                // Legacy compat
                if (m.contains("smoothSamples") && !m.contains("smoothingFactor")) {
                    int samples = m["smoothSamples"].get<int>();
                    cfg.smoothingFactor = (samples <= 1) ? 0.0f : static_cast<float>(samples) * 0.001f;
                }
                if (m.contains("jitterThreshold")) cfg.jitterThreshold = m["jitterThreshold"].get<float>();
                if (m.contains("decayDelay"))      cfg.decayDelay      = m["decayDelay"].get<float>();
                if (m.contains("decayRate"))       cfg.decayRate       = m["decayRate"].get<float>();
                if (m.contains("decayMinStick"))   cfg.decayMinStick   = m["decayMinStick"].get<float>();
                if (m.contains("normalizeVector")) cfg.normalizeVector = m["normalizeVector"].get<bool>();

                // Acceleration curve: array of {speed, multiplier} points
                if (m.contains("accelCurve") && m["accelCurve"].is_array()) {
                    const auto& arr = m["accelCurve"];
                    cfg.accelPointCount = std::min(static_cast<int>(arr.size()), MAX_ACCEL_POINTS);
                    for (int i = 0; i < cfg.accelPointCount; ++i) {
                        const auto& pt = arr[i];
                        cfg.accelCurve[i].speed      = pt.value("speed", 0.0f);
                        cfg.accelCurve[i].multiplier  = pt.value("mult",  1.0f);
                    }
                }
            }
            mouseProc.UpdateConfig(cfg);

            if (mouseCamera && j.contains("mouseCamera")) {
                const auto& c = j["mouseCamera"];
                if (c.contains("nativeMouseCameraEnabled")) mouseCamera->nativeMouseCameraEnabled = c["nativeMouseCameraEnabled"].get<bool>();
                if (c.contains("enabled"))                  mouseCamera->nativeMouseCameraEnabled = c["enabled"].get<bool>();
                if (c.contains("mouseCameraSensitivityX"))  mouseCamera->mouseCameraSensitivityX = c["mouseCameraSensitivityX"].get<float>();
                if (c.contains("mouseCameraSensitivityY"))  mouseCamera->mouseCameraSensitivityY = c["mouseCameraSensitivityY"].get<float>();
                if (c.contains("sensitivityX"))             mouseCamera->mouseCameraSensitivityX = c["sensitivityX"].get<float>();
                if (c.contains("sensitivityY"))             mouseCamera->mouseCameraSensitivityY = c["sensitivityY"].get<float>();
                if (c.contains("mouseCameraDeadzone"))      mouseCamera->mouseCameraDeadzone = c["mouseCameraDeadzone"].get<float>();
                if (c.contains("deadzone"))                 mouseCamera->mouseCameraDeadzone = c["deadzone"].get<float>();
                if (c.contains("mouseCameraCurve"))         mouseCamera->mouseCameraCurve = c["mouseCameraCurve"].get<float>();
                if (c.contains("curve"))                    mouseCamera->mouseCameraCurve = c["curve"].get<float>();
                if (c.contains("mouseCameraSmoothing"))     mouseCamera->mouseCameraSmoothing = c["mouseCameraSmoothing"].get<float>();
                if (c.contains("smoothing"))                mouseCamera->mouseCameraSmoothing = c["smoothing"].get<float>();
                if (c.contains("mouseCameraInvertY"))       mouseCamera->mouseCameraInvertY = c["mouseCameraInvertY"].get<bool>();
                if (c.contains("invertY"))                  mouseCamera->mouseCameraInvertY = c["invertY"].get<bool>();
            }

            if (j.contains("profileName"))
                m_currentName = j["profileName"].get<std::string>();

            return true;
        } catch (...) {
            return false;
        }
    }

    const std::string& CurrentName() const { return m_currentName; }

private:
    std::string m_currentName{"default"};
};
