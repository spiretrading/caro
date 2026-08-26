const path = require('path');
const webpack = require('webpack');
const PROD = JSON.parse(process.env.PROD_ENV || '0');
function stamp() {
  const now = new Date();
  const pad = value => `${value}`.padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-` +
    `${pad(now.getDate())} ${pad(now.getHours())}:` +
    `${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}
module.exports = {
  devtool: PROD ? false : 'source-map',
  entry: path.resolve(__dirname, 'source/index.tsx'),
  devServer: {
    static: {
      directory: path.resolve(__dirname, 'application')
    },
    port: 8080
  },
  ignoreWarnings: [
    {
      message: /Failed to parse source map/
    }
  ],
  mode: PROD ? 'production' : 'development',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader'
      },
      {
        enforce: 'pre',
        test: /\.js$/,
        loader: 'source-map-loader'
      }
    ]
  },
  output: {
    path: path.resolve(__dirname, 'application'),
    filename: 'bundle.js'
  },
  performance: {
    hints: false
  },
  plugins: [
    new webpack.DefinePlugin({
      BUILD: webpack.DefinePlugin.runtimeValue(
        () => JSON.stringify(stamp()), true)
    })
  ],
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.json']
  }
};
