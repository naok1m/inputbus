#pragma once

#include "Protocol.h"
#include <Windows.h>
#include <atomic>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

class PipeServer {
public:
    using MessageHandler = std::function<std::string(MsgType, const std::string&, HANDLE)>;

    ~PipeServer() { Stop(); }

    void Start(MessageHandler handler);
    void Stop();

    void Send(HANDLE pipe, MsgType type, const std::string& payload);
    void SendToAll(MsgType type, const std::string& payload);

private:
    void HandleClient(HANDLE pipe, MessageHandler handler);
    void RemoveClient(HANDLE pipe);

    std::atomic<bool> m_running{false};
    std::thread m_thread;
    std::mutex m_clientsMutex;
    std::mutex m_sendMutex;
    std::vector<HANDLE> m_clients;
};
