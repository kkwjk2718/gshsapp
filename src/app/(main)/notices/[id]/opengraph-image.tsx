import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function Image({ params }: Props) {
  const { id } = await params;

  const notice = await prisma.notice.findUnique({
    where: { id },
    include: { writer: true },
  });

  const title = notice?.title ?? "공지사항";
  const description = (notice?.content ?? "경남과학고 통합 플랫폼 공지사항")
    .replace(/\s+/g, " ")
    .slice(0, 120);
  const category = notice?.category ?? "공지";
  const author = notice?.writer?.name ?? "GSHS.app";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px",
          background: "#0b0f17",
          color: "#e5e7eb",
          fontFamily: "Pretendard, Noto Sans KR, sans-serif",
        }}
      >
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div
            style={{
              fontSize: 24,
              color: "#9ca3af",
              border: "1px solid #334155",
              borderRadius: 999,
              padding: "8px 16px",
            }}
          >
            GSHS.app
          </div>
          <div
            style={{
              fontSize: 24,
              color: "#60a5fa",
              border: "1px solid #1e3a8a",
              borderRadius: 999,
              padding: "8px 16px",
            }}
          >
            {category}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              color: "#f8fafc",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 30,
              lineHeight: 1.35,
              color: "#94a3b8",
            }}
          >
            {description}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#94a3b8" }}>
          <div>작성자: {author}</div>
          <div>/notices/{id}</div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
