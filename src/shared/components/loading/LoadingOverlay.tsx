import type { ReactNode } from "react";

type LoadingOverlayProps = {
  complete?: boolean;
  children: ReactNode;
  className?: string;
};

export function LoadingOverlay({ complete = false, children, className }: LoadingOverlayProps) {
  const classes = ["loadingOverlay", complete ? "isComplete" : "", className ?? ""].filter(Boolean).join(" ");
  return <div className={classes}>{children}</div>;
}
