import { useEffect, useState } from 'react'
import { Cpu, Keyboard, SlidersHorizontal } from 'lucide-react'
import GeneralTab from './GeneralTab'
import ModelsTab from './ModelsTab'
import ShortcutTab from './ShortcutTab'
import WelcomeBanner from './WelcomeBanner'

type Tab = 'shortcut' | 'models' | 'general'

const TABS: { id: Tab; label: string; icon: typeof Keyboard }[] = [
  { id: 'shortcut', label: 'Atalho', icon: Keyboard },
  { id: 'models', label: 'Modelos', icon: Cpu },
  { id: 'general', label: 'Geral', icon: SlidersHorizontal }
]

const isTab = (value: string): value is Tab => TABS.some((t) => t.id === value)

/** Janela de configurações: a aba inicial vem do hash da URL (o main abre direto em "Modelos" na 1ª vez). */
export default function SettingsApp() {
  const initial = window.location.hash.slice(1)
  const [tab, setTab] = useState<Tab>(isTab(initial) ? initial : 'shortcut')
  // muda quando o aviso de boas-vindas grava a configuração: a aba aberta é remontada e relê
  const [revision, setRevision] = useState(0)

  useEffect(() => window.api.onSettingsTab((next) => isTab(next) && setTab(next)), [])

  return (
    <div className="flex h-full flex-col">
      <WelcomeBanner onAnswered={() => setRevision((r) => r + 1)} />
      <nav className="flex gap-1 border-b border-border px-4 pt-3" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-testid={`tab-${id}`}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === id ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>
      <main key={revision} className="flex-1 overflow-y-auto p-5">
        {tab === 'shortcut' && <ShortcutTab />}
        {tab === 'models' && <ModelsTab />}
        {tab === 'general' && <GeneralTab />}
      </main>
    </div>
  )
}
