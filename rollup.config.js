import pkg from './package.json'

import copy from 'rollup-plugin-copy'
import del from 'rollup-plugin-delete'
import zip from 'rollup-plugin-zipdir'

import fs from 'fs'

function builder({ name }) {
  return {
    name: 'build-manager',
    load: () => '',
    resolveId: () => name,
    buildStart() {
      this.emitFile({
        id: name,
        fileName: 'empty.js',
        type: 'chunk'
      })
    },
    generateBundle({ dir }) {
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true })
      }
    }
  }
}

export default {
  output: {
    dir: 'dist',
    format: 'esm'
  },
  plugins: [
    builder({
      name: pkg.name
    }),
    del({
      hook: 'writeBundle',
      targets: [
        'dist/empty.js',
        'build/*.zip'
      ]
    }),
    copy({
      hook: 'generateBundle',
      targets: [
        { src: 'dash-to-plank@hardpixel.eu/*', dest: 'dist' }
      ]
    }),
    process.env.package && zip({
      name: `${pkg.name}-v${pkg.version}.zip`,
      outputDir: 'build'
    })
  ]
}
