import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

/** Generates the favicon and app icons in public/ from public/logo.svg: `npm run icons`. */
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#15110e' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#15110e' } },
  },
  images: ['public/logo.svg'],
});
