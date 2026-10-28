// Сборка: src/index.html -> index.html (сжатые CSS и JS внутри страницы)
import { readFileSync, writeFileSync } from 'node:fs';
import { minify } from 'terser';
import { minify as cssmin } from 'csso';
let html = readFileSync('src/index.html', 'utf8');
const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
for (const m of styles) html = html.replace(m[0], '<style>' + cssmin(m[1]).css + '</style>');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
for (const m of scripts) { const out = await minify(m[1], { compress: { passes: 2 }, mangle: true, format: { comments: false } }); html = html.replace(m[0], '<script>' + out.code + '</script>'); }
html = html.replace(/\n\s*\n/g, '\n');
writeFileSync('index.html', html);
console.log('built', readFileSync('src/index.html').length, '->', html.length);
