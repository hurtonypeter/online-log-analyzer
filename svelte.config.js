import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// Configure for GitHub Pages deployment or bridge deployment
		adapter: adapter({
			pages: process.env.BUILD_FOR_BRIDGE ? 'bridge/static' : 'build',
			assets: process.env.BUILD_FOR_BRIDGE ? 'bridge/static' : 'build',
			fallback: 'index.html',
			precompress: false,
			strict: true
		}),
		paths: {
			base: process.env.NODE_ENV === 'production' && !process.env.BUILD_FOR_BRIDGE ? '/loganalyzer' : ''
		}
	}
};

export default config;
