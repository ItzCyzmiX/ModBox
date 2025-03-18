<script>
	let { search, loading } = $props();
</script>

<div class="load-more-container">
	<button onclick={search} disabled={loading} class="load-more-button">
		<span class="button-text">LOAD MORE MODS</span>
		<!-- <div class="button-animation"></div> -->
	</button>
</div>
