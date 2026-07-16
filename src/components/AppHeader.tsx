import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

interface AppHeaderProps {
  title: string;
  onBack?: () => void;
  actions?: ReactNode;
}

export function AppHeader({ title, onBack, actions }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__side">
        {onBack ? (
          <button className="icon-button" type="button" onClick={onBack} aria-label="前の画面に戻る">
            <ArrowLeft aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <h1 className="app-header__title">{title}</h1>
      <div className="app-header__actions">{actions}</div>
    </header>
  );
}
