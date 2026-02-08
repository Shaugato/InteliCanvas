<script setup lang="ts">
import { computed } from "vue";
import type { SceneObject } from "@shared/scene";
import { Layers } from "lucide-vue-next";
import { wsStore } from "../state/wsStore";

const props = defineProps<{
  selectedObjectId: string | null;
}>();

const emit = defineEmits<{
  (e: "select", id: string | null): void;
}>();

const orderedObjects = computed(() =>
  wsStore.scene.order
    .map((id) => wsStore.scene.objects[id])
    .filter((obj): obj is SceneObject => Boolean(obj)),
);

function labelFor(obj: SceneObject, index: number): string {
  const tag = obj.semanticTag?.trim();
  if (tag && tag.length > 0) {
    return `${capitalize(tag)} ${index + 1}`;
  }
  return `Object ${index + 1}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function layerColor(layer: SceneObject["layer"]): string {
  switch (layer) {
    case "sky":
      return "#D97706";
    case "background":
      return "#0F766E";
    case "ground":
      return "#16A34A";
    case "foreground":
      return "#115E59";
    default:
      return "#6D768E";
  }
}

function toggleSelection(id: string): void {
  emit("select", props.selectedObjectId === id ? null : id);
}
</script>

<template>
  <section class="panel">
    <div class="head">
      <h2 class="title">
        <Layers :size="14" />
        Layers / Objects
      </h2>
      <span class="count">{{ orderedObjects.length }}</span>
    </div>

    <div v-if="orderedObjects.length === 0" class="empty">
      Scene layers will appear here as objects are added.
    </div>

    <div v-else class="list">
      <button
        v-for="(obj, index) in orderedObjects"
        :key="obj.id"
        type="button"
        class="row"
        :class="{ selected: selectedObjectId === obj.id }"
        @click="toggleSelection(obj.id)"
      >
        <span class="dot" :style="{ backgroundColor: layerColor(obj.layer) }" />

        <span class="content">
          <span class="name">{{ labelFor(obj, index) }}</span>
          <span class="meta">
            {{ obj.layer }} - {{ obj.status }} - {{ obj.shapes.length }} shape{{ obj.shapes.length === 1 ? "" : "s" }}
          </span>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  color: var(--text-muted);
  font-size: 11px;
  background: rgba(255, 255, 255, 0.56);
}

.empty {
  border: 1px dashed var(--panel-border);
  border-radius: 14px;
  padding: 16px;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
  background: rgba(255, 255, 255, 0.54);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  min-height: 0;
  padding-right: 2px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.7);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 7px 16px rgba(17, 24, 39, 0.08);
}

.row:hover {
  transform: translateY(-1px);
  border-color: rgba(15, 118, 110, 0.28);
  background: rgba(15, 118, 110, 0.08);
}

.row.selected {
  border-color: rgba(15, 118, 110, 0.5);
  background: rgba(15, 118, 110, 0.12);
  box-shadow: 0 0 0 1px rgba(15, 118, 110, 0.32), 0 10px 20px rgba(17, 24, 39, 0.1);
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: 0 0 9px;
  box-shadow: 0 0 0 1px rgba(17, 24, 39, 0.14);
}

.content {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.name {
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
