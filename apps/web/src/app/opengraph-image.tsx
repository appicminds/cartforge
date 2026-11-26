import { ImageResponse } from "next/og";

export const alt = "CartForge: make it, sell it, grow it";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The picture shown when the site is shared on social media and in chats. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "radial-gradient(70% 70% at 70% 30%, #5a2410 0%, #111214 70%)",
          color: "#f7f7f5",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              background: "#c2410c",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
              fontWeight: 700,
            }}
          >
            C
          </div>
          <div style={{ fontSize: 40, fontWeight: 600 }}>CartForge</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2 }}>
            Make it. Sell it. Grow it.
          </div>
          <div style={{ fontSize: 32, color: "#b3b5bd" }}>
            Online store, payments and orders in one place.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
