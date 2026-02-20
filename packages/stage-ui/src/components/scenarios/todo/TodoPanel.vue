<script setup lang="ts">
import type { TodoFilter } from '../../../types/memory'

import { Button, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useTodoModuleStore } from '../../../stores/modules/todo'

const { t } = useI18n()
const todoStore = useTodoModuleStore()
const { filter, filteredTodos, activeCount, completedCount } = storeToRefs(todoStore)

const newTodoTitle = ref('')

const filterOptions: readonly TodoFilter[] = ['all', 'active', 'completed']

function handleAdd() {
  if (!newTodoTitle.value.trim())
    return
  todoStore.addTodo(newTodoTitle.value)
  newTodoTitle.value = ''
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    handleAdd()
  }
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString()
}
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <!-- Header with counts -->
    <div :class="['flex items-center justify-between']">
      <div :class="['flex items-center gap-3']">
        <div :class="['text-sm', 'text-neutral-500']">
          {{ t('settings.pages.todo.active_count', { count: activeCount }) }}
        </div>
        <div
          v-if="completedCount > 0"
          :class="['text-xs', 'text-green-600 dark:text-green-400']"
        >
          {{ t('settings.pages.todo.completed_count', { count: completedCount }) }}
        </div>
      </div>
      <Button
        v-if="completedCount > 0"
        @click="todoStore.clearCompleted()"
      >
        {{ t('settings.pages.todo.clear_completed') }}
      </Button>
    </div>

    <!-- Add todo input -->
    <div :class="['flex gap-2']">
      <div :class="['flex-1']">
        <FieldInput
          v-model="newTodoTitle"
          :placeholder="t('settings.pages.todo.add_placeholder')"
          @keydown="handleKeydown"
        />
      </div>
      <Button @click="handleAdd">
        <div :class="['i-solar:add-circle-bold-duotone', 'text-lg']" />
        {{ t('settings.pages.todo.add') }}
      </Button>
    </div>

    <!-- Filter tabs -->
    <div :class="['flex gap-1.5']">
      <button
        v-for="f in filterOptions"
        :key="f"
        :class="[
          'px-3 py-1.5 rounded-md text-xs',
          'transition-colors',
          filter === f
            ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
            : 'bg-neutral-200 dark:bg-neutral-700',
        ]"
        @click="filter = f"
      >
        {{ t(`settings.pages.todo.filter.${f}`) }}
      </button>
    </div>

    <!-- Todo list -->
    <div
      v-if="filteredTodos.length > 0"
      :class="['flex flex-col gap-2']"
    >
      <div
        v-for="todo in filteredTodos"
        :key="todo.id"
        :class="[
          'flex items-center gap-3',
          'rounded-lg px-4 py-3',
          'bg-neutral-50 dark:bg-neutral-800',
          'transition-all duration-250',
        ]"
      >
        <button
          :class="[
            'w-5 h-5 rounded-full border-2 shrink-0',
            'flex items-center justify-center',
            'transition-colors',
            todo.completed
              ? 'border-green-500 bg-green-500'
              : 'border-neutral-300 dark:border-neutral-600',
          ]"
          @click="todoStore.toggleTodo(todo.id)"
        >
          <div
            v-if="todo.completed"
            :class="['i-solar:check-read-bold', 'text-white text-xs']"
          />
        </button>
        <div :class="['flex-1 min-w-0']">
          <div
            :class="[
              'text-sm',
              todo.completed ? 'line-through text-neutral-400' : '',
            ]"
          >
            {{ todo.title }}
          </div>
          <div :class="['text-xs text-neutral-400 mt-0.5']">
            {{ formatDate(todo.createdAt) }}
          </div>
        </div>
        <button
          :class="[
            'p-1.5 rounded-md shrink-0',
            'text-neutral-500 hover:text-red-500',
            'transition-colors',
          ]"
          @click="todoStore.deleteTodo(todo.id)"
        >
          <div :class="['i-solar:trash-bin-trash-bold-duotone', 'text-base']" />
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else
      :class="[
        'flex flex-col items-center justify-center',
        'py-12 rounded-lg',
        'bg-neutral-50 dark:bg-neutral-800',
        'text-neutral-500',
      ]"
    >
      <div :class="['i-solar:checklist-bold-duotone', 'text-4xl mb-3 opacity-50']" />
      <div :class="['text-sm']">
        {{ t('settings.pages.todo.empty') }}
      </div>
    </div>
  </div>
</template>
