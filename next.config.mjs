/** @type {import('next').NextConfig} */
const nextConfig = {
  // mongoose 와 mongodb-memory-server 는 번들링하지 않고 런타임 require 로 남긴다.
  // 특히 mongodb-memory-server 는 devDependency 라 번들에 포함되면 빌드가 깨진다.
  serverExternalPackages: ['mongoose', 'mongodb-memory-server'],
  // Playwright 가 127.0.0.1 로 접근하므로 dev 모드 교차 출처 경고를 없앤다.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
}

export default nextConfig
