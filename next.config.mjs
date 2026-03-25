import withPWA from "next-pwa";

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactCompiler: true,
    output: "standalone",
    // Explicitly configure turbopack as empty to silence the warning
    turbopack: {},
};

export default withPWA({
    dest: 'public',
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === 'development',
    buildExcludes: [/middleware-manifest\.json$/],
    runtimeCaching: [
        {
            urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
                cacheName: 'google-fonts',
                expiration: {
                    maxEntries: 10,
                    maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
                },
            },
        },
        {
            urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
                cacheName: 'static-image-assets',
                expiration: {
                    maxEntries: 64,
                    maxAgeSeconds: 24 * 60 * 60, // 1 day
                },
            },
        },
        {
            urlPattern: /\/_next\/image\?url=.+$/i,
            handler: 'StaleWhileRevalidate',
            options: {
                cacheName: 'next-image',
                expiration: {
                    maxEntries: 64,
                    maxAgeSeconds: 24 * 60 * 60, // 1 day
                },
            },
        },
        {
            urlPattern: /\.(?:js|css)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
                cacheName: 'static-assets',
                expiration: {
                    maxEntries: 100,
                    maxAgeSeconds: 24 * 60 * 60, // 1 day
                },
            },
        },
        {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkOnly',
            method: 'GET',
        },
        {
            urlPattern: /^https?:\/\/[^/]+\/login(?:\/.*)?$/i,
            handler: 'NetworkOnly',
        },
        {
            urlPattern: /^https?:\/\/[^/]+\/logout(?:\/.*)?$/i,
            handler: 'NetworkOnly',
        },
        {
            urlPattern: /^https?:\/\/[^/]+\/signup(?:\/request)?(?:\/.*)?$/i,
            handler: 'NetworkOnly',
        },
        {
            urlPattern: /^https?:\/\/[^/]+\/(?:me|notifications|report|sites|music)(?:\/.*)?$/i,
            handler: 'NetworkOnly',
        },
        {
            urlPattern: /^https?:\/\/[^/]+\/admin(?:\/.*)?$/i,
            handler: 'NetworkOnly',
        },
        {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkOnly',
            method: 'POST',
        },
        {
            urlPattern: /.*/i,
            handler: 'NetworkFirst',
            options: {
                cacheName: 'public-pages-v2',
                expiration: {
                    maxEntries: 64,
                    maxAgeSeconds: 24 * 60 * 60, // 1 day
                },
                networkTimeoutSeconds: 10,
            },
        },
    ],
})(nextConfig);
