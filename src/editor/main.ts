import './main.css'

import ui from '@nuxt/ui/vue-plugin'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'

createApp(App)
  .use(createPinia())
  .use(ui)
  .mount('#app')
