
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from "./App";
import AppErrorBoundary from "./components/common/AppErrorBoundary";
import "./styles/index.css";

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.status === 401 || error?.status === 403) return false;
        if (error?.retryable === false) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </QueryClientProvider>
  </StrictMode>
);
  
