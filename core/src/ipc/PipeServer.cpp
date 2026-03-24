#include "PipeServer.h"
#include "Protocol.h"
#include <Windows.h>
#include <algorithm>
#include <thread>
#include <functional>

void PipeServer::Start(MessageHandler handler) {
    m_running = true;
    m_thread = std::thread([this, handler]() {
        while (m_running) {
            HANDLE pipe = CreateNamedPipeW(
                PIPE_NAME,
                PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED,
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
                PIPE_UNLIMITED_INSTANCES,
                65536, 65536,
                0, nullptr
            );

            if (pipe == INVALID_HANDLE_VALUE) break;

            // Wait for client
            BOOL connected = ConnectNamedPipe(pipe, nullptr)
                ? TRUE
                : (GetLastError() == ERROR_PIPE_CONNECTED);
            if (!connected) {
                CloseHandle(pipe);
                continue;
            }

            {
                std::lock_guard lock(m_clientsMutex);
                m_clients.push_back(pipe);
            }

            // Spin a handler thread per client
            std::thread([pipe, handler, this]() {
                HandleClient(pipe, handler);
                RemoveClient(pipe);
                DisconnectNamedPipe(pipe);
                CloseHandle(pipe);
            }).detach();
        }
    });
}

void PipeServer::HandleClient(HANDLE pipe, MessageHandler handler) {
    while (m_running) {
        MsgHeader hdr{};
        DWORD read = 0;
        
        if (!ReadFile(pipe, &hdr, sizeof(hdr), &read, nullptr) || read != sizeof(hdr)) break;
        if (hdr.magic != 0x52455753) break;

        std::string payload(hdr.payloadLen, '\0');
        if (hdr.payloadLen > 0) {
            if (!ReadFile(pipe, payload.data(), hdr.payloadLen, &read, nullptr)) break;
        }

        auto response = handler(hdr.type, payload, pipe);
        if (!response.empty()) {
            Send(pipe, MsgType::StatusResponse, response);
        }
    }
}

void PipeServer::Stop() {
    if (!m_running) return;
    m_running = false;

    std::vector<HANDLE> pipes;
    {
        std::lock_guard lock(m_clientsMutex);
        pipes = m_clients;
    }
    for (HANDLE pipe : pipes) {
        CancelIoEx(pipe, nullptr);
        DisconnectNamedPipe(pipe);
    }

    if (m_thread.joinable()) {
        m_thread.join();
    }
}

void PipeServer::Send(HANDLE pipe, MsgType type, const std::string& payload) {
    std::lock_guard lock(m_sendMutex);
    MsgHeader hdr{};
    hdr.type = type;
    hdr.payloadLen = static_cast<uint32_t>(payload.size());
    DWORD w;
    WriteFile(pipe, &hdr, sizeof(hdr), &w, nullptr);
    if (!payload.empty()) WriteFile(pipe, payload.data(), hdr.payloadLen, &w, nullptr);
}

void PipeServer::SendToAll(MsgType type, const std::string& payload) {
    std::vector<HANDLE> pipes;
    {
        std::lock_guard lock(m_clientsMutex);
        pipes = m_clients;
    }

    for (HANDLE pipe : pipes) {
        Send(pipe, type, payload);
    }
}

void PipeServer::RemoveClient(HANDLE pipe) {
    std::lock_guard lock(m_clientsMutex);
    auto it = std::remove(m_clients.begin(), m_clients.end(), pipe);
    m_clients.erase(it, m_clients.end());
}