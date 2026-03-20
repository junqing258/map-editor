<template>
  <RouterView />
  <Toaster position="top-right" rich-colors />
</template>

<script setup lang="ts">
import { Toaster } from "@/components/ui/sonner";
import { RouterView } from "vue-router";
</script>
