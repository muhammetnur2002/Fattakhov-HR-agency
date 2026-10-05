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
  // Словарь распространённых паролей читается с диска (lib/security/common-passwords.ts), а
  // не импортируется, поэтому трассировка файлов сама его в standalone не положит. Без файла
  // проверка пароля падает на урезанный список (и пишет об этом в журнал).
  outputFileTracingIncludes: {
    '/api/auth/**': ['./lib/security/common-passwords.txt'],
  },
};

export default nextConfig;
