/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Отключаем Strict Mode для фикса бага ResizeObserver в DeckGL / luma.gl
};

module.exports = nextConfig;
