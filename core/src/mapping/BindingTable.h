#pragma once

#include "../vigem/MappingEngine.h"
#include <unordered_map>

using KeyBindingTable = std::unordered_map<uint32_t, Binding>;
using MouseBindingTable = std::unordered_map<int, Binding>;
