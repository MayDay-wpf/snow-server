import * as signalR from "@microsoft/signalr";
import { getConfig } from "../config";
import { getToken } from "../utils/auth";

/**
 * 实例信息
 */
export interface InstanceInfo {
  instanceId: string;
  instanceName: string;
  connectedAt: string;
}

/**
 * Hub 连接状态
 */
export type HubConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

/**
 * 事件回调类型
 */
type InstanceConnectedCallback = (instance: InstanceInfo) => void;
type InstanceDisconnectedCallback = (instanceId: string) => void;
type InstancesListUpdatedCallback = (instances: InstanceInfo[]) => void;
type ConnectionStateChangedCallback = (state: HubConnectionState) => void;
type ContextInfoReceivedCallback = (
  instanceId: string,
  contextData: string
) => void;
type MessageReplyReceivedCallback = (
  instanceId: string,
  replyMessage: string
) => void;
type MessageProcessingCompletedCallback = (instanceId: string) => void;

type ToolConfirmationNeededCallback = (payload: {
  instanceId: string;
  toolName: string;
  toolArguments: string;
  toolCallId: string;
  allToolsJson: string | null;
}) => void;

type UserInteractionNeededCallback = (payload: {
  instanceId: string;
  question: string;
  optionsJson: string;
  toolCallId: string;
  multiSelect: boolean;
}) => void;

type RollbackConfirmationNeededCallback = (payload: {
  instanceId: string;
  filePathsJson: string;
  notebookCount: number;
}) => void;

type FileListReceivedCallback = (payload: {
  instanceId: string;
  requestId: string;
  fileListJson: string;
}) => void;

type SessionListReceivedCallback = (payload: {
  instanceId: string;
  requestId: string;
  sessionListJson: string;
}) => void;

export interface SessionListRequestOptions {
  page?: number;
  pageSize?: number;
  searchQuery?: string;
}

/**
 * InstanceHub 管理类
 * 处理与后端的 SignalR 连接和实例管理
 */
class InstanceHubManager {
  private connection: signalR.HubConnection | null = null;
  private state: HubConnectionState = "disconnected";
  private instances: InstanceInfo[] = []; // 缓存当前实例列表

  // 事件监听器
  private onInstanceConnectedCallbacks: InstanceConnectedCallback[] = [];
  private onInstanceDisconnectedCallbacks: InstanceDisconnectedCallback[] = [];
  private onInstancesListUpdatedCallbacks: InstancesListUpdatedCallback[] = [];
  private onConnectionStateChangedCallbacks: ConnectionStateChangedCallback[] =
    [];
  private onContextInfoReceivedCallbacks: ContextInfoReceivedCallback[] = [];
  private onMessageReplyReceivedCallbacks: MessageReplyReceivedCallback[] = [];
  private onMessageProcessingCompletedCallbacks: MessageProcessingCompletedCallback[] =
    [];
  private onToolConfirmationNeededCallbacks: ToolConfirmationNeededCallback[] =
    [];
  private onUserInteractionNeededCallbacks: UserInteractionNeededCallback[] =
    [];
  private onRollbackConfirmationNeededCallbacks: RollbackConfirmationNeededCallback[] =
    [];
  private onFileListReceivedCallbacks: FileListReceivedCallback[] = [];
  private onSessionListReceivedCallbacks: SessionListReceivedCallback[] = [];
  // 心跳定时器
  private heartbeatInterval: number | null = null;
  private connectPromise: Promise<void> | null = null;

  /**
   * 获取当前连接状态
   */
  getConnectionState(): HubConnectionState {
    return this.state;
  }

  /**
   * 获取当前实例列表
   */
  getInstances(): InstanceInfo[] {
    return [...this.instances];
  }

  /**
   * 设置连接状态
   */
  private setState(newState: HubConnectionState) {
    if (this.state !== newState) {
      this.state = newState;
      this.notifyConnectionStateChanged(newState);
    }
  }

  /**
   * 获取 Hub URL
   */
  private getHubUrl(): string {
    const config = getConfig();
    // 将 /api 替换为空，然后添加 /hubs/instance
    const baseUrl = config.baseUrl.replace(/\/api$/, "");
    return `${baseUrl}/hubs/instance`;
  }

  /**
   * 建立连接
   */
  async connect(): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return;
    }

    // 避免并发 connect 导致创建多条连接并覆盖监听器
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = (async () => {
      const token = getToken();
      if (!token) {
        throw new Error("No authentication token available");
      }

      this.setState("connecting");

      try {
        this.connection = new signalR.HubConnectionBuilder()
          .withUrl(this.getHubUrl(), {
            accessTokenFactory: () => token,
            skipNegotiation: true, // 跳过协商，直接使用 WebSocket
            transport: signalR.HttpTransportType.WebSockets,
          })
          .withAutomaticReconnect({
            nextRetryDelayInMilliseconds: (retryContext) => {
              // 重试延迟策略: 0s, 2s, 4s, 8s, 10s, 10s...
              if (retryContext.previousRetryCount < 3) {
                return Math.pow(2, retryContext.previousRetryCount) * 1000;
              }
              return 10000;
            },
          })
          .configureLogging(signalR.LogLevel.Warning)
          .build();

        // 注册服务端调用客户端的方法
        this.registerHandlers();

        // 监听连接状态变化
        this.connection.onreconnecting(() => {
          this.setState("reconnecting");
        });

        this.connection.onreconnected(() => {
          this.setState("connected");
          // 重新订阅实例列表
          this.subscribeToInstances();
        });

        this.connection.onclose(() => {
          this.setState("disconnected");
          this.stopHeartbeat();
        });

        await this.connection.start();
        this.setState("connected");

        // 启动心跳
        this.startHeartbeat();

        // 订阅实例列表更新
        await this.subscribeToInstances();
      } catch (error) {
        this.setState("error");
        throw error;
      } finally {
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.stopHeartbeat();

    if (this.connection) {
      try {
        await this.connection.stop();
      } catch (error) {
        console.error("Error stopping hub connection:", error);
      }
      this.connection = null;
    }

    this.setState("disconnected");
  }

  /**
   * 注册服务端消息处理器
   */
  private registerHandlers() {
    if (!this.connection) return;

    // 有新实例连接
    this.connection.on("InstanceConnected", (instance: InstanceInfo) => {
      console.log("Instance connected:", instance);
      this.notifyInstanceConnected(instance);
    });

    // 实例断开连接
    this.connection.on("InstanceDisconnected", (instanceId: string) => {
      console.log("Instance disconnected:", instanceId);
      // 从缓存中移除断开的实例
      this.instances = this.instances.filter(
        (inst) => inst.instanceId !== instanceId
      );
      console.log("Updated instances cache after disconnect:", this.instances);
      this.notifyInstanceDisconnected(instanceId);
    });

    // 实例列表更新
    this.connection.on("InstancesListUpdated", (instances: InstanceInfo[]) => {
      console.log("Instances list updated:", instances);
      this.instances = instances; // 更新缓存
      this.notifyInstancesListUpdated(instances);
    });

    // 接收上下文信息
    this.connection.on(
      "ReceiveContextInfo",
      (instanceId: string, contextData: string) => {
        console.log(
          "Received context info from instance:",
          instanceId,
          contextData
        );
        this.notifyContextInfoReceived(instanceId, contextData);
      }
    );

    // 接收实例的回复消息
    this.connection.on(
      "ReceiveMessageReply",
      (instanceId: string, replyMessage: string) => {
        console.log(
          "Received message reply from instance:",
          instanceId,
          replyMessage
        );
        this.notifyMessageReplyReceived(instanceId, replyMessage);
      }
    );

    this.connection.on(
      "ReceiveMessageProcessingCompleted",
      (instanceId: string) => {
        console.log("Message processing completed from instance:", instanceId);
        this.notifyMessageProcessingCompleted(instanceId);
      }
    );

    this.connection.on(
      "ReceiveToolConfirmationNeeded",
      (
        instanceId: string,
        toolName: string,
        toolArguments: string,
        toolCallId: string,
        allToolsJson: string | null
      ) => {
        this.notifyToolConfirmationNeeded({
          instanceId,
          toolName,
          toolArguments,
          toolCallId,
          allToolsJson,
        });
      }
    );

    this.connection.on(
      "ReceiveUserInteractionNeeded",
      (
        instanceId: string,
        question: string,
        optionsJson: string,
        toolCallId: string,
        multiSelect: boolean
      ) => {
        this.notifyUserInteractionNeeded({
          instanceId,
          question,
          optionsJson,
          toolCallId,
          multiSelect,
        });
      }
    );

    this.connection.on(
      "ReceiveRollbackConfirmationNeeded",
      (instanceId: string, filePathsJson: string, notebookCount: number) => {
        this.notifyRollbackConfirmationNeeded({
          instanceId,
          filePathsJson,
          notebookCount,
        });
      }
    );

    this.connection.on(
      "ReceiveFileListResult",
      (instanceId: string, requestId: string, fileListJson: string) => {
        this.notifyFileListReceived({
          instanceId,
          requestId,
          fileListJson,
        });
      }
    );

    this.connection.on(
      "ReceiveSessionListResult",
      (instanceId: string, requestId: string, sessionListJson: string) => {
        this.notifySessionListReceived({
          instanceId,
          requestId,
          sessionListJson,
        });
      }
    );
  }

  /**
   * 订阅实例列表更新
   */
  private async subscribeToInstances(): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      try {
        await this.connection.invoke("SubscribeToInstances");
      } catch (error) {
        console.error("Error subscribing to instances:", error);
      }
    }
  }

  /**
   * 启动心跳
   */
  private startHeartbeat() {
    this.stopHeartbeat();
    // 每 30 秒发送一次心跳
    this.heartbeatInterval = window.setInterval(() => {
      this.sendHeartbeat();
    }, 30000);
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * 发送心跳
   */
  private async sendHeartbeat() {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      try {
        await this.connection.invoke("Heartbeat");
      } catch (error) {
        console.error("Heartbeat error:", error);
      }
    }
  }

  // ==================== 事件订阅 ====================

  /**
   * 订阅实例连接事件
   */
  onInstanceConnected(callback: InstanceConnectedCallback): () => void {
    this.onInstanceConnectedCallbacks.push(callback);
    return () => {
      const index = this.onInstanceConnectedCallbacks.indexOf(callback);
      if (index > -1) {
        this.onInstanceConnectedCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * 订阅实例断开事件
   */
  onInstanceDisconnected(callback: InstanceDisconnectedCallback): () => void {
    this.onInstanceDisconnectedCallbacks.push(callback);
    return () => {
      const index = this.onInstanceDisconnectedCallbacks.indexOf(callback);
      if (index > -1) {
        this.onInstanceDisconnectedCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * 订阅实例列表更新事件
   */
  onInstancesListUpdated(callback: InstancesListUpdatedCallback): () => void {
    this.onInstancesListUpdatedCallbacks.push(callback);
    return () => {
      const index = this.onInstancesListUpdatedCallbacks.indexOf(callback);
      if (index > -1) {
        this.onInstancesListUpdatedCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * 订阅连接状态变化事件
   */
  onConnectionStateChanged(
    callback: ConnectionStateChangedCallback
  ): () => void {
    this.onConnectionStateChangedCallbacks.push(callback);
    return () => {
      const index = this.onConnectionStateChangedCallbacks.indexOf(callback);
      if (index > -1) {
        this.onConnectionStateChangedCallbacks.splice(index, 1);
      }
    };
  }

  // ==================== 事件通知 ====================

  private notifyInstanceConnected(instance: InstanceInfo) {
    this.onInstanceConnectedCallbacks.forEach((cb) => cb(instance));
  }

  private notifyInstanceDisconnected(instanceId: string) {
    this.onInstanceDisconnectedCallbacks.forEach((cb) => cb(instanceId));
  }

  private notifyInstancesListUpdated(instances: InstanceInfo[]) {
    this.onInstancesListUpdatedCallbacks.forEach((cb) => cb(instances));
  }

  private notifyConnectionStateChanged(state: HubConnectionState) {
    this.onConnectionStateChangedCallbacks.forEach((cb) => cb(state));
  }

  private notifyContextInfoReceived(instanceId: string, contextData: string) {
    this.onContextInfoReceivedCallbacks.forEach((cb) =>
      cb(instanceId, contextData)
    );
  }

  private notifyMessageReplyReceived(instanceId: string, replyMessage: string) {
    this.onMessageReplyReceivedCallbacks.forEach((cb) =>
      cb(instanceId, replyMessage)
    );
  }

  private notifyMessageProcessingCompleted(instanceId: string) {
    this.onMessageProcessingCompletedCallbacks.forEach((cb) => cb(instanceId));
  }

  private notifyToolConfirmationNeeded(
    payload: Parameters<ToolConfirmationNeededCallback>[0]
  ) {
    this.onToolConfirmationNeededCallbacks.forEach((cb) => cb(payload));
  }

  private notifyUserInteractionNeeded(
    payload: Parameters<UserInteractionNeededCallback>[0]
  ) {
    this.onUserInteractionNeededCallbacks.forEach((cb) => cb(payload));
  }

  private notifyRollbackConfirmationNeeded(
    payload: Parameters<RollbackConfirmationNeededCallback>[0]
  ) {
    this.onRollbackConfirmationNeededCallbacks.forEach((cb) => cb(payload));
  }

  private notifyFileListReceived(
    payload: Parameters<FileListReceivedCallback>[0]
  ) {
    this.onFileListReceivedCallbacks.forEach((cb) => cb(payload));
  }

  private notifySessionListReceived(
    payload: Parameters<SessionListReceivedCallback>[0]
  ) {
    this.onSessionListReceivedCallbacks.forEach((cb) => cb(payload));
  }

  // ==================== 公共方法 ====================

  /**
   * 请求第三方实例的上下文信息
   */
  async requestContextInfo(instanceId: string): Promise<void> {
    if (!this.connection) {
      throw new Error("Hub connection is not initialized");
    }

    if (this.connection.state !== signalR.HubConnectionState.Connected) {
      console.error(
        "Connection state:",
        this.connection.state,
        "Expected:",
        signalR.HubConnectionState.Connected
      );
      throw new Error("Hub connection is not established");
    }

    try {
      await this.connection.invoke("RequestContextInfo", instanceId);
    } catch (error) {
      console.error("Error requesting context info:", error);
      throw error;
    }
  }

  /**
   * 订阅上下文信息接收事件
   */
  onContextInfoReceived(callback: ContextInfoReceivedCallback): () => void {
    this.onContextInfoReceivedCallbacks.push(callback);
    return () => {
      const index = this.onContextInfoReceivedCallbacks.indexOf(callback);
      if (index > -1) {
        this.onContextInfoReceivedCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * 发送消息给第三方实例
   */
  async sendMessageToInstance(
    instanceId: string,
    message: string
  ): Promise<void> {
    if (!this.connection) {
      throw new Error("Hub connection is not initialized");
    }

    if (this.connection.state !== signalR.HubConnectionState.Connected) {
      throw new Error("Hub connection is not established");
    }

    try {
      await this.connection.invoke(
        "SendMessageToInstance",
        instanceId,
        message
      );
    } catch (error) {
      console.error("Error sending message to instance:", error);
      throw error;
    }
  }

  /**
   * 通知实例中断当前消息处理
   */
  async sendInterruptMessageProcessing(instanceId: string): Promise<void> {
    if (!this.connection) {
      throw new Error("Hub connection is not initialized");
    }

    if (this.connection.state !== signalR.HubConnectionState.Connected) {
      throw new Error("Hub connection is not established");
    }

    await this.connection.invoke("SendInterruptMessageProcessing", instanceId);
  }

  /**
   * 通知实例清空当前会话
   */
  async sendClearSession(instanceId: string): Promise<void> {
    if (!this.connection) {
      throw new Error("Hub connection is not initialized");
    }

    if (this.connection.state !== signalR.HubConnectionState.Connected) {
      throw new Error("Hub connection is not established");
    }

    await this.connection.invoke("SendClearSession", instanceId);
  }

  async sendForceOffline(instanceId: string): Promise<void> {
    if (!this.connection) {
      throw new Error("Hub connection is not initialized");
    }

    if (this.connection.state !== signalR.HubConnectionState.Connected) {
      throw new Error("Hub connection is not established");
    }

    await this.connection.invoke("SendForceOffline", instanceId);
  }

  /**
   * 通知实例回滚到指定用户消息
   */
  async sendRollbackMessage(
    instanceId: string,
    userMessageOrder: number
  ): Promise<void> {
    if (!this.connection) {
      throw new Error("Hub connection is not initialized");
    }

    if (this.connection.state !== signalR.HubConnectionState.Connected) {
      throw new Error("Hub connection is not established");
    }

    await this.connection.invoke(
      "SendRollbackMessage",
      instanceId,
      userMessageOrder
    );
  }

  /**
   * 通知实例恢复指定会话
   */
  async sendResumeSession(
    instanceId: string,
    sessionId: string
  ): Promise<void> {
    if (!this.connection) {
      throw new Error("Hub connection is not initialized");
    }

    if (this.connection.state !== signalR.HubConnectionState.Connected) {
      throw new Error("Hub connection is not established");
    }

    await this.connection.invoke("SendResumeSession", instanceId, sessionId);
  }

  /**
   * 订阅消息回复接收事件
   */
  onMessageReplyReceived(callback: MessageReplyReceivedCallback): () => void {
    this.onMessageReplyReceivedCallbacks.push(callback);
    return () => {
      const index = this.onMessageReplyReceivedCallbacks.indexOf(callback);
      if (index > -1) {
        this.onMessageReplyReceivedCallbacks.splice(index, 1);
      }
    };
  }

  onMessageProcessingCompleted(
    callback: MessageProcessingCompletedCallback
  ): () => void {
    this.onMessageProcessingCompletedCallbacks.push(callback);
    return () => {
      const index =
        this.onMessageProcessingCompletedCallbacks.indexOf(callback);
      if (index > -1) {
        this.onMessageProcessingCompletedCallbacks.splice(index, 1);
      }
    };
  }

  onToolConfirmationNeeded(
    callback: ToolConfirmationNeededCallback
  ): () => void {
    this.onToolConfirmationNeededCallbacks.push(callback);
    return () => {
      const index = this.onToolConfirmationNeededCallbacks.indexOf(callback);
      if (index > -1) {
        this.onToolConfirmationNeededCallbacks.splice(index, 1);
      }
    };
  }

  onUserInteractionNeeded(callback: UserInteractionNeededCallback): () => void {
    this.onUserInteractionNeededCallbacks.push(callback);
    return () => {
      const index = this.onUserInteractionNeededCallbacks.indexOf(callback);
      if (index > -1) {
        this.onUserInteractionNeededCallbacks.splice(index, 1);
      }
    };
  }

  onRollbackConfirmationNeeded(
    callback: RollbackConfirmationNeededCallback
  ): () => void {
    this.onRollbackConfirmationNeededCallbacks.push(callback);
    return () => {
      const index =
        this.onRollbackConfirmationNeededCallbacks.indexOf(callback);
      if (index > -1) {
        this.onRollbackConfirmationNeededCallbacks.splice(index, 1);
      }
    };
  }

  onFileListReceived(callback: FileListReceivedCallback): () => void {
    this.onFileListReceivedCallbacks.push(callback);
    return () => {
      const index = this.onFileListReceivedCallbacks.indexOf(callback);
      if (index > -1) {
        this.onFileListReceivedCallbacks.splice(index, 1);
      }
    };
  }

  onSessionListReceived(callback: SessionListReceivedCallback): () => void {
    this.onSessionListReceivedCallbacks.push(callback);
    return () => {
      const index = this.onSessionListReceivedCallbacks.indexOf(callback);
      if (index > -1) {
        this.onSessionListReceivedCallbacks.splice(index, 1);
      }
    };
  }

  async sendRollbackConfirmationResult(
    instanceId: string,
    rollbackFiles: boolean | null,
    selectedFiles?: string[]
  ): Promise<void> {
    if (!this.connection) {
      throw new Error("Hub connection is not initialized");
    }
    if (this.connection.state !== signalR.HubConnectionState.Connected) {
      throw new Error("Hub connection is not established");
    }

    await this.connection.invoke(
      "SendRollbackConfirmationResult",
      instanceId,
      rollbackFiles,
      selectedFiles ?? []
    );
  }

  async requestFileList(instanceId: string, requestId: string): Promise<void> {
    if (!this.connection) {
      throw new Error("Hub connection is not initialized");
    }
    if (this.connection.state !== signalR.HubConnectionState.Connected) {
      throw new Error("Hub connection is not established");
    }

    await this.connection.invoke("RequestFileList", instanceId, requestId);
  }

  async requestSessionList(
    instanceId: string,
    requestId: string,
    options?: SessionListRequestOptions
  ): Promise<void> {
    if (!this.connection) {
      throw new Error("Hub connection is not initialized");
    }
    if (this.connection.state !== signalR.HubConnectionState.Connected) {
      throw new Error("Hub connection is not established");
    }

    const page = Math.max(0, options?.page ?? 0);
    const pageSize = Math.max(1, options?.pageSize ?? 20);
    const searchQuery = options?.searchQuery ?? "";

    await this.connection.invoke(
      "RequestSessionList",
      instanceId,
      requestId,
      page,
      pageSize,
      searchQuery
    );
  }

  async sendToolConfirmationResult(
    instanceId: string,
    toolCallId: string,
    result: "approve" | "approve_always" | "reject" | "reject_with_reply",
    reason?: string
  ): Promise<void> {
    if (!this.connection) {
      throw new Error("Hub connection is not initialized");
    }
    if (this.connection.state !== signalR.HubConnectionState.Connected) {
      throw new Error("Hub connection is not established");
    }

    await this.connection.invoke(
      "SendToolConfirmationResult",
      instanceId,
      toolCallId,
      result,
      reason ?? null
    );
  }

  async sendUserQuestionResult(
    instanceId: string,
    toolCallId: string,
    selected: string | string[],
    customInput?: string,
    cancelled?: boolean
  ): Promise<void> {
    if (!this.connection) {
      throw new Error("Hub connection is not initialized");
    }
    if (this.connection.state !== signalR.HubConnectionState.Connected) {
      throw new Error("Hub connection is not established");
    }

    await this.connection.invoke(
      "SendUserQuestionResult",
      instanceId,
      toolCallId,
      Array.isArray(selected) ? JSON.stringify(selected) : selected,
      customInput ?? null,
      cancelled ?? false
    );
  }
}

// 导出单例实例
export const instanceHub = new InstanceHubManager();

// 导出类型
export type { InstanceConnectedCallback, InstanceDisconnectedCallback };
