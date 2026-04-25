import ui from '@nuxt/ui/vue-plugin'

import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import './main.css'

createApp(App)
  .use(createPinia())
  .use(ui)
  .mount('#app')
