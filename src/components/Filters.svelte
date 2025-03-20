<script>
    let { selectedVersions, clearFilters } = $props()
</script>

<div class="selected-filters">
    <span
        >Active filters: {selectedVersions.join(", ")}</span
    >
    <button class="clear-button" onclick={clearFilters}
        >CLEAR</button
    >
</div>