const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development', // 또는 'production'
  entry: {
    content: './src/content.js',
    background: './src/background.js',
    popup: './src/popup.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].bundle.js'
  },
  devtool: false,
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: { presets: ['@babel/preset-env'] }
        }
      }
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: '' },
        { from: 'icons', to: 'icons' },
        { from: 'popup.html', to: '' },
        { from: 'popup.css', to: '' },
        { from: 'content.css', to: '' },
        { from: 'data', to: 'data' }
      ]
    })
  ]
};