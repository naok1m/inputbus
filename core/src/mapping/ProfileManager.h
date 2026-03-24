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
				if (m.contains("sensitivity")) cfg.sensitivity = m["sensitivity"].get<float>();
				if (m.contains("exponent")) cfg.exponent = m["exponent"].get<float>();
				if (m.contains("maxSpeed")) cfg.maxSpeed = m["maxSpeed"].get<float>();
				if (m.contains("deadzone")) cfg.deadzone = m["deadzone"].get<float>();
				if (m.contains("smoothSamples")) cfg.smoothSamples = m["smoothSamples"].get<int>();
			}
			mouseProc.UpdateConfig(cfg);

			if (j.contains("profileName")) {
				m_currentName = j["profileName"].get<std::string>();
			}
			return true;
		} catch (...) {
			return false;
		}
	}

	const std::string& CurrentName() const { return m_currentName; }

private:
	std::string m_currentName{"default"};
};
