import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { findRouteByPath } from "../shared/config/routes";

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
    const metadata = findRouteByPath(pathname).metadata;

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
