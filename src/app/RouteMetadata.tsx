import { useEffect } from "react";
import { useLocation } from "react-router-dom";

type Metadata = {
  title: string;
  description: string;
};

const DEFAULT_METADATA: Metadata = {
  title: "Page Not Found | OrcaCast",
  description:
    "That OrcaCast page could not be found. Return home or explore current Salish Sea forecasts and trip-planning tools.",
};

const ROUTE_METADATA: Record<string, Metadata> = {
  "/": {
    title: "OrcaCast | Salish Sea Orca Forecasts",
    description:
      "Explore weekly orca activity outlooks, seasonal context, and shore-based trip-planning tools for the Salish Sea.",
  },
  "/watch": {
    title: "This Week's Orca Forecast | OrcaCast",
    description:
      "View this week's modeled orca activity outlook across the Salish Sea, with regional maps, sightings context, and observation tools.",
  },
  "/planner": {
    title: "Plan an Orca-Watching Trip | OrcaCast",
    description:
      "Build a shore-based Salish Sea itinerary using dates, locations, seasonal activity, viewpoints, cameras, and local conditions.",
  },
  "/explore": {
    title: "Explore Whales and the Salish Sea | OrcaCast",
    description:
      "A forthcoming OrcaCast guide to whales, responsible whale watching, identification tips, and other wildlife of the Salish Sea.",
  },
  "/about": {
    title: "About OrcaCast | Forecast Lab",
    description:
      "Learn what OrcaCast is, how to interpret its outlooks, where its data comes from, and how to use forecasts responsibly.",
  },
  "/about/model": {
    title: "How the OrcaCast Model Works",
    description:
      "Explore the data, modeling workflow, validation approach, limitations, and personalized outputs behind OrcaCast forecasts.",
  },
};

function setMetaContent(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.append(element);
  }
  Object.entries(attributes).forEach(([name, value]) =>
    element?.setAttribute(name, value),
  );
}

export function RouteMetadata() {
  const { pathname } = useLocation();

  useEffect(() => {
    const normalizedPath = pathname !== "/" ? pathname.replace(/\/$/, "") : "/";
    const metadata = ROUTE_METADATA[normalizedPath] ?? DEFAULT_METADATA;

    document.title = metadata.title;
    setMetaContent('meta[name="description"]', {
      name: "description",
      content: metadata.description,
    });
    setMetaContent('meta[property="og:title"]', {
      property: "og:title",
      content: metadata.title,
    });
    setMetaContent('meta[property="og:description"]', {
      property: "og:description",
      content: metadata.description,
    });
  }, [pathname]);

  return null;
}
