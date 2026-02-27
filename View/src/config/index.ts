/**
 * 全局配置接口定义
 */
export interface AppConfig {
  baseUrl: string;
  appName: string;
  version: string;
}

/**
 * 默认配置（配置加载失败时使用）
 */
const defaultConfig: AppConfig = {
  baseUrl: "http://localhost:5136/api",
  appName: "Snow Server",
  version: "1.0.0",
};

/**
 * 全局配置实例
 */
let appConfig: AppConfig = { ...defaultConfig };

/**
 * 是否已加载配置
 */
let isLoaded = false;

/**
 * 加载配置文件
 * 从 public/config.json 读取配置
 */
export async function loadConfig(): Promise<AppConfig> {
  if (isLoaded) {
    return appConfig;
  }

  try {
    // 添加时间戳防止缓存
    const timestamp = Date.now();
    const response = await fetch(`/config.json?t=${timestamp}`);

    if (!response.ok) {
      console.warn("Failed to load config.json, using default config");
      return appConfig;
    }

    const config = await response.json();
    appConfig = { ...defaultConfig, ...config };
    isLoaded = true;

    console.log("Config loaded:", appConfig);
    return appConfig;
  } catch (error) {
    console.warn("Error loading config.json:", error, "using default config");
    return appConfig;
  }
}

/**
 * 获取当前配置
 */
export function getConfig(): AppConfig {
  return appConfig;
}

/**
 * 获取 API 基础 URL
 */
export function getBaseUrl(): string {
  return appConfig.baseUrl;
}

/**
 * 获取应用名称
 */
export function getAppName(): string {
  return appConfig.appName;
}

/**
 * 重置配置（用于测试或重新加载）
 */
export function resetConfig(): void {
  appConfig = { ...defaultConfig };
  isLoaded = false;
}
