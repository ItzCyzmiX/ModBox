<script>
    let {dir, changeMCDir} =$props()
</script>

<div class="setting-item">
    <h2>Minecraft Installation</h2>
    <label for="minecraft-path"
        >Minecraft Installation Path:</label
    >
    <div class="path-input">
        <input
            type="text"
            id="minecraft-path"
            class="minecraft-input"
            bind:value={dir}
            readonly
        />
        <button class="filter-button" onclick={changeMCDir}>
            Browse...
        </button>
    </div>
</div>