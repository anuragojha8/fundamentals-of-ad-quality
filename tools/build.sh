#!/usr/bin/env bash
# Deploy build: copy the book, then minify CSS and JS in place.
#
# Minification happens only here, on the way to the CDN. The repo keeps readable
# sources, `python3 tools/serve.py` serves those sources directly, and nothing in
# the project needs node_modules. If esbuild isn't available the build still
# succeeds and simply ships the unminified files.
set -euo pipefail

rm -rf dist && mkdir dist
cp -R index.html chapters assets _redirects dist/

if npx --yes esbuild --version >/dev/null 2>&1; then
  for f in dist/assets/*.js; do
    npx --yes esbuild "$f" --minify --target=es2019 --outfile="$f.min" >/dev/null
    mv "$f.min" "$f"
  done
  for f in dist/assets/*.css; do
    npx --yes esbuild "$f" --minify --outfile="${f%.css}.min.css" >/dev/null
    mv "${f%.css}.min.css" "$f"
  done
  echo "minified $(ls dist/assets/*.js dist/assets/*.css | wc -l | tr -d ' ') files"
else
  echo "esbuild unavailable — shipping readable sources"
fi

du -sh dist >/dev/null
