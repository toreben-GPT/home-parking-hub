import type { PropsWithChildren, ReactNode } from "react";

interface DetailSectionProps extends PropsWithChildren {
  id: string;
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function DetailSection({ id, title, icon, action, children }: DetailSectionProps) {
  return (
    <section className="detail-section" aria-labelledby={id}>
      <div className="detail-section__heading">
        <div>
          {icon}
          <h2 id={id}>{title}</h2>
        </div>
        {action ? <div className="detail-section__action">{action}</div> : null}
      </div>
      <div className="detail-section__body">{children}</div>
    </section>
  );
}
