import type { ReactNode } from "react";
import { SwipeCompareView } from "./SwipeCompareView";

type Props = {
  splitPct: number;
  onSplitCommit: (pct: number) => void;
  childrenLeft: ReactNode;
  childrenRight: ReactNode;
};

export function SingleSwipeMap({ splitPct, onSplitCommit, childrenLeft, childrenRight }: Props) {
  return (
    <SwipeCompareView
      splitPct={splitPct}
      fixedSplit={false}
      onSplitCommit={onSplitCommit}
      childrenA={childrenLeft}
      childrenB={childrenRight}
    />
  );
}
