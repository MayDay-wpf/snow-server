import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { loadConfig } from "./config";
import i18n from "./locales";
import { initTheme } from "./composables/useTheme";
import router from "./router";

// 先加载配置，再挂载应用
loadConfig().then(() => {
  // 初始化主题
  initTheme();

  const app = createApp(App);
  app.use(i18n);
  app.use(router);
  app.mount("#app");
});
