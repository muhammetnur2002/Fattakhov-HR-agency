/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Автономная сборка для контейнера: в .next/standalone попадает сервер
  // и ровно те модули, которые он импортирует. Образ не тянет исходники,
  // dev-зависимости и Prisma CLI. На `next dev` и `next start` не влияет.
  output: 'standalone',
  poweredByHeader: false,
  // Prisma и ioredis тянут нативные бинарники — они не должны попадать
  // в бандл серверных компонентов.
  serverExternalPackages: ['@prisma/client', 'bcrypt', 'ioredis'],
};

export default nextConfig;
