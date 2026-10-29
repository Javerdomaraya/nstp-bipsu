import { Component, ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

const NSTP_STORAGE_PREFIX = 'nstp';

export default class AppErrorBoundary extends Component<Props, State> {
  declare props: Props;
  state: State = { hasError: false, message: 'Something went wrong while loading the NSTP app.' };

  constructor(props: Props) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'Something went wrong while loading the NSTP app.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('NSTP app crashed:', error);
  }

  clearStorageAndReload = () => {
    if (typeof window !== 'undefined') {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(NSTP_STORAGE_PREFIX))
        .forEach((key) => localStorage.removeItem(key));
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(11,78,162,0.12)_0%,_rgba(255,210,77,0.14)_22%,_#f8fbff_58%)] p-6 dark:bg-[radial-gradient(circle_at_top,_rgba(90,167,255,0.16)_0%,_rgba(255,210,77,0.08)_18%,_#0b1426_56%)]">
          <div className="max-w-xl w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-700 dark:bg-slate-950">
            <div className="mb-4 h-14 w-14 overflow-hidden rounded-2xl border border-blue-200/60 p-1 shadow-sm dark:border-slate-700/60">
              <img src="/bipsu-logo.png" alt="Biliran Province State University logo" className="h-full w-full object-contain" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Application Error</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">The NSTP system could not load</h1>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{this.state.message}</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">If this started after changing data, clear the stored NSTP state and reload.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => window.location.reload()}
                className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-medium text-white hover:opacity-95"
              >
                Reload
              </button>
              <button
                onClick={this.clearStorageAndReload}
                className="rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-200 dark:hover:bg-rose-500/10"
              >
                Clear NSTP Data and Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
