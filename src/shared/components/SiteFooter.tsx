import { Link } from "react-router-dom";

type SiteFooterLink = { label: string; to: string; external?: boolean };

export function SiteFooter({
  links = [],
  tagline,
  region = "Salish Sea · Pacific Northwest",
}: {
  links?: SiteFooterLink[];
  tagline: string;
  region?: string;
}) {
  return (
    <footer className="appSiteFooter">
      <Link className="appSiteFooter__brand" to="/" aria-label="OrcaCast home">
        <img src="/images/OrcaCast-Icon.png" alt="" aria-hidden="true" />
        <span>OrcaCast</span>
      </Link>
      {links.length > 0 ? (
        <nav className="appSiteFooter__nav" aria-label="Footer navigation">
          {links.map((link) =>
            link.external ? (
              <a key={link.label} href={link.to}>
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
      <span className="appSiteFooter__tagline">{tagline}</span>
      <span className="appSiteFooter__region">{region}</span>
    </footer>
  );
}
