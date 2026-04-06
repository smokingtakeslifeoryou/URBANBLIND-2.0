/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development', // Отключаем жесткое кэширование при разработке
});

const nextConfig = {
  reactStrictMode: false, // Отключаем Strict Mode для фикса бага ResizeObserver в DeckGL / luma.gl
};

module.exports = withPWA(nextConfig);
