import { createRouter, createWebHistory } from "vue-router";
import { isAuthenticated, getToken, getRefreshToken } from "../utils/auth";
import { refreshToken as refreshTokenApi } from "../api/auth";
import { saveToken, saveRefreshToken, clearAuth } from "../utils/auth";
import LoginPage from "../views/LoginPage.vue";
import HomePage from "../views/HomePage.vue";
import ChatPage from "../views/ChatPage.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: HomePage,
      meta: { requiresAuth: true },
    },
    {
      path: "/chat/:instanceId",
      name: "chat",
      component: ChatPage,
      meta: { requiresAuth: true },
    },
    {
      path: "/login",
      name: "login",
      component: LoginPage,
    },
  ],
});

// 检查 token 是否即将过期（通过解析 JWT）
function isTokenExpiringSoon(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) {
      return false;
    }
    const payload = JSON.parse(atob(parts[1]));
    const exp = payload.exp * 1000; // 转换为毫秒
    const now = Date.now();
    const timeUntilExpiry = exp - now;

    // 如果 token 在 5 分钟内过期，返回 true
    return timeUntilExpiry < 5 * 60 * 1000;
  } catch {
    return false;
  }
}

// 路由守卫：检查认证状态和 token 过期
router.beforeEach(async (to, _from, next) => {
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth);

  if (requiresAuth && !isAuthenticated()) {
    // 需要认证但未登录，跳转到登录页
    next({ name: "login" });
    return;
  }

  if (to.name === "login" && isAuthenticated()) {
    // 已登录用户访问登录页，跳转到首页
    next({ name: "home" });
    return;
  }

  // 如果需要认证且已登录，检查 token 是否即将过期
  if (requiresAuth && isAuthenticated()) {
    const token = getToken();
    const refreshTokenValue = getRefreshToken();

    if (token && refreshTokenValue && isTokenExpiringSoon(token)) {
      try {
        // 尝试刷新 token
        const result = await refreshTokenApi(refreshTokenValue);

        if (result.success && result.data) {
          // 保存新的 token
          saveToken(result.data.token);
          if (result.data.refreshToken) {
            saveRefreshToken(result.data.refreshToken);
          }
          console.log("Token refreshed successfully in router guard");
        } else {
          // 刷新失败，清除认证信息并跳转到登录页
          console.error("Token refresh failed:", result.message);
          clearAuth();
          next({ name: "login" });
          return;
        }
      } catch (error) {
        console.error("Error refreshing token:", error);
        clearAuth();
        next({ name: "login" });
        return;
      }
    }
  }

  next();
});

export default router;
