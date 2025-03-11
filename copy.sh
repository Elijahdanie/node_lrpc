#!/bin/bash

npx typedoc
cp -r docs/* ../lrpc.github.io

cd ../lrpc.github.io
git add .
git commit -m "update docs"
git push

cd ../lrpc
rm -rf ./docs