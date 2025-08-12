const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
require('dotenv').config();

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
  resolve: {
    fallback: {
      "path": require.resolve("path-browserify"),
      "fs": false
    }
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.FIREBASE_API_KEY': JSON.stringify(process.env.FIREBASE_API_KEY),
      'process.env.FIREBASE_AUTH_DOMAIN': JSON.stringify(process.env.FIREBASE_AUTH_DOMAIN),
      'process.env.FIREBASE_PROJECT_ID': JSON.stringify(process.env.FIREBASE_PROJECT_ID),
      'process.env.FIREBASE_STORAGE_BUCKET': JSON.stringify(process.env.FIREBASE_STORAGE_BUCKET),
      'process.env.FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(process.env.FIREBASE_MESSAGING_SENDER_ID),
      'process.env.FIREBASE_APP_ID': JSON.stringify(process.env.FIREBASE_APP_ID),
      'process.env.OPENAI_API_KEY': JSON.stringify(process.env.OPENAI_API_KEY)
    }),
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: '' },
        { from: 'icons', to: 'icons' },
        { from: 'popup.html', to: '' },
        { from: 'popup.css', to: '' },
        { from: 'content.css', to: '' },
        { from: 'data', to: 'data' },
        { from: 'node_modules/kuromoji/dict', to: 'dict' }
      ]
    })
  ]
};