import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Layout.css'

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()

  return (
    <div className="layout">
      <header className="layout-header">
        <div className="layout-header-inner">
          <span className="layout-brand">MoneyBalancer</span>
          <nav className="layout-nav">
            <NavLink to="/" end>
              Expenses
            </NavLink>
            <NavLink to="/bills">Monthly Bills</NavLink>
            <NavLink to="/statements">Statements</NavLink>
            <NavLink to="/analysis">Analysis</NavLink>
            <NavLink to="/categories">Categories</NavLink>
          </nav>
          <div className="layout-user">
            <span>{user?.email}</span>
            <button onClick={() => signOut()}>Log out</button>
          </div>
        </div>
      </header>
      <main className="layout-main">{children}</main>
    </div>
  )
}
