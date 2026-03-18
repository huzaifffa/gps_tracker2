import path from 'node:path';
import { defineConfig, normalizePath } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const cesiumBaseUrl = 'cesium';
const cesiumSource = 'node_modules/cesium/Build/Cesium';

export default defineConfig({
	define: {
		CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
	},
	resolve: {
		alias: {
			'@zip.js/zip.js/lib/zip-no-worker.js': path.resolve(
				'node_modules/@zip.js/zip.js/lib/zip-wasm.js',
			),
		},
	},
	plugins: [
		viteStaticCopy({
			targets: [
				{
					src: normalizePath(`${cesiumSource}/Workers/**/*`),
					dest: `${cesiumBaseUrl}/Workers`,
				},
				{
					src: normalizePath(`${cesiumSource}/Assets/**/*`),
					dest: `${cesiumBaseUrl}/Assets`,
				},
				{
					src: normalizePath(`${cesiumSource}/ThirdParty/**/*`),
					dest: `${cesiumBaseUrl}/ThirdParty`,
				},
				{
					src: normalizePath(`${cesiumSource}/Widgets/**/*`),
					dest: `${cesiumBaseUrl}/Widgets`,
				},
			],
		}),
	],
});