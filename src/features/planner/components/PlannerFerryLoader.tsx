type PlannerFerryLoaderProps = {
  complete?: boolean;
};

const UPPER_WINDOWS = Array.from({ length: 22 }, (_, index) => 214 + index * 25);
const LOWER_WINDOWS = Array.from({ length: 23 }, (_, index) => 196 + index * 26);

export function PlannerFerryLoader({ complete = false }: PlannerFerryLoaderProps) {
  return (
    <div
      className={`plannerFerryLoader${complete ? " isComplete" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={complete ? "Your trip is ready" : "Preparing your trip"}
    >
      <div className="plannerFerryLoader__eyebrow">Preparing your trip</div>

      <div className="plannerFerryLoader__journey" aria-hidden="true">
        <span className="plannerFerryLoader__sparkle plannerFerryLoader__sparkle--one" />
        <span className="plannerFerryLoader__sparkle plannerFerryLoader__sparkle--two" />
        <span className="plannerFerryLoader__sparkle plannerFerryLoader__sparkle--three" />

        <div className="plannerFerryLoader__ferryRoute">
          <svg
            className="plannerFerryLoader__ferry"
            viewBox="0 -80 960 440"
            role="presentation"
            focusable="false"
          >
            <rect x="0" y="270" width="960" height="90" fill="#c9f2ef" />

            <g className="plannerFerryLoader__waterMotion" fill="none" stroke="#0b3159" strokeWidth="5" strokeLinecap="round">
              <path d="M-90 315c30 14 58-14 88 0s58-14 88 0 58-14 88 0 58-14 88 0 58-14 88 0" />
              <path d="M360 315c30 14 58-14 88 0s58-14 88 0 58-14 88 0 58-14 88 0 58-14 88 0" />
              <path d="M810 315c30 14 58-14 88 0s58-14 88 0 58-14 88 0" />
            </g>

            <g className="plannerFerryLoader__wakeMotion" fill="none" stroke="#35c7c0" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round">
              <path d="M820 272l38-17-12 18 42-13-17 20 43-7-26 21 48-3" />
              <path d="M828 287l28-5-13 14 42-7-23 18 43-7" opacity="0.7" />
            </g>

            <g className="plannerFerryLoader__ferryBob">
              <g className="plannerFerryLoader__smoke">
                <g className="plannerFerryLoader__smokePuff plannerFerryLoader__smokePuff--one">
                  <path d="M593 89c-15-5-19-24-7-35 5-5 12-7 19-6 1-12 11-21 23-21 10 0 18 6 22 14 11-2 23 6 25 17 2 12-6 23-18 26-7 15-29 18-40 5-8 4-17 4-24 0Z" />
                </g>
                <g className="plannerFerryLoader__smokePuff plannerFerryLoader__smokePuff--two">
                  <path d="M677 57c-18-7-22-30-8-43 6-6 15-8 23-6 3-13 14-22 28-22 11 0 21 7 25 17 15-3 29 7 32 22 3 15-7 30-23 33-9 18-36 21-49 5-10 5-20 4-28-6Z" />
                </g>
                <g className="plannerFerryLoader__smokePuff plannerFerryLoader__smokePuff--three">
                  <path d="M786 25c-23-8-29-38-11-55 8-8 19-11 30-8 3-17 18-30 36-30 15 0 27 9 33 22 18-4 37 9 40 28 4 20-10 38-29 42-11 23-46 27-63 7-12 6-25 4-36-6Z" />
                </g>
              </g>

              <g fill="#fffaf0" stroke="#0b3159" strokeWidth="6" strokeLinejoin="round">
                <path d="M84 220h792l13 20-34 4H111l-39-5 12-19Z" />
                <path d="M119 181h698l28 39H93l26-39Z" />
                <path d="M139 137h638l32 44H109l30-44Z" />
              </g>

              <path d="M69 239h823c-8 22-27 42-53 56H126c-25-13-44-31-57-56Z" fill="#092c52" stroke="#0b3159" strokeWidth="6" strokeLinejoin="round" />
              <path d="M73 239h814" fill="none" stroke="#32c9bd" strokeWidth="10" strokeLinecap="round" />

              <g fill="#082b51">
                {UPPER_WINDOWS.map((x) => (
                  <rect key={`upper-${x}`} x={x} y="151" width="17" height="20" rx="3" />
                ))}
                {LOWER_WINDOWS.map((x) => (
                  <rect key={`lower-${x}`} x={x} y="194" width="18" height="20" rx="3" />
                ))}
              </g>

              <g fill="#fffaf0" stroke="#0b3159" strokeWidth="6" strokeLinejoin="round">
                <path d="M272 125h218l17 12H255l17-12Z" />
                <path d="M283 89h190v36H283z" />
                <path d="M306 54h130l18 19H288l18-19Z" />
              </g>

              <path d="M302 77h139l-10 36H312l-10-36Z" fill="#31c6b8" stroke="#0b3159" strokeWidth="6" strokeLinejoin="round" />
              <g stroke="#0b3159" strokeWidth="5">
                <path d="M334 78v34M367 78v34M400 78v34" />
              </g>

              <g fill="#fffaf0" stroke="#0b3159" strokeWidth="6" strokeLinejoin="round">
                <path d="M524 137h132l-13-18H537l-13 18Z" />
                <path d="M543 119l13-74h67l13 74H543Z" />
              </g>
              <path d="M558 47h63l4 21h-71l4-21Z" fill="#092c52" />
              <path d="M554 72h72" stroke="#31b8b5" strokeWidth="14" />
              <path d="M550 98h80" stroke="#31b8b5" strokeWidth="14" />

              <g fill="none" stroke="#0b3159" strokeWidth="5" strokeLinecap="round">
                <path d="M333 53V15M350 53V29M317 53V35" />
                <circle cx="317" cy="34" r="4" fill="#0b3159" />
              </g>

              <g stroke="#0b3159" strokeWidth="6" strokeLinejoin="round">
                <path d="M691 139h119l-11 27H708l-17-27Z" fill="#ffd43b" />
                <path d="M741 139l26-43 3 43" fill="none" strokeLinecap="round" />
                <circle cx="767" cy="96" r="5" fill="#fffaf0" />
              </g>

              <g className="plannerFerryLoader__flag">
                <path d="M838 132V72" fill="none" stroke="#0b3159" strokeWidth="6" strokeLinecap="round" />
                <circle cx="838" cy="70" r="5" fill="#0b3159" />
                <path d="M842 79c24-9 31 12 58 3-10 20-28 20-58 8V79Z" fill="#ff6f61" stroke="#ef5a4d" strokeWidth="4" strokeLinejoin="round" />
              </g>

              <g fill="#fffaf0" stroke="#0b3159" strokeWidth="6">
                <path d="M108 181l-16 33h29l17-33h-30Z" />
                <path d="M807 181l20 33h29l-18-33h-31Z" />
              </g>
              <path d="M105 188h20l-10 19H96l9-19Z" fill="#31c6b8" />
              <path d="M820 188h18l11 19h-18l-11-19Z" fill="#31c6b8" />

              <g fill="#ffd43b" stroke="#0b3159" strokeWidth="4">
                <rect x="101" y="225" width="13" height="8" rx="1" />
                <rect x="118" y="225" width="13" height="8" rx="1" />
                <rect x="831" y="225" width="13" height="8" rx="1" />
                <rect x="848" y="225" width="13" height="8" rx="1" />
              </g>

              <g fill="none" stroke="#0b3159" strokeWidth="5" strokeLinecap="round">
                <path d="M145 137v-18h620v18" />
                {Array.from({ length: 17 }, (_, index) => 145 + index * 38).map((x) => (
                  <path key={`rail-${x}`} d={`M${x} 119v18`} />
                ))}
              </g>
            </g>
          </svg>
        </div>

        <div className="plannerFerryLoader__bar" aria-hidden="true">
          <span className="plannerFerryLoader__barFill" />
          <span className="plannerFerryLoader__barGlint" />
        </div>
      </div>

    </div>
  );
}
