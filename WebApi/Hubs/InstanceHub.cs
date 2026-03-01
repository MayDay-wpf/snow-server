using System.Collections.Concurrent;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace WebApi.Hubs;

/// <summary>
/// 实例连接信息
/// </summary>
public class InstanceConnection
{
    public string ConnectionId { get; set; } = string.Empty;
    public string InstanceId { get; set; } = string.Empty;
    public string InstanceName { get; set; } = string.Empty;
    public string? UserId { get; set; }
    public DateTime ConnectedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastHeartbeat { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// 用户连接管理器
/// </summary>
public class UserConnectionManager
{
    // 用户ID -> 该用户下的所有实例连接
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, InstanceConnection>> _userInstances = new();
    
    // ConnectionId -> InstanceConnection (用于快速查找)
    private readonly ConcurrentDictionary<string, InstanceConnection> _connections = new();

    /// <summary>
    /// 添加实例连接
    /// </summary>
    public void AddConnection(string userId, InstanceConnection connection)
    {
        _connections[connection.ConnectionId] = connection;
        
        var userInstances = _userInstances.GetOrAdd(userId, _ => new ConcurrentDictionary<string, InstanceConnection>());
        userInstances[connection.InstanceId] = connection;
    }

    /// <summary>
    /// 移除连接
    /// </summary>
    public InstanceConnection? RemoveConnection(string connectionId)
    {
        if (_connections.TryRemove(connectionId, out var connection))
        {
            if (connection.UserId != null && _userInstances.TryGetValue(connection.UserId, out var userInstances))
            {
                userInstances.TryRemove(connection.InstanceId, out _);
                
                // 如果用户没有实例了，移除用户条目
                if (userInstances.IsEmpty)
                {
                    _userInstances.TryRemove(connection.UserId, out _);
                }
            }
            return connection;
        }
        return null;
    }

    /// <summary>
    /// 获取用户的所有实例
    /// </summary>
    public List<InstanceConnection> GetUserInstances(string userId)
    {
        if (_userInstances.TryGetValue(userId, out var instances))
        {
            return instances.Values.ToList();
        }
        return new List<InstanceConnection>();
    }

    /// <summary>
    /// 获取所有在线用户及其实例数
    /// </summary>
    public Dictionary<string, int> GetOnlineUsers()
    {
        return _userInstances.ToDictionary(
            x => x.Key,
            x => x.Value.Count
        );
    }

    /// <summary>
    /// 更新心跳时间
    /// </summary>
    public void UpdateHeartbeat(string connectionId)
    {
        if (_connections.TryGetValue(connectionId, out var connection))
        {
            connection.LastHeartbeat = DateTime.UtcNow;
        }
    }

    /// <summary>
    /// 通过连接ID获取实例信息
    /// </summary>
    public InstanceConnection? GetConnection(string connectionId)
    {
        _connections.TryGetValue(connectionId, out var connection);
        return connection;
    }
}

/// <summary>
/// 实例 Hub - 处理第三方实例连接和心跳
/// </summary>
[Authorize]
public class InstanceHub : Hub<IInstanceClient>
{
    private readonly UserConnectionManager _connectionManager;
    private readonly ILogger<InstanceHub> _logger;

    public InstanceHub(UserConnectionManager connectionManager, ILogger<InstanceHub> logger)
    {
        _connectionManager = connectionManager;
        _logger = logger;
    }

    /// <summary>
    /// 第三方实例注册连接
    /// </summary>
    public async Task RegisterInstance(string instanceId, string instanceName)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            _logger.LogWarning("Instance registration failed: User not authenticated");
            throw new HubException("User not authenticated");
        }

        var connection = new InstanceConnection
        {
            ConnectionId = Context.ConnectionId,
            InstanceId = instanceId,
            InstanceName = instanceName,
            UserId = userId,
            ConnectedAt = DateTime.UtcNow,
            LastHeartbeat = DateTime.UtcNow
        };

        _connectionManager.AddConnection(userId, connection);
        _logger.LogInformation("Instance registered: {InstanceId} for user {UserId}", instanceId, userId);

        // 通知该用户的所有 Web 客户端有新实例连接
        await Clients.Group($"user:{userId}").InstanceConnected(new InstanceInfo
        {
            InstanceId = instanceId,
            InstanceName = instanceName,
            ConnectedAt = connection.ConnectedAt
        });

        // 将连接加入用户组，用于广播消息
        await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{userId}");
    }

    /// <summary>
    /// 心跳检测
    /// </summary>
    public async Task Heartbeat()
    {
        _connectionManager.UpdateHeartbeat(Context.ConnectionId);
        await Task.CompletedTask;
    }

    /// <summary>
    /// Web 客户端订阅用户的实例列表更新
    /// </summary>
    public async Task SubscribeToInstances()
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{userId}");
        
        // 立即返回当前实例列表
        var instances = _connectionManager.GetUserInstances(userId);
        await Clients.Caller.InstancesListUpdated(instances.Select(i => new InstanceInfo
        {
            InstanceId = i.InstanceId,
            InstanceName = i.InstanceName,
            ConnectedAt = i.ConnectedAt
        }).ToList());
    }

    /// <summary>
    /// Web 客户端取消订阅
    /// </summary>
    public async Task UnsubscribeFromInstances()
    {
        var userId = Context.UserIdentifier;
        if (!string.IsNullOrEmpty(userId))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"user:{userId}");
        }
    }

    /// <summary>
    /// 请求第三方实例的上下文信息
    /// </summary>
    public async Task RequestContextInfo(string instanceId)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        // 查找目标实例的连接
        var instances = _connectionManager.GetUserInstances(userId);
        var targetInstance = instances.FirstOrDefault(i => i.InstanceId == instanceId);

        if (targetInstance == null)
        {
            _logger.LogWarning("Instance not found: {InstanceId} for user {UserId}", instanceId, userId);
            throw new HubException("Instance not found");
        }

        _logger.LogInformation("Requesting context info from instance: {InstanceId}", instanceId);

        // 向第三方实例发送获取上下文信息的请求
        await Clients.Client(targetInstance.ConnectionId).RequestContextInfo();
    }

    /// <summary>
    /// 第三方实例返回上下文信息
    /// </summary>
    public async Task SendContextInfo(string contextData)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var connection = _connectionManager.GetConnection(Context.ConnectionId);
        if (connection == null)
        {
            _logger.LogWarning("Connection not found for context info response");
            return;
        }

        _logger.LogInformation("Received context info from instance: {InstanceId}", connection.InstanceId);

        // 将上下文信息和实例ID一起发送给该用户的所有 Web 客户端
        await Clients.Group($"user:{userId}").ReceiveContextInfo(connection.InstanceId, contextData);
    }

    /// <summary>
    /// Web 客户端发送消息给第三方实例
    /// </summary>
    public async Task SendMessageToInstance(string instanceId, string message)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        // 查找目标实例的连接
        var instances = _connectionManager.GetUserInstances(userId);
        var targetInstance = instances.FirstOrDefault(i => i.InstanceId == instanceId);

        if (targetInstance == null)
        {
            _logger.LogWarning("Instance not found: {InstanceId} for user {UserId}", instanceId, userId);
            throw new HubException("Instance not found");
        }

        _logger.LogInformation("Sending message to instance: {InstanceId}", instanceId);

        // 向第三方实例发送消息
        await Clients.Client(targetInstance.ConnectionId).ReceiveMessage(message);
    }

    /// <summary>
    /// 第三方实例发送回复消息给 Web 客户端
    /// </summary>
    public async Task SendMessageReply(string replyMessage)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var connection = _connectionManager.GetConnection(Context.ConnectionId);
        if (connection == null)
        {
            _logger.LogWarning("Connection not found for message reply");
            return;
        }

        _logger.LogInformation("Received message reply from instance: {InstanceId}", connection.InstanceId);

        // 将回复消息和实例ID一起发送给该用户的所有 Web 客户端
        await Clients.Group($"user:{userId}").ReceiveMessageReply(connection.InstanceId, replyMessage);
    }

    /// <summary>
    /// 第三方实例通知当前消息处理已完成
    /// </summary>
    public async Task SendMessageProcessingCompleted()
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var connection = _connectionManager.GetConnection(Context.ConnectionId);
        if (connection == null)
        {
            _logger.LogWarning("Connection not found for message processing completed");
            return;
        }

        _logger.LogInformation("Message processing completed from instance: {InstanceId}", connection.InstanceId);

        await Clients.Group($"user:{userId}").ReceiveMessageProcessingCompleted(connection.InstanceId);
    }

    /// <summary>
    /// Web 客户端通知第三方实例中断当前消息处理
    /// </summary>
    public async Task SendInterruptMessageProcessing(string instanceId)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var targetInstance = _connectionManager
            .GetUserInstances(userId)
            .FirstOrDefault(i => i.InstanceId == instanceId);

        if (targetInstance == null)
        {
            _logger.LogWarning("Instance not found for interrupt request: {InstanceId} for user {UserId}", instanceId, userId);
            throw new HubException("Instance not found");
        }

        _logger.LogInformation("Sending interrupt signal to instance: {InstanceId}", instanceId);

        await Clients.Client(targetInstance.ConnectionId).ReceiveInterruptMessageProcessing();
    }

    /// <summary>
    /// Web 客户端通知第三方实例执行 /clear
    /// </summary>
    public async Task SendClearSession(string instanceId)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var targetInstance = _connectionManager
            .GetUserInstances(userId)
            .FirstOrDefault(i => i.InstanceId == instanceId);

        if (targetInstance == null)
        {
            _logger.LogWarning("Instance not found for clear request: {InstanceId} for user {UserId}", instanceId, userId);
            throw new HubException("Instance not found");
        }

        _logger.LogInformation("Sending clear session signal to instance: {InstanceId}", instanceId);

        await Clients.Client(targetInstance.ConnectionId).ReceiveClearSession();
    }

    /// <summary>
    /// Web 客户端强制实例下线
    /// </summary>
    public async Task SendForceOffline(string instanceId)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var targetInstance = _connectionManager
            .GetUserInstances(userId)
            .FirstOrDefault(i => i.InstanceId == instanceId);

        if (targetInstance == null)
        {
            _logger.LogWarning("Instance not found for force offline request: {InstanceId} for user {UserId}", instanceId, userId);
            throw new HubException("Instance not found");
        }

        _logger.LogInformation("Sending force offline signal to instance: {InstanceId}", instanceId);

        await Clients.Client(targetInstance.ConnectionId).ReceiveForceOffline();
    }

    /// <summary>
    /// Web 客户端通知第三方实例回滚到指定用户消息（模拟双击 ESC）
    /// </summary>
    public async Task SendRollbackMessage(string instanceId, int userMessageOrder)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var targetInstance = _connectionManager
            .GetUserInstances(userId)
            .FirstOrDefault(i => i.InstanceId == instanceId);

        if (targetInstance == null)
        {
            _logger.LogWarning("Instance not found for rollback request: {InstanceId} for user {UserId}", instanceId, userId);
            throw new HubException("Instance not found");
        }

        _logger.LogInformation("Sending rollback signal to instance: {InstanceId}, UserMessageOrder: {UserMessageOrder}", instanceId, userMessageOrder);

        await Clients.Client(targetInstance.ConnectionId).ReceiveRollbackMessage(userMessageOrder);
    }

    /// <summary>
    /// Web 客户端通知第三方实例恢复指定会话（非普通消息发送）
    /// </summary>
    public async Task SendResumeSession(string instanceId, string sessionId)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var safeSessionId = sessionId?.Trim();
        if (string.IsNullOrEmpty(safeSessionId))
        {
            throw new HubException("Session ID is required");
        }

        var targetInstance = _connectionManager
            .GetUserInstances(userId)
            .FirstOrDefault(i => i.InstanceId == instanceId);

        if (targetInstance == null)
        {
            _logger.LogWarning("Instance not found for resume request: {InstanceId} for user {UserId}", instanceId, userId);
            throw new HubException("Instance not found");
        }

        _logger.LogInformation("Sending resume session signal to instance: {InstanceId}, SessionId: {SessionId}", instanceId, safeSessionId);

        await Clients.Client(targetInstance.ConnectionId).ReceiveResumeSession(safeSessionId);
    }

    /// <summary>
    /// 第三方实例通知需要回滚文件确认
    /// </summary>
    public async Task NotifyRollbackConfirmationNeeded(string filePathsJson, int notebookCount)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var connection = _connectionManager.GetConnection(Context.ConnectionId);
        if (connection == null)
        {
            _logger.LogWarning("Connection not found for rollback confirmation request");
            return;
        }

        await Clients.Group($"user:{userId}").ReceiveRollbackConfirmationNeeded(
            connection.InstanceId,
            filePathsJson,
            notebookCount
        );
    }

    /// <summary>
    /// 第三方实例通知需要工具二次确认
    /// </summary>
    public async Task NotifyToolConfirmationNeeded(string toolName, string toolArguments, string toolCallId, string? allToolsJson)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var connection = _connectionManager.GetConnection(Context.ConnectionId);
        if (connection == null)
        {
            _logger.LogWarning("Connection not found for tool confirmation request");
            return;
        }

        _logger.LogInformation("Tool confirmation needed from instance: {InstanceId}, toolCallId: {ToolCallId}", connection.InstanceId, toolCallId);

        await Clients.Group($"user:{userId}").ReceiveToolConfirmationNeeded(
            connection.InstanceId,
            toolName,
            toolArguments,
            toolCallId,
            allToolsJson
        );
    }

    /// <summary>
    /// 第三方实例通知需要用户问答交互
    /// </summary>
    public async Task NotifyUserInteractionNeeded(string question, string optionsJson, string toolCallId, bool multiSelect)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var connection = _connectionManager.GetConnection(Context.ConnectionId);
        if (connection == null)
        {
            _logger.LogWarning("Connection not found for user interaction request");
            return;
        }

        _logger.LogInformation("User interaction needed from instance: {InstanceId}, toolCallId: {ToolCallId}", connection.InstanceId, toolCallId);

        await Clients.Group($"user:{userId}").ReceiveUserInteractionNeeded(
            connection.InstanceId,
            question,
            optionsJson,
            toolCallId,
            multiSelect
        );
    }

    /// <summary>
    /// Web 客户端请求实例文件列表
    /// </summary>
    public async Task RequestFileList(string instanceId, string requestId)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var targetInstance = _connectionManager
            .GetUserInstances(userId)
            .FirstOrDefault(i => i.InstanceId == instanceId);

        if (targetInstance == null)
        {
            _logger.LogWarning("Instance not found for file list request: {InstanceId} for user {UserId}", instanceId, userId);
            throw new HubException("Instance not found");
        }

        await Clients.Client(targetInstance.ConnectionId)
            .ReceiveFileListRequest(requestId);
    }

    /// <summary>
    /// Web 客户端请求实例会话列表
    /// </summary>
    public async Task RequestSessionList(string instanceId, string requestId, int page = 0, int pageSize = 20, string? searchQuery = null)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var targetInstance = _connectionManager
            .GetUserInstances(userId)
            .FirstOrDefault(i => i.InstanceId == instanceId);

        if (targetInstance == null)
        {
            _logger.LogWarning("Instance not found for session list request: {InstanceId} for user {UserId}", instanceId, userId);
            throw new HubException("Instance not found");
        }

        var safePage = Math.Max(0, page);
        var safePageSize = Math.Clamp(pageSize, 1, 100);
        await Clients.Client(targetInstance.ConnectionId)
            .ReceiveSessionListRequest(requestId, safePage, safePageSize, searchQuery ?? string.Empty);
    }

    /// <summary>
    /// 实例端回传文件列表到 Web 客户端
    /// </summary>
    public async Task SendFileListResult(string requestId, string fileListJson)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var connection = _connectionManager.GetConnection(Context.ConnectionId);
        if (connection == null)
        {
            _logger.LogWarning("Connection not found for file list response");
            return;
        }

        await Clients.Group($"user:{userId}").ReceiveFileListResult(connection.InstanceId, requestId, fileListJson);
    }


    /// <summary>
    /// 实例端回传会话列表到 Web 客户端
    /// </summary>
    public async Task SendSessionListResult(string requestId, string sessionListJson)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var connection = _connectionManager.GetConnection(Context.ConnectionId);
        if (connection == null)
        {
            _logger.LogWarning("Connection not found for session list response");
            return;
        }

        await Clients.Group($"user:{userId}").ReceiveSessionListResult(connection.InstanceId, requestId, sessionListJson);
    }

    /// <summary>
    /// Web 客户端提交回滚确认结果
    /// </summary>
    public async Task SendRollbackConfirmationResult(string instanceId, bool? rollbackFiles, List<string>? selectedFiles)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var targetInstance = _connectionManager
            .GetUserInstances(userId)
            .FirstOrDefault(i => i.InstanceId == instanceId);

        if (targetInstance == null)
        {
            _logger.LogWarning("Instance not found for rollback confirmation result: {InstanceId} for user {UserId}", instanceId, userId);
            throw new HubException("Instance not found");
        }

        await Clients.Client(targetInstance.ConnectionId)
            .ReceiveRollbackConfirmationResult(new
            {
                rollbackFiles,
                selectedFiles = selectedFiles ?? new List<string>()
            });
    }

    /// <summary>
    /// Web 客户端提交工具二次确认结果
    /// </summary>
    public async Task SendToolConfirmationResult(string instanceId, string toolCallId, string result, string? reason)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var targetInstance = _connectionManager
            .GetUserInstances(userId)
            .FirstOrDefault(i => i.InstanceId == instanceId);

        if (targetInstance == null)
        {
            _logger.LogWarning("Instance not found for tool confirmation result: {InstanceId} for user {UserId}", instanceId, userId);
            throw new HubException("Instance not found");
        }

        await Clients.Client(targetInstance.ConnectionId)
            .ReceiveToolConfirmationResult(new
            {
                toolCallId,
                result,
                reason
            });
    }

    /// <summary>
    /// Web 客户端提交询问结果
    /// </summary>
    public async Task SendUserQuestionResult(string instanceId, string toolCallId, string selected, string? customInput, bool cancelled)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var targetInstance = _connectionManager
            .GetUserInstances(userId)
            .FirstOrDefault(i => i.InstanceId == instanceId);

        if (targetInstance == null)
        {
            _logger.LogWarning("Instance not found for user question result: {InstanceId} for user {UserId}", instanceId, userId);
            throw new HubException("Instance not found");
        }

        await Clients.Client(targetInstance.ConnectionId)
            .ReceiveUserQuestionResult(new
            {
                toolCallId,
                selected,
                customInput,
                cancelled
            });
    }

    /// <summary>
    /// Web 客户端通知第三方实例执行上下文压缩
    /// </summary>
    public async Task SendCompactRequest(string instanceId)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var targetInstance = _connectionManager
            .GetUserInstances(userId)
            .FirstOrDefault(i => i.InstanceId == instanceId);

        if (targetInstance == null)
        {
            _logger.LogWarning("Instance not found for compact request: {InstanceId} for user {UserId}", instanceId, userId);
            throw new HubException("Instance not found");
        }

        _logger.LogInformation("Sending compact request to instance: {InstanceId}", instanceId);

        await Clients.Client(targetInstance.ConnectionId).ReceiveCompactRequest();
    }

    /// <summary>
    /// 第三方实例通知压缩开始
    /// </summary>
    public async Task NotifyCompactStarted()
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var connection = _connectionManager.GetConnection(Context.ConnectionId);
        if (connection == null)
        {
            _logger.LogWarning("Connection not found for compact started notification");
            return;
        }

        _logger.LogInformation("Compact started from instance: {InstanceId}", connection.InstanceId);

        await Clients.Group($"user:{userId}").ReceiveCompactStarted(connection.InstanceId);
    }

    /// <summary>
    /// 第三方实例通知压缩完成
    /// </summary>
    public async Task NotifyCompactCompleted(string resultJson)
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userId))
        {
            throw new HubException("User not authenticated");
        }

        var connection = _connectionManager.GetConnection(Context.ConnectionId);
        if (connection == null)
        {
            _logger.LogWarning("Connection not found for compact completed notification");
            return;
        }

        _logger.LogInformation("Compact completed from instance: {InstanceId}", connection.InstanceId);

        await Clients.Group($"user:{userId}").ReceiveCompactCompleted(connection.InstanceId, resultJson);
    }

    /// <summary>
    /// 连接断开时清理
    /// </summary>
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var connection = _connectionManager.RemoveConnection(Context.ConnectionId);
        if (connection != null && connection.UserId != null)
        {
            _logger.LogInformation("Instance disconnected: {InstanceId} for user {UserId}",
                connection.InstanceId, connection.UserId);

            // 通知 Web 客户端实例断开
            await Clients.Group($"user:{connection.UserId}").InstanceDisconnected(connection.InstanceId);
        }

        await base.OnDisconnectedAsync(exception);
    }
}

/// <summary>
/// 客户端接口 - 定义服务器可以调用的客户端方法
/// </summary>
public interface IInstanceClient
{
    /// <summary>
    /// 有新实例连接
    /// </summary>
    Task InstanceConnected(InstanceInfo instance);

    /// <summary>
    /// 实例断开连接
    /// </summary>
    Task InstanceDisconnected(string instanceId);

    /// <summary>
    /// 实例列表更新
    /// </summary>
    Task InstancesListUpdated(List<InstanceInfo> instances);

    /// <summary>
    /// 请求第三方实例提供上下文信息
    /// </summary>
    Task RequestContextInfo();

    /// <summary>
    /// 接收第三方实例返回的上下文信息
    /// </summary>
    Task ReceiveContextInfo(string instanceId, string contextData);

    /// <summary>
    /// 接收来自 Web 客户端的消息（实例端调用）
    /// </summary>
    Task ReceiveMessage(string message);

    /// <summary>
    /// 接收实例的回复消息（Web 客户端调用）
    /// </summary>
    Task ReceiveMessageReply(string instanceId, string replyMessage);

    /// <summary>
    /// 接收实例消息处理完成通知（Web 客户端调用）
    /// </summary>
    Task ReceiveMessageProcessingCompleted(string instanceId);

    /// <summary>
    /// 接收 Web 发起的中断当前消息处理通知（实例端调用）
    /// </summary>
    Task ReceiveInterruptMessageProcessing();

    /// <summary>
    /// 实例端接收 Web 发起的新建会话指令（/clear）
    /// </summary>
    Task ReceiveClearSession();

    /// <summary>
    /// 实例端接收 Web 发起的消息回滚指令（双击 ESC）
    /// </summary>
    Task ReceiveRollbackMessage(int userMessageOrder);

    /// <summary>
    /// 实例端接收 Web 发起的恢复会话指令
    /// </summary>
    Task ReceiveResumeSession(string sessionId);

    /// <summary>
    /// 实例端接收 Web 发起的强制下线指令
    /// </summary>
    Task ReceiveForceOffline();

    /// <summary>
    /// Web 客户端接收回滚文件确认请求
    /// </summary>
    Task ReceiveRollbackConfirmationNeeded(string instanceId, string filePathsJson, int notebookCount);

    /// <summary>
    /// Web 客户端接收工具二次确认请求
    /// </summary>
    Task ReceiveToolConfirmationNeeded(string instanceId, string toolName, string toolArguments, string toolCallId, string? allToolsJson);

    /// <summary>
    /// Web 客户端接收询问交互请求
    /// </summary>
    Task ReceiveUserInteractionNeeded(string instanceId, string question, string optionsJson, string toolCallId, bool multiSelect);

    /// <summary>
    /// 实例端接收回滚确认结果
    /// </summary>
    Task ReceiveRollbackConfirmationResult(object result);

    /// <summary>
    /// 实例端接收工具二次确认结果
    /// </summary>
    Task ReceiveToolConfirmationResult(object result);

    /// <summary>
    /// 实例端接收询问交互结果
    /// </summary>
    Task ReceiveUserQuestionResult(object result);

    /// <summary>
    /// 实例端接收 Web 发起的文件列表请求
    /// </summary>
    Task ReceiveFileListRequest(string requestId);

    /// <summary>
    /// Web 客户端接收实例返回的文件列表
    /// </summary>
    Task ReceiveFileListResult(string instanceId, string requestId, string fileListJson);

    /// <summary>
    /// 实例端接收 Web 发起的会话列表请求
    /// </summary>
    Task ReceiveSessionListRequest(string requestId, int page, int pageSize, string searchQuery);

    /// <summary>
    /// Web 客户端接收实例返回的会话列表
    /// </summary>
    Task ReceiveSessionListResult(string instanceId, string requestId, string sessionListJson);

    /// <summary>
    /// 实例端接收 Web 发起的上下文压缩请求
    /// </summary>
    Task ReceiveCompactRequest();

    /// <summary>
    /// Web 客户端接收压缩开始通知
    /// </summary>
    Task ReceiveCompactStarted(string instanceId);

    /// <summary>
    /// Web 客户端接收压缩完成通知
    /// </summary>
    Task ReceiveCompactCompleted(string instanceId, string resultJson);
}

/// <summary>
/// 实例信息 DTO
/// </summary>
public class InstanceInfo
{
    public string InstanceId { get; set; } = string.Empty;
    public string InstanceName { get; set; } = string.Empty;
    public DateTime ConnectedAt { get; set; }
}
