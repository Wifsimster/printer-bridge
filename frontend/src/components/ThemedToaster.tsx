import { Toaster } from "sonner";
import { useTheme } from "@/components/ThemeProvider";

export function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      richColors
      closeButton
      position="top-right"
      theme={resolved}
      toastOptions={{
        classNames: {
          toast: "rounded-xl border shadow-medium",
        },
      }}
    />
  );
}
