#!/usr/bin/env bash
# Copia la función generada para Vercel a una carpeta aislada (sin el
# node_modules del proyecto) y comprueba que arranca y sirve las páginas.
# Así se detectan dependencias que faltan en la función antes de desplegar.
set -euo pipefail
cd "$(dirname "$0")/.."

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -rL .vercel/output/functions/_render.func/. "$tmp"

cd "$tmp"
node --input-type=module -e "
const { default: handler } = await import('./dist/server/entry.mjs');
for (const path of ['/', '/sala/ABCDEF']) {
  const res = await handler.fetch(new Request('https://ejemplo.vercel.app' + path));
  if (res.status !== 200) throw new Error(path + ' devolvió ' + res.status);
  console.log(path, res.status);
}
"
echo "La función de Vercel arranca bien."
