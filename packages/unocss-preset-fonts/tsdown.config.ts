import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
  ],
  noExternal: [
    '@anase/font-cjkfonts-allseto',
    '@anase/font-departure-mono',
    '@anase/font-xiaolai',
  ],
  dts: true,
  sourcemap: true,
})
