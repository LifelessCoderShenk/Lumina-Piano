import React from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './styles/designTokens.css'

const root = document.getElementById('root')

if (root == null) {
  throw new Error('Root element #root was not found.')
}

createRoot(root).render(<App />)
