import { createApp, h } from "vue";
import Alert, { type AlertProps } from "../components/Alert.vue";

interface AlertOptions {
  message: string;
  type?: "success" | "error" | "info" | "warning";
  duration?: number;
  position?: "top" | "top-right" | "top-left" | "bottom" | "bottom-right" | "bottom-left";
}

const alertInstances: Array<{ container: HTMLDivElement; app: any }> = [];

export function useAlert() {
  const show = (options: AlertOptions) => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const app = createApp({
      render() {
        return h(Alert, {
          ...options,
          onClose: () => {
            app.unmount();
            document.body.removeChild(container);
            const index = alertInstances.findIndex((item) => item.container === container);
            if (index > -1) {
              alertInstances.splice(index, 1);
            }
          },
        } as AlertProps);
      },
    });

    app.mount(container);
    alertInstances.push({ container, app });
  };

  const success = (message: string, duration?: number, position?: AlertOptions["position"]) => {
    show({ message, type: "success", duration, position });
  };

  const error = (message: string, duration?: number, position?: AlertOptions["position"]) => {
    show({ message, type: "error", duration, position });
  };

  const warning = (message: string, duration?: number, position?: AlertOptions["position"]) => {
    show({ message, type: "warning", duration, position });
  };

  const info = (message: string, duration?: number, position?: AlertOptions["position"]) => {
    show({ message, type: "info", duration, position });
  };

  const clear = () => {
    alertInstances.forEach(({ container, app }) => {
      app.unmount();
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    });
    alertInstances.length = 0;
  };

  return {
    show,
    success,
    error,
    warning,
    info,
    clear,
  };
}
