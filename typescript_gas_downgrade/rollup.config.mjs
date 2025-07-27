import cleanup from 'rollup-plugin-cleanup';
import prettier from 'rollup-plugin-prettier';
import typescript from 'rollup-plugin-typescript2';
import nodeResolve from '@rollup/plugin-node-resolve';
import babel from "@rollup/plugin-babel";

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'esm',
  },
  plugins: [
    cleanup({ comments: 'none', extensions: ['.ts'] }),
    typescript(),
    prettier({ parser: 'typescript' }),
    nodeResolve(),
    babel({
      babelHelpers: 'bundled',
      presets: [
        [
          '@babel/preset-env',
          {
            targets: {
              node: '14.21'
            },
          }
        ]
      ]
    }),
  ],
  context: 'this',
};
