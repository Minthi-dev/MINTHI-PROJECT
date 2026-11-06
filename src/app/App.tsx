import { QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { queryClient } from '@/shared/lib/query'
import { ThemeProvider, useTheme } from '@/shared/hooks/useTheme'
import { ConfirmProvider } from '@/shared/ui/overlay'
import { ErrorScreen } from './ErrorScreen'
import { AppRoutes } from './routes'

function ThemedToaster() {
  const { theme } = useTheme()
  return <Toaster position="top-center" theme={theme} richColors closeButton toastOptions={{ className: 'font-sans' }} />
}

export function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorScreen}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <ConfirmProvider>
                <AppRoutes />
                <ThemedToaster />
              </ConfirmProvider>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
