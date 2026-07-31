import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white shadow-sm p-4">
          <h1 className="text-xl font-bold text-gray-900">TTRPG Play-by-Post</h1>
        </header>
        <main className="flex-1 p-4">
          <Routes>
            <Route path="/" element={<div>Lobby (Coming Soon)</div>} />
            <Route path="/channel/:id" element={<div>Channel View (Coming Soon)</div>} />
            <Route path="/settings" element={<div>Settings (Coming Soon)</div>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App