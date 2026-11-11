import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

export const alt = `${BRAND.name} — ${BRAND.descriptor}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LOOP = "M19.5 33 C15.5 18, 23 6, 33 6 C43 6, 48.5 15.5, 42 28.5";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 88, background: "radial-gradient(900px 500px at 80% 30%, #1e3a8a 0%, #060B1D 65%)", color: "#F8FAFC" }}>
        <svg width="120" height="120" viewBox="0 0 64 64">
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
        <div style={{ marginTop: 48, fontSize: 30, letterSpacing: 6, textTransform: "uppercase", color: "#38BDF8" }}>{BRAND.descriptor}</div>
        <div style={{ marginTop: 16, fontSize: 84, fontWeight: 800, letterSpacing: -2 }}>{BRAND.name}</div>
        <div style={{ marginTop: 16, fontSize: 36, color: "#CBD5E1" }}>{BRAND.tagline}</div>
      </div>
    ),
    size,
  );
}
