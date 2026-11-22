import { createRouter, createWebHistory } from 'vue-router'
import TodayView from './views/TodayView.vue'
import TasksView from './views/TasksView.vue'
import FocusView from './views/FocusView.vue'
import StatsView from './views/StatsView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'today', component: TodayView },
    { path: '/tasks', name: 'tasks', component: TasksView },
    { path: '/focus', name: 'focus', component: FocusView },
    { path: '/stats', name: 'stats', component: StatsView },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})
