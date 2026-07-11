export function SwimmingOrcaLoader() {
  return (
    <div className="swimmingOrcaLoader" aria-hidden="true">
      <div className="swimmingOrcaLoader__waterGlow" />
      <div className="swimmingOrcaLoader__route">
        <span className="swimmingOrcaLoader__bubble swimmingOrcaLoader__bubble--one" />
        <span className="swimmingOrcaLoader__bubble swimmingOrcaLoader__bubble--two" />
        <span className="swimmingOrcaLoader__bubble swimmingOrcaLoader__bubble--three" />

        <div className="swimmingOrcaLoader__pitch">
          <svg
            className="swimmingOrcaLoader__orca"
            viewBox="0 0 260 130"
            role="presentation"
            focusable="false"
          >
            <g className="swimmingOrcaLoader__bodyBob">
              <g className="swimmingOrcaLoader__tailStock">
                <path
                  className="swimmingOrcaLoader__darkShape"
                  d="M70 58C56 54 44 50 29 51C36 60 38 68 35 76C33 81 30 85 26 89C42 87 56 82 71 74Z"
                />

                <g className="swimmingOrcaLoader__tailFlukes">
                  <path
                    className="swimmingOrcaLoader__darkShape"
                    d="M34 67C23 57 10 51 1 54C8 64 16 72 27 77C30 73 32 70 34 67Z"
                  />
                  <path
                    className="swimmingOrcaLoader__darkShape"
                    d="M35 70C23 76 11 85 5 96C18 93 29 87 38 77C37 74 36 72 35 70Z"
                  />
                </g>
              </g>

              <path
                className="swimmingOrcaLoader__darkShape swimmingOrcaLoader__body"
                d="M61 68C69 45 98 31 136 29C173 27 208 37 231 53C245 63 248 76 240 86C232 96 209 101 179 101C143 101 105 96 78 85C69 82 63 76 61 68Z"
              />

              <path
                className="swimmingOrcaLoader__darkShape swimmingOrcaLoader__dorsalFin"
                d="M125 32C123 21 126 8 135 3C140 13 143 23 143 31Z"
              />

              <path
                className="swimmingOrcaLoader__whiteShape swimmingOrcaLoader__eyePatch"
                d="M193 47C204 44 214 46 220 52C212 57 201 59 190 57C189 53 190 50 193 47Z"
              />

              <path
                className="swimmingOrcaLoader__whiteShape swimmingOrcaLoader__saddlePatch"
                d="M151 38C162 34 178 34 192 38C181 43 166 46 151 45C148 43 148 40 151 38Z"
              />

              <path
                className="swimmingOrcaLoader__whiteShape swimmingOrcaLoader__bellyPatch"
                d="M129 74C151 79 177 81 204 77C194 90 172 97 146 96C126 95 108 91 96 84C106 79 117 76 129 74Z"
              />

              <path
                className="swimmingOrcaLoader__darkShape swimmingOrcaLoader__pectoralFin"
                d="M158 85C168 96 171 108 166 122C155 113 147 102 145 91Z"
              />

              <circle className="swimmingOrcaLoader__eye" cx="224" cy="61" r="2.2" />
              <path
                className="swimmingOrcaLoader__smile"
                d="M223 74C229 76 235 75 239 72"
              />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
