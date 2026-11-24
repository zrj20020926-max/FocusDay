import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles.css'
import './parts.css'
import './extras.css'
import './responsive.css'
import './polish.css'
import './detail-polish.css'
import './auth.css'

createApp(App).use(createPinia()).use(router).mount('#app')
