import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        produto: resolve(import.meta.dirname, 'produto.html'),
        politicas: resolve(import.meta.dirname, 'politicas.html'),
        checkout: resolve(import.meta.dirname, 'checkout.html'),
        quemSomos: resolve(import.meta.dirname, 'quem-somos.html'),
        faq: resolve(import.meta.dirname, 'perguntas-frequentes.html'),
        rastreio: resolve(import.meta.dirname, 'rastreio.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
      },
    },
  },
});
