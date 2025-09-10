<script lang="ts">
	import { page } from '$app/state';

	const bridgeUrl = page.url.searchParams.get('bridgeUrl');
	console.log('Bridge URL:', bridgeUrl);

	interface LogTailing {
		podName: string;
		active: boolean;
	}

	const logTailings: LogTailing[] = $state([
		{ podName: 'pod1', active: false },
		{ podName: 'pod2', active: true },
		{ podName: 'pod3', active: false }
	]);
</script>

{#each logTailings as { podName, active }}
	<div>
		<strong>Pod Name:</strong>
		{podName}
		<strong>Active:</strong>
		{active ? 'Yes' : 'No'}
	</div>
{/each}
