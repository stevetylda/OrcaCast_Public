import { useState } from "react";
import type { GridDetailTab } from "../types";

export function useGridDetailTabs(detailKey: string) {
  const [activeTabState, setActiveTabState] = useState<{ key: string; tab: GridDetailTab }>({
    key: detailKey,
    tab: "forecast",
  });

  const activeTab = activeTabState.key === detailKey ? activeTabState.tab : "forecast";
  const setActiveTab = (tab: GridDetailTab) => {
    setActiveTabState({ key: detailKey, tab });
  };

  return { activeTab, setActiveTab };
}
