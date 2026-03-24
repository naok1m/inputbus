cmake_minimum_required(VERSION 3.20)

project(rewsd_core LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(CORE_SOURCES
	src/main.cpp
	src/input/inputCapture.cpp
	src/input/RawInputHandler.cpp
	src/ipc/PipeServer.cpp
	src/vigem/MappingEngine.cpp
	src/vigem/MouseAnalogProcessor.cpp
	src/vigem/ViGEmManager.cpp
)

add_executable(rewsd_core ${CORE_SOURCES})

target_include_directories(rewsd_core PRIVATE
	${CMAKE_CURRENT_SOURCE_DIR}/src
	${CMAKE_CURRENT_SOURCE_DIR}/third_party/nlohmann
	${CMAKE_CURRENT_SOURCE_DIR}/third_party/ViGEmClient/include
)

target_link_libraries(rewsd_core PRIVATE
	${CMAKE_CURRENT_SOURCE_DIR}/third_party/ViGEmClient/lib/ViGEmClient.lib
	user32
	setupapi
)

target_compile_definitions(rewsd_core PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)