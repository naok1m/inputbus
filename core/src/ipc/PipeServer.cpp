#include "PipeServer.h"
#include "Protocol.h"
#include <Windows.h>
#include <algorithm>
#include <thread>
#include <functional>

// ============================================================================
// Helper: overlapped read that blocks until complete (handles ERROR_IO_PENDING)
// ============================================================================
static bool ReadFull(HANDLE pipe, void* buf, DWORD size, OVERLAPPED& ov) {
    DWORD totalRead = 0;
    while (totalRead < size) {
        ResetEvent(ov.hEvent);
        DWORD read = 0;
        BOOL ok = ReadFile(pipe, static_cast<char*>(buf) + totalRead,
                           size - totalRead, &read, &ov);
        if (ok) {
            totalRead += read;
            continue;
        }
        if (GetLastError() != ERROR_IO_PENDING) return false;
        if (!GetOverlappedResult(pipe, &ov, &read, TRUE)) return false;
        totalRead += read;
    }
    return true;
}

// ============================================================================
// Helper: overlapped write with timeout (prevents deadlock on full buffer)
// ============================================================================
static bool WriteFull(HANDLE pipe, const void* buf, DWORD size, OVERLAPPED& ov) {
    ResetEvent(ov.hEvent);
    DWORD written = 0;
    BOOL ok = WriteFile(pipe, buf, size, &written, &ov);
    if (ok) return true;
    if (GetLastError() != ERROR_IO_PENDING) return false;
    // Wait up to 100ms — if client isn't reading, drop this message
    DWORD wait = WaitForSingleObject(ov.hEvent, 100);
    if (wait == WAIT_OBJECT_0) {
        GetOverlappedResult(pipe, &ov, &written, FALSE);
        return true;
    }
    CancelIoEx(pipe, &ov);
    GetOverlappedResult(pipe, &ov, &written, TRUE); // wait for cancel to complete
    return false;
}

// ============================================================================
// SERVER
// ============================================================================

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

            // Use overlapped ConnectNamedPipe so Stop() can cancel it
            OVERLAPPED connectOv{};
            connectOv.hEvent = CreateEvent(nullptr, TRUE, FALSE, nullptr);
            BOOL connected = ConnectNamedPipe(pipe, &connectOv);
            if (!connected) {
                DWORD err = GetLastError();
                if (err == ERROR_IO_PENDING) {
                    // Wait for connection or shutdown
                    WaitForSingleObject(connectOv.hEvent, INFINITE);
                    DWORD dummy;
                    connected = GetOverlappedResult(pipe, &connectOv, &dummy, FALSE);
                } else if (err == ERROR_PIPE_CONNECTED) {
                    connected = TRUE;
                }
            }
            CloseHandle(connectOv.hEvent);

            if (!connected || !m_running) {
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
    OVERLAPPED ov{};
    ov.hEvent = CreateEvent(nullptr, TRUE, FALSE, nullptr);
    if (!ov.hEvent) return;

    while (m_running) {
        MsgHeader hdr{};
        if (!ReadFull(pipe, &hdr, sizeof(hdr), ov)) break;
        if (hdr.magic != 0x52455753) break;

        // Guard against corrupted length
        if (hdr.payloadLen > 1024 * 1024) break;

        std::string payload(hdr.payloadLen, '\0');
        if (hdr.payloadLen > 0) {
            if (!ReadFull(pipe, payload.data(), hdr.payloadLen, ov)) break;
        }

        auto response = handler(hdr.type, payload, pipe);
        if (!response.empty()) {
            Send(pipe, MsgType::StatusResponse, response);
        }
    }

    CloseHandle(ov.hEvent);
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
        // Cancel the accept loop's ConnectNamedPipe
        // Create a dummy connection to unblock it
        HANDLE dummy = CreateFileW(PIPE_NAME, GENERIC_READ | GENERIC_WRITE,
            0, nullptr, OPEN_EXISTING, 0, nullptr);
        if (dummy != INVALID_HANDLE_VALUE) CloseHandle(dummy);

        m_thread.join();
    }
}

void PipeServer::Send(HANDLE pipe, MsgType type, const std::string& payload) {
    std::lock_guard lock(m_sendMutex);

    OVERLAPPED ov{};
    ov.hEvent = CreateEvent(nullptr, TRUE, FALSE, nullptr);
    if (!ov.hEvent) return;

    MsgHeader hdr{};
    hdr.type = type;
    hdr.payloadLen = static_cast<uint32_t>(payload.size());

    bool ok = WriteFull(pipe, &hdr, sizeof(hdr), ov);
    if (ok && !payload.empty()) {
        WriteFull(pipe, payload.data(), hdr.payloadLen, ov);
    }

    CloseHandle(ov.hEvent);
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
