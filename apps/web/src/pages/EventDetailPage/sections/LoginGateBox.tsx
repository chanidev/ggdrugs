import { Icon } from '../../../components/Icon';
import { loginUrl } from '../../../lib/auth-redirect';

export function LoginGateBox() {
  return (
    <div className="flex items-center justify-between gap-3 rounded-(--radius-md) border border-dashed border-(--color-border) bg-(--color-surface-alt) px-4 py-3">
      <p className="m-0 text-[13px] text-(--color-text-muted)">
        리뷰를 남기려면 로그인이 필요해요.
      </p>
      <a
        href={loginUrl('google')}
        className="inline-flex h-8 items-center gap-1.5 rounded-(--radius-md) bg-(--color-accent) px-3 text-[13px] font-medium text-white transition-colors hover:bg-(--color-accent-hover)"
      >
        Google 로그인 <Icon name="arrow" size={12} />
      </a>
    </div>
  );
}
