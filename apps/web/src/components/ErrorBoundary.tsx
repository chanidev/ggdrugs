import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * 리액트 서브트리 에러 경계.
 *
 * 외부 SDK (react-kakao-maps-sdk) 의 race (StrictMode double-mount + MarkerClusterer
 * 사이에 null marker 참조) 등으로 인한 throw 가 전체 root 렌더를 블랭크로 만드는
 * 것을 막는다. 로컬라이즈해서 해당 영역만 에러 UI 로 대체.
 */
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: (err: Error, reset: () => void) => ReactNode },
  State
> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return (
        <div className="flex h-full min-h-[200px] w-full flex-col items-center justify-center gap-3 bg-(--color-surface-alt) p-8 text-center">
          <p className="m-0 text-[14px] font-semibold text-(--color-text)">
            이 영역을 표시하지 못했어요
          </p>
          <p className="m-0 max-w-md text-[12px] text-(--color-text-muted)">
            {error.message.slice(0, 200)}
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="inline-flex h-8 items-center rounded-(--radius-md) bg-(--color-accent) px-3 text-[13px] font-medium text-white hover:bg-(--color-accent-hover)"
          >
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
