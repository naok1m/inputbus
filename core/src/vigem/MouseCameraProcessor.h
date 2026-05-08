#pragma once

struct MouseCameraConfig {
    bool nativeMouseCameraEnabled = false;

    // Legacy profile/UI fields kept for compatibility. Native mouse mode
    // ignores them and passes the physical mouse directly to the game.
    float mouseCameraSensitivityX = 1.0f;
    float mouseCameraSensitivityY = 1.0f;

    float mouseCameraDeadzone = 0.0f;
    float mouseCameraCurve = 1.0f;
    float mouseCameraSmoothing = 0.0f;

    bool mouseCameraInvertY = false;
};
