import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const LOOP = "M19.5 33 C15.5 18, 23 6, 33 6 C43 6, 48.5 15.5, 42 28.5";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#060B1D" }}>
        <svg width="132" height="132" viewBox="0 0 64 64">
          <defs>
            <linearGradient id="r" x1="19" y1="33" x2="42" y2="6" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#1D3FD8" />
              <stop offset="0.45" stopColor="#2F7BF5" />
              <stop offset="1" stopColor="#3EE0F7" />
            </linearGradient>
          </defs>
          {[0, 90, 180, 270].map((d) => (
            <path key={d} d={LOOP} fill="none" stroke="url(#r)" strokeWidth="9.5" strokeLinecap="round" transform={`rotate(${d} 32 32)`} />
          ))}
        </svg>
      </div>
    ),
    size,
  );
}
