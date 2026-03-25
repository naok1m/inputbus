#pragma once

#include "../vigem/MappingEngine.h"
#include "../vigem/MouseAnalogProcessor.h"
#include <nlohmann/json.hpp>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>

class ProfileManager {
public:
    bool Load(const std::string& path, MappingEngine& mapper, MouseAnalogProcessor& mouseProc) {
        std::ifstream in(path, std::ios::binary);
        if (!in) return false;
        std::ostringstream ss;
        ss << in.rdbuf();
        return LoadFromJson(ss.str(), mapper, mouseProc);
    }

    bool LoadFromJson(const std::string& jsonPayload, MappingEngine& mapper, MouseAnalogProcessor& mouseProc) {
        try {
            using json = nlohmann::json;
            auto j = json::parse(jsonPayload);

            mapper.LoadFromJson(jsonPayload);

            AnalogCurveConfig cfg{};
            if (j.contains("mouse")) {
                const auto& m = j["mouse"];

                if (m.contains("sensitivity")) {
                    float s = m["sensitivity"].get<float>();
                    cfg.sensitivityX = cfg.sensitivityY = s;
                }
                if (m.contains("sensitivityX"))    cfg.sensitivityX    = m["sensitivityX"].get<float>();
                if (m.contains("sensitivityY"))    cfg.sensitivityY    = m["sensitivityY"].get<float>();
                if (m.contains("exponent"))        cfg.exponent        = m["exponent"].get<float>();
                if (m.contains("maxSpeed"))        cfg.maxSpeed        = m["maxSpeed"].get<float>();
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
