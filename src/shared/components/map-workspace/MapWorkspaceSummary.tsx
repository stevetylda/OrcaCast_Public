import { forwardRef, type ReactNode } from "react";

type Props = {
  id: string;
  className?: string;
  icon: string;
  eyebrow: string;
  title: string;
  description?: ReactNode;
  action: ReactNode;
  context?: ReactNode;
  children?: ReactNode;
};

/** Shared hierarchy; each page owns its dates, data basis and actions. */
export const MapWorkspaceSummary = forwardRef<HTMLDivElement, Props>(
  function MapWorkspaceSummary(
    {
      id,
      className = "",
      icon,
      eyebrow,
      title,
      description,
      action,
      context,
      children,
    },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={`mapWorkspaceSummary ${className}`}
        role="region"
        aria-labelledby={id}
      >
        <div className="mapWorkspaceSummary__main">
          <span
            className="mapWorkspaceSummary__icon material-symbols-rounded"
            aria-hidden="true"
          >
            {icon}
          </span>
          <div className="mapWorkspaceSummary__copy">
            <p className="mapWorkspaceSummary__eyebrow">{eyebrow}</p>
            <h1 id={id}>{title}</h1>
            {description ? (
              <div className="mapWorkspaceSummary__description">
                {description}
              </div>
            ) : null}
          </div>
          <div className="mapWorkspaceSummary__action">{action}</div>
        </div>
        {context ? (
          <div className="mapWorkspaceSummary__context">{context}</div>
        ) : null}
        {children}
      </div>
    );
  },
);
