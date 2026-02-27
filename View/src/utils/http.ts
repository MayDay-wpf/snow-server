import { getToken, getRefreshToken, saveToken, saveRefreshToken, clearAuth } from "./auth";
import { refreshToken as refreshTokenApi } from "../api/auth";

/**
 * HTTP 请求拦截器
 * 自动添加 Authorization header 和处理 token 过期
 */

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });

  failedQueue = [];
};

/**
 * 创建带有 token 的 fetch 请求
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken();

  // 添加 Authorization header
  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // 如果是 401 错误，尝试刷新 token
  if (response.status === 401) {
    const refreshTokenValue = getRefreshToken();

    if (!refreshTokenValue) {
      // 没有 refresh token，清除认证信息并跳转到登录页
      clearAuth();
      window.location.href = "/login";
      throw new Error("Authentication required");
    }

    // 如果正在刷新 token，将请求加入队列
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(() => {
        // 重试原始请求
        const newToken = getToken();
        if (newToken) {
          headers.set("Authorization", `Bearer ${newToken}`);
        }
        return fetch(url, { ...options, headers });
      });
    }

    isRefreshing = true;

    try {
      // 调用刷新 token API
      const result = await refreshTokenApi(refreshTokenValue);

      if (result.success && result.data) {
        // 保存新的 token
        saveToken(result.data.token);
        if (result.data.refreshToken) {
          saveRefreshToken(result.data.refreshToken);
        }

        // 处理队列中的请求
        processQueue();

        // 重试原始请求
        headers.set("Authorization", `Bearer ${result.data.token}`);
        return fetch(url, { ...options, headers });
      } else {
        // 刷新失败，清除认证信息
        processQueue(new Error("Token refresh failed"));
        clearAuth();
        window.location.href = "/login";
        throw new Error("Token refresh failed");
      }
    } catch (error) {
      processQueue(error instanceof Error ? error : new Error("Unknown error"));
      clearAuth();
      window.location.href = "/login";
      throw error;
    } finally {
      isRefreshing = false;
    }
  }

  return response;
}

/**
 * 带认证的 GET 请求
 */
export async function getWithAuth<T>(url: string): Promise<T> {
  const response = await fetchWithAuth(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

/**
 * 带认证的 POST 请求
 */
export async function postWithAuth<T>(url: string, data: unknown): Promise<T> {
  const response = await fetchWithAuth(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

/**
 * 带认证的 PUT 请求
 */
export async function putWithAuth<T>(url: string, data: unknown): Promise<T> {
  const response = await fetchWithAuth(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

/**
 * 带认证的 DELETE 请求
 */
export async function deleteWithAuth<T>(url: string): Promise<T> {
  const response = await fetchWithAuth(url, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}
