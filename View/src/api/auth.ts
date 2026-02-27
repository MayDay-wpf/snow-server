import { getConfig } from "../config";

/**
 * 用户登录参数
 */
export interface LoginParams {
  username: string;
  password: string;
}

/**
 * 用户注册参数
 */
export interface RegisterParams {
  username: string;
  password: string;
}

/**
 * 用户信息
 */
export interface UserInfo {
  id: number;
  username: string;
}

/**
 * 后端 API 响应结构（匹配 AuthResponse）
 */
export interface AuthResponse {
  success: boolean;
  message: string;
  token?: string;
  refreshToken?: string;
  user?: UserInfo;
}

/**
 * API 响应基础接口（向后兼容）
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

/**
 * 登录响应数据（向后兼容）
 */
export interface LoginResponse {
  token: string;
  username: string;
  refreshToken?: string;
  user?: UserInfo;
}

/**
 * 获取 API 基础 URL
 */
function getApiUrl(): string {
  return getConfig().baseUrl;
}

/**
 * 用户登录
 * @param params 登录参数
 * @returns 登录结果
 */
export async function login(
  params: LoginParams
): Promise<ApiResponse<LoginResponse>> {
  try {
    const response = await fetch(`${getApiUrl()}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    const data: AuthResponse = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || "Login failed",
      };
    }

    // 转换后端响应为前端格式
    return {
      success: true,
      data: {
        token: data.token || "",
        username: data.user?.username || params.username,
        refreshToken: data.refreshToken,
        user: data.user,
      },
      message: data.message,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * 用户注册
 * @param params 注册参数
 * @returns 注册结果
 */
export async function register(
  params: RegisterParams
): Promise<ApiResponse<void>> {
  try {
    const response = await fetch(`${getApiUrl()}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    const data: AuthResponse = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || "Registration failed",
      };
    }

    return {
      success: true,
      message: data.message,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * 验证用户名格式
 * @param username 用户名
 * @returns 是否有效
 */
export function validateUsername(username: string): {
  valid: boolean;
  message: string;
} {
  if (!username || username.trim().length === 0) {
    return { valid: false, message: "Username is required" };
  }
  if (username.length < 3) {
    return { valid: false, message: "Username must be at least 3 characters" };
  }
  if (username.length > 20) {
    return {
      valid: false,
      message: "Username must be less than 20 characters",
    };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return {
      valid: false,
      message: "Username can only contain letters, numbers and underscores",
    };
  }
  return { valid: true, message: "" };
}

/**
 * 刷新 token
 * @param refreshToken 刷新令牌
 * @returns 刷新结果
 */
export async function refreshToken(
  refreshToken: string
): Promise<ApiResponse<LoginResponse>> {
  try {
    const response = await fetch(`${getApiUrl()}/auth/refresh-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });

    const data: AuthResponse = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || "Token refresh failed",
      };
    }

    // 转换后端响应为前端格式
    return {
      success: true,
      data: {
        token: data.token || "",
        username: data.user?.username || "",
        refreshToken: data.refreshToken,
        user: data.user,
      },
      message: data.message,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * 验证密码格式
 * @param password 密码
 * @returns 是否有效
 */
export function validatePassword(password: string): {
  valid: boolean;
  message: string;
} {
  if (!password || password.length === 0) {
    return { valid: false, message: "Password is required" };
  }
  if (password.length < 6) {
    return { valid: false, message: "Password must be at least 6 characters" };
  }
  return { valid: true, message: "" };
}
