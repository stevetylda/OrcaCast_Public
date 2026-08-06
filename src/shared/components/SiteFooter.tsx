import { Link } from "react-router-dom";
import { routePath } from "../config/routes";

type SiteFooterLink = {
  label: string;
  to: string;
  external?: boolean;
  newTab?: boolean;
  icon?: "github";
  emphasis?: boolean;
  ariaLabel?: string;
};

function GitHubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 .7A11.5 11.5 0 0 0 8.36 23.1c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.3-5.27-1.29-5.27-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.41-2.71 5.39-5.29 5.68.42.36.79 1.07.79 2.16v3.25c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"
      />
    </svg>
  );
}

export function SiteFooter({
  links = [],
  tagline,
}: {
  links?: SiteFooterLink[];
  tagline: string;
}) {
  return (
    <footer className="appSiteFooter">
      <Link
        className="appSiteFooter__brand"
        to={routePath("home")}
        aria-label="OrcaCast home"
      >
        <img
          src="/images/OrcaCast-Icon-128.webp"
          srcSet="/images/OrcaCast-Icon-128.webp 128w, /images/OrcaCast-Icon-256.webp 256w"
          sizes="44px"
          width={128}
          height={128}
          loading="lazy"
          decoding="async"
          alt=""
          aria-hidden="true"
        />
        <span>OrcaCast</span>
      </Link>
      <span className="appSiteFooter__tagline">{tagline}</span>
      {links.length > 0 ? (
        <nav className="appSiteFooter__nav" aria-label="Footer navigation">
          {links.map((link) =>
            link.external ? (
              <a
                key={link.label}
                href={link.to}
                className={
                  link.emphasis ? "appSiteFooter__contribute" : undefined
                }
                aria-label={link.ariaLabel}
                target={link.newTab ? "_blank" : undefined}
                rel={link.newTab ? "noopener noreferrer" : undefined}
              >
                {link.icon === "github" ? <GitHubIcon /> : null}
                {link.label}
              </a>
            ) : (
              <Link key={link.label} to={link.to}>
                {link.label}
              </Link>
            ),
          )}
        </nav>
      ) : null}
    </footer>
  );
}
