import App from './App.svelte'
import './styles/global.css'

const target = document.getElementById('app')

if (target) {
  new App({ target })
} else {
  console.error('Sight: could not find mount target #app')
}