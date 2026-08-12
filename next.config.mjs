const isProduction = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactCompiler: true,
    output: "standalone",
    poweredByHeader: false,
    // Explicitly configure turbopack as empty to silence the warning
    turbopack: {},
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "X-Frame-Options", value: "DENY" },
                    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
                    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
                    { key: "Cross-Origin-Resource-Policy", value: "same-site" },
                    { key: "Origin-Agent-Cluster", value: "?1" },
                    ...(isProduction
                        ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
                        : []),
                ],
            },
        ];
    },
};

export default nextConfig;
