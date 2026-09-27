import App from './App.svelte'
import { mount } from 'svelte'
import './styles/global.css'

const target = document.getElementById('app')

if (target) {
  mount(App, { target })
} else {
  console.error('Sight: could not find mount target #app')
}