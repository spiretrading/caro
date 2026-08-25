const path = require('path');
const PROD = JSON.parse(process.env.PROD_ENV || '0');
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
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.json']
  }
};
