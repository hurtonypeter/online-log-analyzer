<script lang="ts">
	import { page } from '$app/state';

	const bridgeUrl = page.url.searchParams.get('bridgeUrl');
	console.log('Bridge URL:', bridgeUrl);
</script>
