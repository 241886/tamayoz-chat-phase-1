/** @type {import('next').NextConfig} */
const isMobileExport = process.env.MOBILE_EXPORT === "true";

const nextConfig = {
  reactStrictMode: true,
  ...(isMobileExport
    ? {
        output: "export",
        trailingSlash: true,
        images: {
          unoptimized: true
        }
      }
    : {})
};

export default nextConfig;
