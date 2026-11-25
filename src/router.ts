import { createRouter, createWebHistory } from 'vue-router'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'today', component: () => import('./views/TodayView.vue') },
    { path: '/tasks', name: 'tasks', component: () => import('./views/TasksView.vue') },
    { path: '/focus', name: 'focus', component: () => import('./views/FocusView.vue') },
    { path: '/habits', name: 'habits', component: () => import('./views/HabitsView.vue') },
    { path: '/stats', name: 'stats', component: () => import('./views/StatsView.vue') },
    { path: '/categories', name: 'categories', component: () => import('./views/CategoriesView.vue') },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
    { path: '/account', name: 'account', component: () => import('./views/AuthView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})
