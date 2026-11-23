import App from './App.svelte'
import { mount } from 'svelte'
import './styles/global.css'
import '@fontsource/bungee/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-700.css'
import '@fontsource/jetbrains-mono/latin-800.css'
import '@fontsource/space-grotesk/latin-500.css'
import '@fontsource/space-grotesk/latin-600.css'
import '@fontsource/space-grotesk/latin-700.css'

const target = document.getElementById('app')

if (target) {
  mount(App, { target })
} else {
  console.error('Sight: could not find mount target #app')
}