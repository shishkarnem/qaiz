import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  handleRecoverReload = async () => {
    try {
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => k.startsWith('qaiz-static-assets'))
            .map((k) => caches.delete(k).catch(() => false))
        );
      }
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update().catch(() => {})));
      }
    } catch (_) {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-transparent backdrop-blur-xl p-4 text-center">
          <h2 className="text-3xl font-bold text-primary">Что-то пошло не так</h2>
          <p className="mt-4 text-sm text-foreground/70">
            {this.state.error?.message || 'Произошла непредвиденная ошибка.'}
          </p>
          <button
            onClick={this.handleRecoverReload}
            className="mt-8 rounded-2xl border border-primary/40 bg-transparent backdrop-blur-xl px-8 py-3 text-sm font-bold text-foreground transition-transform hover:scale-105 cursor-pointer"
          >
            Перезагрузить страницу
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
